/**
 * Bot query operations — list all bots, get a single bot.
 * Extracted from discordManager.js — single responsibility.
 */
const { dbAll, dbGet } = require('../../db/database');
const { clients } = require('./state');

/**
 * List all bots with their assigned server IDs and online status.
 * @returns {Promise<Array<{id: number, guildId: string, enabled: boolean, online: boolean, username: string, avatar: string, serverIds: number[], createdAt: string}>>}
 */
async function listBots() {
    const bots = await dbAll('SELECT * FROM discord_bots ORDER BY created_at DESC');
    const result = [];
    for (const bot of bots) {
        const servers = await dbAll(
            'SELECT server_id FROM discord_bot_servers WHERE bot_id = ?', [bot.id]
        );
        const client = clients.get(bot.id.toString());
        result.push({
            id: bot.id,
            guildId: bot.guild_id,
            enabled: !!bot.enabled,
            online: client ? client.isReady() : false,
            username: bot.bot_username,
            avatar: bot.bot_avatar,
            serverIds: servers.map(s => s.server_id),
            createdAt: bot.created_at
        });
    }
    return result;
}

/**
 * Get a single bot by ID.
 * @param {number} botId
 * @returns {Promise<object|null>}
 */
async function getBot(botId) {
    const bot = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
    if (!bot) return null;
    const servers = await dbAll(
        'SELECT server_id FROM discord_bot_servers WHERE bot_id = ?', [botId]
    );
    const client = clients.get(botId.toString());
    return {
        id: bot.id,
        guildId: bot.guild_id,
        enabled: !!bot.enabled,
        online: client ? client.isReady() : false,
        username: bot.bot_username,
        avatar: bot.bot_avatar,
        serverIds: servers.map(s => s.server_id),
        createdAt: bot.created_at
    };
}

module.exports = { listBots, getBot };
