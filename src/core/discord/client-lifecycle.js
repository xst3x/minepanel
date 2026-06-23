/**
 * Bot lifecycle management — start/stop individual bots and bulk operations.
 * Extracted from discordManager.js — single responsibility.
 */
const { Client, GatewayIntentBits, Events } = require('discord.js');
const commands = require('./commands');
const { clients, integrationMap } = require('./state');
const { provisionIfNeeded } = require('./provisioner');
const { registerCommands } = require('./command-registrar');
const eventBridge = require('./discordEventBridge');
const { encrypt, decrypt, decryptAndDetect } = require('../utils/encryption');
const { dbAll, dbRun, dbGet } = require('../../db/database');
const logger = require('../utils/logger');
const { handleInteraction } = require('./interactions');

/**
 * Boot all enabled bots from the database.
 */
async function startAll() {
    try {
        const bots = await dbAll('SELECT * FROM discord_bots WHERE enabled = 1');
        logger.info(`[Discord] Found ${bots.length} enabled bot(s).`);
        for (const bot of bots) {
            try { await startBot(bot); }
            catch (e) { logger.error(`[Discord] Failed to start bot ${bot.id}:`, e.message); }
        }
    } catch (e) {
        logger.error('[Discord] Failed to load bots:', e.message);
    }
}

/**
 * Start a single bot: decrypt token, create client, login, provision servers, register commands.
 * @param {object} bot Bot row from discord_bots table
 */
async function startBot(bot) {
    const botId = bot.id.toString();
    await stopBot(botId);

    let token;
    let migrated = false;
    try {
        const res = decryptAndDetect(bot.bot_token_encrypted);
        token = res.decrypted;
        migrated = res.migrated;
    } catch (e) {
        throw new Error('Failed to decrypt bot token. The encryption key may have changed.');
    }

    if (migrated) {
        try {
            const reEncrypted = encrypt(token);
            await dbRun(
                'UPDATE discord_bots SET bot_token_encrypted = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [reEncrypted, bot.id]
            );
            logger.info(`[Discord] Re-encrypted token for bot ${botId} using the new JWT_SECRET.`);
        } catch (err) {
            logger.error(`[Discord] Failed to re-encrypt token for bot ${botId}:`, err.message);
        }
    }

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });

    client.commands = commands;
    clients.set(botId, client);

    // Wait for ClientReady to complete provisioning + command registration
    const readyPromise = new Promise((resolve) => {
        client.once(Events.ClientReady, async () => {
            logger.info(`[Discord] Bot ${botId} ready as ${client.user.tag}`);

            // Load all servers this bot manages
            const botServers = await dbAll(
                'SELECT server_id FROM discord_bot_servers WHERE bot_id = ?', [botId]
            );

            for (const { server_id } of botServers) {
                try {
                    await provisionIfNeeded(client, token, bot, server_id);
                } catch (e) {
                    logger.error(`[Discord] Setup error for bot ${botId} server ${server_id}:`, e.message);
                }
            }

            // Register commands for this guild
            try {
                await registerCommands(token, client.user.id, bot.guild_id);
            } catch (e) {
                logger.error(`[Discord] Failed to register commands for bot ${botId}:`, e.message);
            }

            resolve();
        });
    });

    // Handle guild join events after client is ready
    client.on(Events.GuildCreate, async (guild) => {
        if (!client.isReady()) return;

        logger.info(`[Discord] Bot ${botId} joined guild: ${guild.name} (${guild.id})`);
        try {
            await registerCommands(token, client.user.id, guild.id);
        } catch (e) {
            logger.error(`[Discord] Failed to register commands for bot ${botId} on guild join:`, e.message);
        }

        if (guild.id === bot.guild_id) {
            const botServers = await dbAll(
                'SELECT server_id FROM discord_bot_servers WHERE bot_id = ?', [botId]
            );
            for (const { server_id } of botServers) {
                try {
                    await dbRun(
                        'UPDATE discord_integrations SET provisioned = 0 WHERE bot_id = ? AND server_id = ?',
                        [bot.id, server_id]
                    );
                    await provisionIfNeeded(client, token, bot, server_id);
                    logger.info(`[Discord] Auto-initialized channels for server ${server_id} on guild join`);
                } catch (e) {
                    logger.error(`[Discord] Auto-init error for server ${server_id} on guild join:`, e.message);
                }
            }
        }
    });

    // Set up interaction handler (delegates to interactions module at runtime)
    client.on(Events.InteractionCreate, async (interaction) => {
        await handleInteraction(interaction, botId, client);
    });

    client.on('error', (err) => {
        logger.error(`[Discord] Client error for bot ${botId}:`, err.message);
    });

    await client.login(token);
    await readyPromise;
}

/**
 * Stop a single bot: detach bridges, destroy client.
 * @param {string|number} botId
 */
async function stopBot(botId) {
    const bid = botId.toString();

    // Detach all bridges for this bot's servers
    for (const [key] of integrationMap) {
        if (key.startsWith(`${bid}_`)) {
            const serverId = key.split('_')[1];
            eventBridge.detach(`${bid}_${serverId}`);
            integrationMap.delete(key);
        }
    }

    const client = clients.get(bid);
    if (client) {
        try { client.destroy(); } catch (_) { }
        clients.delete(bid);
        logger.info(`[Discord] Bot ${bid} stopped`);
    }
}

/**
 * Destroy all bots and bridges.
 */
async function destroyAll() {
    eventBridge.detachAll();
    for (const [botId, client] of clients) {
        try { client.destroy(); } catch (_) { }
    }
    clients.clear();
    integrationMap.clear();
}

module.exports = { startAll, startBot, stopBot, destroyAll };
