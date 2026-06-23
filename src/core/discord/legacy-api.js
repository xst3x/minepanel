/**
 * Legacy single-bot API — backwards-compatible methods for per-server Discord tabs.
 * Extracted from discordManager.js — single responsibility.
 */
const { Client, GatewayIntentBits } = require('discord.js');
const { clients, integrationMap } = require('./state');
const { startBot } = require('./client-lifecycle');
const { validateToken, createBot, deleteBot, toggleBot, reprovisionServer } = require('./crud');
const { provisionIfNeeded } = require('./provisioner');
const { encrypt, decrypt } = require('../utils/encryption');
const { dbAll, dbRun, dbGet } = require('../../db/database');
const eventBridge = require('./discordEventBridge');
const { deprovisionGuild } = require('./discordProvisioner');
const logger = require('../utils/logger');

/**
 * Get Discord status for a server (legacy single-bot API).
 * @param {number|string} serverId
 * @returns {Promise<object|null>}
 */
async function getStatusForServer(serverId) {
    const row = await dbGet(
        'SELECT b.*, i.* FROM discord_bots b ' +
        'JOIN discord_bot_servers bs ON bs.bot_id = b.id ' +
        'LEFT JOIN discord_integrations i ON i.bot_id = b.id AND i.server_id = bs.server_id ' +
        'WHERE bs.server_id = ? LIMIT 1',
        [serverId]
    );
    if (!row) return null;

    const client = clients.get(row.bot_id?.toString() || row.id?.toString());
    const isOnline = client && client.isReady();

    return {
        connected: true,
        serverId: parseInt(serverId),
        guildId: row.guild_id,
        enabled: !!row.enabled,
        provisioned: !!row.provisioned,
        botOnline: isOnline,
        botUser: isOnline ? {
            id: client.user.id,
            username: client.user.username,
            avatar: client.user.displayAvatarURL()
        } : null,
        channels: {
            console: row.console_channel_id,
            commands: row.log_channel_id,
            status: row.status_channel_id
        },
        roles: {
            admin: row.admin_role_id,
            moderator: row.viewer_role_id
        }
    };
}

/** Alias for getStatusForServer */
async function getStatus(serverId) {
    return getStatusForServer(serverId);
}

/**
 * Connect a bot to a server (legacy single-bot API).
 * Creates a bot if one doesn't exist, or reuses existing.
 */
async function connect(serverId, botToken, guildId) {
    const botUser = await validateToken(botToken);

    let bot = await dbGet('SELECT * FROM discord_bots WHERE bot_user_id = ? AND guild_id = ?', [botUser.id, guildId]);

    let botId;
    if (!bot) {
        const res = await createBot(botToken, guildId, [serverId]);
        botId = res.botId;
    } else {
        botId = bot.id;
        await dbRun('INSERT OR IGNORE INTO discord_bot_servers (bot_id, server_id) VALUES (?, ?)', [botId, serverId]);
        await dbRun('UPDATE discord_bots SET enabled = 1 WHERE id = ?', [botId]);
        const fresh = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
        await startBot(fresh);
    }

    return { success: true, botId };
}

/**
 * Disconnect a bot from a server (legacy single-bot API).
 * Deprovisions channels/roles and removes associations.
 */
async function disconnect(serverId) {
    const sid = serverId.toString();
    const row = await dbGet('SELECT bot_id FROM discord_bot_servers WHERE server_id = ? LIMIT 1', [serverId]);
    if (!row) return { success: true };

    const botId = row.bot_id;
    const bid = botId.toString();

    let client = clients.get(bid);
    let tempClient = null;

    const bot = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
    if (bot && (!client || !client.isReady())) {
        try {
            const token = decrypt(bot.bot_token_encrypted);
            tempClient = new Client({ intents: [GatewayIntentBits.Guilds] });
            await tempClient.login(token);
            client = tempClient;
        } catch (err) {
            logger.error(`[Discord] Failed to start temp client for deprovisioning during disconnect:`, err.message);
        }
    }

    let integ = integrationMap.get(`${bid}_${sid}`);
    if (!integ) {
        integ = await dbGet('SELECT * FROM discord_integrations WHERE bot_id = ? AND server_id = ?', [botId, sid]);
    }

    if (client && client.isReady() && integ && integ.provisioned) {
        try {
            await deprovisionGuild(client, integ.guild_id, {
                adminRoleId: integ.admin_role_id,
                viewerRoleId: integ.viewer_role_id,
                categoryId: integ.category_id,
                logChannelId: integ.log_channel_id,
                consoleChannelId: integ.console_channel_id,
                statusChannelId: integ.status_channel_id
            });
        } catch (e) {
            logger.error(`[Discord] Deprovision failed during disconnect:`, e.message);
        }
    }

    if (tempClient) {
        try { tempClient.destroy(); } catch (_) { }
    }

    eventBridge.detach(`${bid}_${sid}`);
    integrationMap.delete(`${bid}_${sid}`);

    await dbRun('DELETE FROM discord_bot_servers WHERE bot_id = ? AND server_id = ?', [botId, serverId]);
    await dbRun('DELETE FROM discord_integrations WHERE bot_id = ? AND server_id = ?', [botId, serverId]);

    // If no servers left, delete the bot; otherwise restart
    const otherServers = await dbAll('SELECT 1 FROM discord_bot_servers WHERE bot_id = ?', [botId]);
    if (otherServers.length === 0) {
        await deleteBot(botId);
    } else {
        const fresh = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
        await startBot(fresh);
    }

    return { success: true };
}

/**
 * Toggle Discord integration enabled/disabled for a server.
 */
async function toggleEnabled(serverId, enabled) {
    const row = await dbGet('SELECT bot_id FROM discord_bot_servers WHERE server_id = ? LIMIT 1', [serverId]);
    if (!row) throw new Error('No bot integration associated with this server.');
    await toggleBot(row.bot_id, enabled);
}

/**
 * Reprovision (re-create) Discord channels/roles for a server.
 */
async function reprovision(serverId) {
    const row = await dbGet('SELECT bot_id FROM discord_bot_servers WHERE server_id = ? LIMIT 1', [serverId]);
    if (!row) throw new Error('No bot integration associated with this server.');
    return reprovisionServer(row.bot_id, serverId);
}

module.exports = { getStatusForServer, getStatus, connect, disconnect, toggleEnabled, reprovision };
