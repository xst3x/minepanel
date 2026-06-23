/**
 * CRUD operations for Discord bots — create, read, update, delete, toggle, reprovision.
 * Extracted from discordManager.js — single responsibility.
 */
const { Client, GatewayIntentBits } = require('discord.js');
const { clients, integrationMap } = require('./state');
const { startBot, stopBot } = require('./client-lifecycle');
const { provisionIfNeeded } = require('./provisioner');
const { encrypt, decrypt } = require('../utils/encryption');
const { dbAll, dbRun, dbGet } = require('../../db/database');
const eventBridge = require('./discordEventBridge');
const { deprovisionGuild } = require('./discordProvisioner');
const logger = require('../utils/logger');

/**
 * Validate a bot token by attempting to log in.
 * @param {string} botToken
 * @returns {Promise<{id: string, username: string, discriminator: string, avatar: string}>}
 */
async function validateToken(botToken) {
    const tempClient = new Client({ intents: [GatewayIntentBits.Guilds] });
    try {
        await tempClient.login(botToken);
        const user = {
            id: tempClient.user.id,
            username: tempClient.user.username,
            discriminator: tempClient.user.discriminator,
            avatar: tempClient.user.displayAvatarURL()
        };
        tempClient.destroy();
        return user;
    } catch (e) {
        tempClient.destroy();
        throw new Error('Invalid bot token');
    }
}

/**
 * Create a new bot, assign servers, and start it.
 * @param {string} botToken
 * @param {string} guildId
 * @param {number[]} [serverIds]
 * @returns {Promise<{success: boolean, botId: number, bot: object}>}
 */
async function createBot(botToken, guildId, serverIds = []) {
    const botUser = await validateToken(botToken);
    const encryptedToken = encrypt(botToken);

    const result = await dbRun(
        `INSERT INTO discord_bots (bot_token_encrypted, guild_id, bot_user_id, bot_username, bot_avatar, enabled)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [encryptedToken, guildId, botUser.id, botUser.username, botUser.avatar]
    );

    const botId = result.lastID;

    for (const serverId of serverIds) {
        await dbRun(
            'INSERT OR IGNORE INTO discord_bot_servers (bot_id, server_id) VALUES (?, ?)',
            [botId, serverId]
        );
    }

    const bot = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
    await startBot(bot);

    return { success: true, botId, bot: botUser };
}

/**
 * Update a bot's token, guild ID, and/or server assignments.
 * @param {number} botId
 * @param {{ botToken?: string, guildId?: string, serverIds?: number[] }} data
 * @returns {Promise<{success: boolean}>}
 */
async function updateBot(botId, { botToken, guildId, serverIds } = {}) {
    const bid = botId.toString();
    const existing = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
    if (!existing) throw new Error('Bot not found');

    let updates = [];
    let params = [];

    if (botToken) {
        const botUser = await validateToken(botToken);
        updates.push('bot_token_encrypted = ?', 'bot_user_id = ?', 'bot_username = ?', 'bot_avatar = ?');
        params.push(encrypt(botToken), botUser.id, botUser.username, botUser.avatar);
    }

    if (guildId) {
        updates.push('guild_id = ?');
        params.push(guildId);
    }

    if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(botId);
        await dbRun(
            `UPDATE discord_bots SET ${updates.join(', ')} WHERE id = ?`,
            params
        );
    }

    if (serverIds !== undefined) {
        const oldAssignments = await dbAll(
            'SELECT server_id FROM discord_bot_servers WHERE bot_id = ?', [botId]
        );
        const oldIds = oldAssignments.map(r => r.server_id);
        const newIds = serverIds.map(Number);
        const removed = oldIds.filter(id => !newIds.includes(id));
        const added = newIds.filter(id => !oldIds.includes(id));

        let client = clients.get(bid);
        let tempClient = null;
        if (removed.length > 0 && (!client || !client.isReady())) {
            try {
                const token = decrypt(existing.bot_token_encrypted);
                tempClient = new Client({ intents: [GatewayIntentBits.Guilds] });
                await tempClient.login(token);
                client = tempClient;
            } catch (err) {
                logger.error(`[Discord] Failed to start temp client for deprovisioning:`, err.message);
            }
        }

        for (const sid of removed) {
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
                    logger.error(`[Discord] Deprovision failed for server ${sid} during update:`, e.message);
                }
            }
            eventBridge.detach(`${bid}_${sid}`);
            integrationMap.delete(`${bid}_${sid}`);
            await dbRun('DELETE FROM discord_bot_servers WHERE bot_id = ? AND server_id = ?', [botId, sid]);
            await dbRun('DELETE FROM discord_integrations WHERE bot_id = ? AND server_id = ?', [botId, sid]);
        }

        if (tempClient) {
            try { tempClient.destroy(); } catch (_) { }
        }

        for (const sid of added) {
            await dbRun(
                'INSERT OR IGNORE INTO discord_bot_servers (bot_id, server_id) VALUES (?, ?)',
                [botId, sid]
            );
        }

        // Re-provision all assigned servers
        client = clients.get(bid);
        if (client && client.isReady()) {
            let token;
            try { token = decrypt(existing.bot_token_encrypted); } catch (_) { }
            const freshBot = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
            const botServers = await dbAll(
                'SELECT server_id FROM discord_bot_servers WHERE bot_id = ?', [botId]
            );
            for (const { server_id } of botServers) {
                try {
                    await dbRun(
                        'UPDATE discord_integrations SET provisioned = 0 WHERE bot_id = ? AND server_id = ?',
                        [botId, server_id]
                    );
                    await provisionIfNeeded(client, token, freshBot, server_id);
                    logger.info(`[Discord] Auto-provisioned channels for server ${server_id}`);
                } catch (e) {
                    logger.error(`[Discord] Auto-provision error for server ${server_id}:`, e.message);
                }
            }
        }
    }

    if (botToken || guildId) {
        const fresh = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
        await startBot(fresh);
    }

    return { success: true };
}

/**
 * Delete a bot entirely: deprovision all servers, leave guild, stop bot, remove DB rows.
 * @param {number} botId
 * @returns {Promise<{success: boolean}>}
 */
async function deleteBot(botId) {
    const bid = botId.toString();
    const bot = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
    if (!bot) throw new Error('Bot not found');

    // Deprovision all servers
    const botServers = await dbAll(
        'SELECT server_id FROM discord_bot_servers WHERE bot_id = ?', [botId]
    );
    let client = clients.get(bid);
    let tempClient = null;

    if (botServers.length > 0 && (!client || !client.isReady())) {
        try {
            const token = decrypt(bot.bot_token_encrypted);
            tempClient = new Client({ intents: [GatewayIntentBits.Guilds] });
            await tempClient.login(token);
            client = tempClient;
        } catch (err) {
            logger.error(`[Discord] Failed to start temp client for deprovisioning during bot deletion:`, err.message);
        }
    }

    for (const { server_id } of botServers) {
        let integ = integrationMap.get(`${bid}_${server_id}`);
        if (!integ) {
            integ = await dbGet('SELECT * FROM discord_integrations WHERE bot_id = ? AND server_id = ?', [botId, server_id]);
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
                logger.error(`[Discord] Deprovision failed for server ${server_id} during bot delete:`, e.message);
            }
        }
    }

    // Leave the guild after deprovisioning
    if (client && client.isReady() && bot.guild_id) {
        try {
            const guild = await client.guilds.fetch(bot.guild_id);
            if (guild) {
                await guild.leave();
                logger.info(`[Discord] Bot ${botId} left guild ${guild.name} (${bot.guild_id})`);
            }
        } catch (err) {
            logger.error(`[Discord] Failed to leave guild ${bot.guild_id}:`, err.message);
        }
    }

    if (tempClient) {
        try { tempClient.destroy(); } catch (_) { }
    }

    await stopBot(bid);

    await dbRun('DELETE FROM discord_bots WHERE id = ?', [botId]);
    await dbRun('DELETE FROM discord_bot_servers WHERE bot_id = ?', [botId]);
    await dbRun('DELETE FROM discord_integrations WHERE bot_id = ?', [botId]);

    return { success: true };
}

/**
 * Toggle a bot's enabled state.
 * @param {number} botId
 * @param {boolean} enabled
 */
async function toggleBot(botId, enabled) {
    await dbRun(
        'UPDATE discord_bots SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [enabled ? 1 : 0, botId]
    );
    if (enabled) {
        const bot = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
        if (bot) await startBot(bot);
    } else {
        await stopBot(botId.toString());
    }
}

/**
 * Reprovision channels/roles for a specific server under a bot.
 * @param {number} botId
 * @param {number} serverId
 * @returns {Promise<{success: boolean}>}
 */
async function reprovisionServer(botId, serverId) {
    const bid = botId.toString();
    await dbRun(
        'UPDATE discord_integrations SET provisioned = 0 WHERE bot_id = ? AND server_id = ?',
        [botId, serverId]
    );
    const bot = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
    const client = clients.get(bid);
    if (!bot || !client) throw new Error('Bot not running');

    const token = decrypt(bot.bot_token_encrypted);
    await provisionIfNeeded(client, token, bot, serverId);
    return { success: true };
}

module.exports = { validateToken, createBot, updateBot, deleteBot, toggleBot, reprovisionServer };
