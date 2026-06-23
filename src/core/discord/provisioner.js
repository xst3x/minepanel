/**
 * Discord guild provisioning — manages channel/role creation per server per bot.
 * Extracted from discordManager.js — single responsibility.
 */
const { dbAll, dbRun, dbGet } = require('../../db/database');
const { clients, integrationMap } = require('./state');
const { getServer } = require('../serverHelper');
const { provisionGuild, deprovisionGuild } = require('./discordProvisioner');
const eventBridge = require('./discordEventBridge');
const logger = require('../utils/logger');

/**
 * Provision channels/roles for a server under a bot if not already provisioned.
 * Caches integration and starts the event bridge.
 * @param {import('discord.js').Client} client
 * @param {string} token
 * @param {object} bot
 * @param {number|string} serverId
 */
async function provisionIfNeeded(client, token, bot, serverId) {
    const botId = bot.id.toString();
    const sid = serverId.toString();

    let integration = await dbGet(
        'SELECT * FROM discord_integrations WHERE bot_id = ? AND server_id = ?',
        [bot.id, serverId]
    );

    if (!integration) {
        // Check if there is a legacy integration row with NULL/empty bot_id for this server
        const legacy = await dbGet(
            'SELECT * FROM discord_integrations WHERE server_id = ? AND (bot_id IS NULL OR bot_id = 0)',
            [serverId]
        );

        if (legacy) {
            // Update it to belong to this bot
            await dbRun(
                'UPDATE discord_integrations SET bot_id = ? WHERE id = ?',
                [bot.id, legacy.id]
            );
            integration = await dbGet(
                'SELECT * FROM discord_integrations WHERE id = ?',
                [legacy.id]
            );
        } else {
            // Create stub row
            try {
                await dbRun(
                    `INSERT OR IGNORE INTO discord_integrations (bot_id, server_id, guild_id, provisioned, bot_token_encrypted)
                     VALUES (?, ?, ?, 0, '')`,
                    [bot.id, serverId, bot.guild_id]
                );
            } catch (_err) {
                await dbRun(
                    `INSERT OR IGNORE INTO discord_integrations (bot_id, server_id, guild_id, provisioned)
                     VALUES (?, ?, ?, 0)`,
                    [bot.id, serverId, bot.guild_id]
                );
            }

            integration = await dbGet(
                'SELECT * FROM discord_integrations WHERE bot_id = ? AND server_id = ?',
                [botId, serverId]
            );

            if (!integration) {
                // Old schema with UNIQUE on server_id — row may exist for a different bot
                const existingRow = await dbGet(
                    'SELECT * FROM discord_integrations WHERE server_id = ?',
                    [serverId]
                );
                if (existingRow) {
                    await dbRun(
                        'UPDATE discord_integrations SET bot_id = ? WHERE id = ?',
                        [bot.id, existingRow.id]
                    );
                    integration = await dbGet(
                        'SELECT * FROM discord_integrations WHERE id = ?',
                        [existingRow.id]
                    );
                }
            }
        }
    }

    if (!integration.provisioned) {
        const server = await getServer(parseInt(serverId));
        const serverName = server ? server.name : `Server ${serverId}`;
        const resources = await provisionGuild(client, bot.guild_id, serverName, integration);

        await dbRun(
            `UPDATE discord_integrations SET
                admin_role_id = ?, viewer_role_id = ?, category_id = ?,
                log_channel_id = ?, console_channel_id = ?, status_channel_id = ?,
                guild_id = ?, provisioned = 1, updated_at = CURRENT_TIMESTAMP
            WHERE bot_id = ? AND server_id = ?`,
            [
                resources.adminRoleId, resources.viewerRoleId, resources.categoryId,
                resources.logChannelId, resources.consoleChannelId, resources.statusChannelId,
                bot.guild_id, botId, serverId
            ]
        );

        integration = await dbGet(
            'SELECT * FROM discord_integrations WHERE bot_id = ? AND server_id = ?',
            [botId, serverId]
        );
    }

    // Cache and start bridge using composite key botId_serverId
    integrationMap.set(`${botId}_${sid}`, integration);
    eventBridge.attach(`${botId}_${sid}`, client, integration, sid);
}

module.exports = { provisionIfNeeded };
