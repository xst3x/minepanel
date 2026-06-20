/**
 * Discord Bot Manager — suportă multiple boți, fiecare cu acces la servere selectate.
 *
 * Schema:
 *   discord_bots          — un bot Discord (token, guild_id, enabled, metadata)
 *   discord_bot_servers   — ce servere gestionează fiecare bot (many-to-many)
 *   discord_integrations  — stochează IDs de roluri/canale per server per bot
 */

const { Client, GatewayIntentBits, REST, Routes, Events } = require('discord.js');
const commands = require('./commands');
const { provisionGuild, deprovisionGuild } = require('./discordProvisioner');
const eventBridge = require('./discordEventBridge');
const { encrypt, decrypt, decryptAndDetect } = require('../utils/encryption');
const { dbAll, dbRun, dbGet } = require('../../db/database');
const processManager = require('../processManager');
const { getServer } = require('../serverHelper');
const liveSessionMgr = require('./liveSessionManager');
const logger = require('../utils/logger');

class DiscordManager {
    constructor() {
        /**
         * Map: `${botId}` → discord.js Client
         * @type {Map<string, import('discord.js').Client>}
         */
        this.clients = new Map();

        /**
         * Map: `${botId}_${serverId}` → integration row
         * Used for fast lookup in interaction/button handlers
         * @type {Map<string, object>}
         */
        this.integrationMap = new Map();
    }

    // ─── Boot ────────────────────────────────────────────────────────────────

    async startAll() {
        try {
            const bots = await dbAll('SELECT * FROM discord_bots WHERE enabled = 1');
            logger.info(`[Discord] Found ${bots.length} enabled bot(s).`);
            for (const bot of bots) {
                try { await this.startBot(bot); }
                catch (e) { logger.error(`[Discord] Failed to start bot ${bot.id}:`, e.message); }
            }
        } catch (e) {
            logger.error('[Discord] Failed to load bots:', e.message);
        }
    }

    // ─── Start a bot ─────────────────────────────────────────────────────────

    async startBot(bot) {
        const botId = bot.id.toString();

        await this.stopBot(botId);

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

        // Store the client immediately so it's accessible during ClientReady
        this.clients.set(botId, client);

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
                        await this._provisionIfNeeded(client, token, bot, server_id);
                    } catch (e) {
                        logger.error(`[Discord] Setup error for bot ${botId} server ${server_id}:`, e.message);
                    }
                }

                // Register commands for this guild
                try {
                    await this._registerCommands(token, client.user.id, bot.guild_id);
                } catch (e) {
                    logger.error(`[Discord] Failed to register commands for bot ${botId}:`, e.message);
                }

                resolve();
            });
        });

        // Register commands and provision channels instantly when the bot is invited to the guild
        client.on(Events.GuildCreate, async (guild) => {
            // Ignore startup GuildCreate events (they fire before client is ready)
            if (!client.isReady()) return;

            logger.info(`[Discord] Bot ${botId} joined guild: ${guild.name} (${guild.id})`);
            try {
                await this._registerCommands(token, client.user.id, guild.id);
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
                        await this._provisionIfNeeded(client, token, bot, server_id);
                        logger.info(`[Discord] Auto-initialized channels for server ${server_id} on guild join`);
                    } catch (e) {
                        logger.error(`[Discord] Auto-init error for server ${server_id} on guild join:`, e.message);
                    }
                }
            }
        });

        client.on(Events.InteractionCreate, async (interaction) => {
            await this._handleInteraction(interaction, botId, client);
        });

        client.on('error', (err) => {
            logger.error(`[Discord] Client error for bot ${botId}:`, err.message);
        });

        await client.login(token);
        await readyPromise;
    }

    // ─── Stop a bot ──────────────────────────────────────────────────────────

    async stopBot(botId) {
        const bid = botId.toString();

        // Detach all bridges for this bot's servers
        for (const [key] of this.integrationMap) {
            if (key.startsWith(`${bid}_`)) {
                const serverId = key.split('_')[1];
                eventBridge.detach(`${bid}_${serverId}`);
                this.integrationMap.delete(key);
            }
        }

        const client = this.clients.get(bid);
        if (client) {
            try { client.destroy(); } catch (_) {}
            this.clients.delete(bid);
            logger.info(`[Discord] Bot ${bid} stopped`);
        }
    }

    async destroyAll() {
        eventBridge.detachAll();
        for (const [botId, client] of this.clients) {
            try { client.destroy(); } catch (_) {}
        }
        this.clients.clear();
        this.integrationMap.clear();
    }

    // ─── Provision a server under a bot ──────────────────────────────────────

    async _provisionIfNeeded(client, token, bot, serverId) {
        const botId = bot.id.toString();
        const sid   = serverId.toString();

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
                    // Try inserting with bot_token_encrypted = '' for backwards compatibility with old schemas where it is NOT NULL
                    await dbRun(
                        `INSERT OR IGNORE INTO discord_integrations (bot_id, server_id, guild_id, provisioned, bot_token_encrypted)
                         VALUES (?, ?, ?, 0, '')`,
                        [bot.id, serverId, bot.guild_id]
                    );
                } catch (err) {
                    // Fallback to inserting without bot_token_encrypted for new schemas
                    await dbRun(
                        `INSERT OR IGNORE INTO discord_integrations (bot_id, server_id, guild_id, provisioned)
                         VALUES (?, ?, ?, 0)`,
                        [bot.id, serverId, bot.guild_id]
                    );
                }

                integration = await dbGet(
                    'SELECT * FROM discord_integrations WHERE bot_id = ? AND server_id = ?',
                    [bot.id, serverId]
                );

                if (!integration) {
                    // In old schemas with a UNIQUE constraint on server_id, the INSERT OR IGNORE might have been ignored
                    // because a row with that server_id already exists for a different bot.
                    // Let's check if a row for this server_id exists and update its bot_id.
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
        this.integrationMap.set(`${botId}_${sid}`, integration);
        eventBridge.attach(`${botId}_${sid}`, client, integration, sid);
    }

    // ─── CRUD API ─────────────────────────────────────────────────────────────

    async validateToken(botToken) {
        const tempClient = new Client({ intents: [GatewayIntentBits.Guilds] });
        try {
            await tempClient.login(botToken);
            const user = {
                id:            tempClient.user.id,
                username:      tempClient.user.username,
                discriminator: tempClient.user.discriminator,
                avatar:        tempClient.user.displayAvatarURL()
            };
            tempClient.destroy();
            return user;
        } catch (e) {
            tempClient.destroy();
            throw new Error('Invalid bot token');
        }
    }

    async createBot(botToken, guildId, serverIds = []) {
        const botUser = await this.validateToken(botToken);
        const encryptedToken = encrypt(botToken);

        const result = await dbRun(
            `INSERT INTO discord_bots (bot_token_encrypted, guild_id, bot_user_id, bot_username, bot_avatar, enabled)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [encryptedToken, guildId, botUser.id, botUser.username, botUser.avatar]
        );

        const botId = result.lastID;

        // Assign servers
        for (const serverId of serverIds) {
            await dbRun(
                'INSERT OR IGNORE INTO discord_bot_servers (bot_id, server_id) VALUES (?, ?)',
                [botId, serverId]
            );
        }

        // Start the bot
        const bot = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
        await this.startBot(bot);

        return { success: true, botId, bot: botUser };
    }

    async updateBot(botId, { botToken, guildId, serverIds } = {}) {
        const bid = botId.toString();
        const existing = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
        if (!existing) throw new Error('Bot not found');

        let updates = [];
        let params  = [];

        if (botToken) {
            const botUser = await this.validateToken(botToken);
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
            // Remove old assignments and re-deprovision removed servers
            const oldAssignments = await dbAll(
                'SELECT server_id FROM discord_bot_servers WHERE bot_id = ?', [botId]
            );
            const oldIds  = oldAssignments.map(r => r.server_id);
            const newIds  = serverIds.map(Number);
            const removed = oldIds.filter(id => !newIds.includes(id));
            const added   = newIds.filter(id => !oldIds.includes(id));

            let client = this.clients.get(bid);
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
                // Deprovision
                let integ = this.integrationMap.get(`${bid}_${sid}`);
                if (!integ) {
                    integ = await dbGet('SELECT * FROM discord_integrations WHERE bot_id = ? AND server_id = ?', [botId, sid]);
                }

                if (client && client.isReady() && integ && integ.provisioned) {
                    try {
                        await deprovisionGuild(client, integ.guild_id, {
                            adminRoleId:      integ.admin_role_id,
                            viewerRoleId:     integ.viewer_role_id,
                            categoryId:       integ.category_id,
                            logChannelId:     integ.log_channel_id,
                            consoleChannelId: integ.console_channel_id,
                            statusChannelId:  integ.status_channel_id
                        });
                    } catch (e) {
                        logger.error(`[Discord] Deprovision failed for server ${sid} during update:`, e.message);
                    }
                }
                eventBridge.detach(`${bid}_${sid}`);
                this.integrationMap.delete(`${bid}_${sid}`);
                await dbRun('DELETE FROM discord_bot_servers WHERE bot_id = ? AND server_id = ?', [botId, sid]);
                await dbRun('DELETE FROM discord_integrations WHERE bot_id = ? AND server_id = ?', [botId, sid]);
            }

            if (tempClient) {
                try { tempClient.destroy(); } catch (_) {}
            }

            for (const sid of added) {
                await dbRun(
                    'INSERT OR IGNORE INTO discord_bot_servers (bot_id, server_id) VALUES (?, ?)',
                    [botId, sid]
                );
            }

            // Auto-provision channels/roles for all assigned servers using the running client
            client = this.clients.get(bid);
            if (client && client.isReady()) {
                let token;
                try { token = decrypt(existing.bot_token_encrypted); } catch (_) {}
                const freshBot = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
                const botServers = await dbAll(
                    'SELECT server_id FROM discord_bot_servers WHERE bot_id = ?', [botId]
                );
                for (const { server_id } of botServers) {
                    try {
                        // Mark provisioned as 0 to force recreation/checks
                        await dbRun(
                            'UPDATE discord_integrations SET provisioned = 0 WHERE bot_id = ? AND server_id = ?',
                            [botId, server_id]
                        );
                        await this._provisionIfNeeded(client, token, freshBot, server_id);
                        logger.info(`[Discord] Auto-provisioned channels for server ${server_id}`);
                    } catch (e) {
                        logger.error(`[Discord] Auto-provision error for server ${server_id}:`, e.message);
                    }
                }
            }
        }

        // If token or guildId changed, restart the bot to apply all changes
        if (botToken || guildId) {
            const fresh = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
            await this.startBot(fresh);
        }

        return { success: true };
    }

    async deleteBot(botId) {
        const bid = botId.toString();
        const bot = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
        if (!bot) throw new Error('Bot not found');

        // Deprovision all servers
        const botServers = await dbAll(
            'SELECT server_id FROM discord_bot_servers WHERE bot_id = ?', [botId]
        );
        let client = this.clients.get(bid);
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
            let integ = this.integrationMap.get(`${bid}_${server_id}`);
            if (!integ) {
                integ = await dbGet('SELECT * FROM discord_integrations WHERE bot_id = ? AND server_id = ?', [botId, server_id]);
            }

            if (client && client.isReady() && integ && integ.provisioned) {
                try {
                    await deprovisionGuild(client, integ.guild_id, {
                        adminRoleId:      integ.admin_role_id,
                        viewerRoleId:     integ.viewer_role_id,
                        categoryId:       integ.category_id,
                        logChannelId:     integ.log_channel_id,
                        consoleChannelId: integ.console_channel_id,
                        statusChannelId:  integ.status_channel_id
                    });
                } catch (e) {
                    logger.error(`[Discord] Deprovision failed for server ${server_id} during bot delete:`, e.message);
                }
            }
        }

        // Leave the guild after deprovisioning is completed
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
            try { tempClient.destroy(); } catch (_) {}
        }

        await this.stopBot(bid);

        await dbRun('DELETE FROM discord_bots WHERE id = ?', [botId]);
        await dbRun('DELETE FROM discord_bot_servers WHERE bot_id = ?', [botId]);
        await dbRun('DELETE FROM discord_integrations WHERE bot_id = ?', [botId]);

        return { success: true };
    }

    async toggleBot(botId, enabled) {
        await dbRun(
            'UPDATE discord_bots SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [enabled ? 1 : 0, botId]
        );
        if (enabled) {
            const bot = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
            if (bot) await this.startBot(bot);
        } else {
            await this.stopBot(botId.toString());
        }
    }

    async reprovisionServer(botId, serverId) {
        const bid = botId.toString();
        await dbRun(
            'UPDATE discord_integrations SET provisioned = 0 WHERE bot_id = ? AND server_id = ?',
            [botId, serverId]
        );
        const bot    = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
        const client = this.clients.get(bid);
        if (!bot || !client) throw new Error('Bot not running');

        const token = decrypt(bot.bot_token_encrypted);
        await this._provisionIfNeeded(client, token, bot, serverId);
        return { success: true };
    }

    // ─── List/Get ────────────────────────────────────────────────────────────

    async listBots() {
        const bots = await dbAll('SELECT * FROM discord_bots ORDER BY created_at DESC');
        const result = [];
        for (const bot of bots) {
            const servers = await dbAll(
                'SELECT server_id FROM discord_bot_servers WHERE bot_id = ?', [bot.id]
            );
            const client  = this.clients.get(bot.id.toString());
            result.push({
                id:        bot.id,
                guildId:   bot.guild_id,
                enabled:   !!bot.enabled,
                online:    client ? client.isReady() : false,
                username:  bot.bot_username,
                avatar:    bot.bot_avatar,
                serverIds: servers.map(s => s.server_id),
                createdAt: bot.created_at
            });
        }
        return result;
    }

    async getBot(botId) {
        const bot = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
        if (!bot) return null;
        const servers = await dbAll(
            'SELECT server_id FROM discord_bot_servers WHERE bot_id = ?', [botId]
        );
        const client = this.clients.get(botId.toString());
        return {
            id:        bot.id,
            guildId:   bot.guild_id,
            enabled:   !!bot.enabled,
            online:    client ? client.isReady() : false,
            username:  bot.bot_username,
            avatar:    bot.bot_avatar,
            serverIds: servers.map(s => s.server_id),
            createdAt: bot.created_at
        };
    }

    // ─── Legacy single-bot API (backwards compat with per-server discord tab) ──

    async getStatusForServer(serverId) {
        // Find any bot that manages this server
        const row = await dbGet(
            'SELECT b.*, i.* FROM discord_bots b ' +
            'JOIN discord_bot_servers bs ON bs.bot_id = b.id ' +
            'LEFT JOIN discord_integrations i ON i.bot_id = b.id AND i.server_id = bs.server_id ' +
            'WHERE bs.server_id = ? LIMIT 1',
            [serverId]
        );
        if (!row) return null;

        const client  = this.clients.get(row.bot_id?.toString() || row.id?.toString());
        const isOnline = client && client.isReady();

        return {
            connected:   true,
            serverId:    parseInt(serverId),
            guildId:     row.guild_id,
            enabled:     !!row.enabled,
            provisioned: !!row.provisioned,
            botOnline:   isOnline,
            botUser: isOnline ? {
                id:       client.user.id,
                username: client.user.username,
                avatar:   client.user.displayAvatarURL()
            } : null,
            channels: {
                console:  row.console_channel_id,
                commands: row.log_channel_id,
                status:   row.status_channel_id
            },
            roles: {
                admin:     row.admin_role_id,
                moderator: row.viewer_role_id
            }
        };
    }

    async getStatus(serverId) {
        return this.getStatusForServer(serverId);
    }

    async connect(serverId, botToken, guildId) {
        const botUser = await this.validateToken(botToken);

        // Check if a bot with this token/user ID already exists
        let bot = await dbGet('SELECT * FROM discord_bots WHERE bot_user_id = ? AND guild_id = ?', [botUser.id, guildId]);

        let botId;
        if (!bot) {
            // Create the bot
            const res = await this.createBot(botToken, guildId, [serverId]);
            botId = res.botId;
        } else {
            botId = bot.id;
            // Ensure it's associated with this server
            await dbRun('INSERT OR IGNORE INTO discord_bot_servers (bot_id, server_id) VALUES (?, ?)', [botId, serverId]);
            // Ensure it's enabled
            await dbRun('UPDATE discord_bots SET enabled = 1 WHERE id = ?', [botId]);
            // Restart/provision
            const fresh = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
            await this.startBot(fresh);
        }

        return { success: true, botId };
    }

    async disconnect(serverId) {
        const sid = serverId.toString();
        const row = await dbGet('SELECT bot_id FROM discord_bot_servers WHERE server_id = ? LIMIT 1', [serverId]);
        if (!row) return { success: true };

        const botId = row.bot_id;
        const bid = botId.toString();

        // Deprovision
        let client = this.clients.get(bid);
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

        let integ = this.integrationMap.get(`${bid}_${sid}`);
        if (!integ) {
            integ = await dbGet('SELECT * FROM discord_integrations WHERE bot_id = ? AND server_id = ?', [botId, sid]);
        }

        if (client && client.isReady() && integ && integ.provisioned) {
            try {
                await deprovisionGuild(client, integ.guild_id, {
                    adminRoleId:      integ.admin_role_id,
                    viewerRoleId:     integ.viewer_role_id,
                    categoryId:       integ.category_id,
                    logChannelId:     integ.log_channel_id,
                    consoleChannelId: integ.console_channel_id,
                    statusChannelId:  integ.status_channel_id
                });
            } catch (e) {
                logger.error(`[Discord] Deprovision failed during disconnect:`, e.message);
            }
        }

        if (tempClient) {
            try { tempClient.destroy(); } catch (_) {}
        }

        eventBridge.detach(`${bid}_${sid}`);
        this.integrationMap.delete(`${bid}_${sid}`);

        // Delete association and integration
        await dbRun('DELETE FROM discord_bot_servers WHERE bot_id = ? AND server_id = ?', [botId, serverId]);
        await dbRun('DELETE FROM discord_integrations WHERE bot_id = ? AND server_id = ?', [botId, serverId]);

        // If no servers left, delete/stop bot. Otherwise restart
        const otherServers = await dbAll('SELECT 1 FROM discord_bot_servers WHERE bot_id = ?', [botId]);
        if (otherServers.length === 0) {
            await this.deleteBot(botId);
        } else {
            const fresh = await dbGet('SELECT * FROM discord_bots WHERE id = ?', [botId]);
            await this.startBot(fresh);
        }

        return { success: true };
    }

    async toggleEnabled(serverId, enabled) {
        const row = await dbGet('SELECT bot_id FROM discord_bot_servers WHERE server_id = ? LIMIT 1', [serverId]);
        if (!row) throw new Error('No bot integration associated with this server.');
        await this.toggleBot(row.bot_id, enabled);
    }

    async reprovision(serverId) {
        const row = await dbGet('SELECT bot_id FROM discord_bot_servers WHERE server_id = ? LIMIT 1', [serverId]);
        if (!row) throw new Error('No bot integration associated with this server.');
        return this.reprovisionServer(row.bot_id, serverId);
    }

    // ─── Command registration ─────────────────────────────────────────────────

    async _registerCommands(token, clientId, guildId) {
        const rest = new REST({ version: '10' }).setToken(token);
        const commandData = commands.map(cmd => cmd.data.toJSON());
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commandData }
        );
        logger.info(`[Discord] Registered ${commandData.length} slash commands for guild ${guildId}`);
    }

    // ─── Interaction handler ──────────────────────────────────────────────────

    async _handleInteraction(interaction, botId, client) {
        const guildId = interaction.guildId;
        let serverId = null;

        // 1. Resolve serverId from Custom ID (if button) or from Channel ID (if slash command)
        if (interaction.isButton()) {
            const customId = interaction.customId;
            if (customId.startsWith('live_console_stop_')) {
                serverId = customId.replace('live_console_stop_', '');
            } else if (customId.startsWith('live_stats_stop_')) {
                serverId = customId.replace('live_stats_stop_', '');
            } else if (customId.startsWith('logs_')) {
                serverId = customId.split('_')[2];
            } else if (customId.startsWith('control_')) {
                serverId = customId.split('_')[2];
            }
        } else if (interaction.isChatInputCommand()) {
            const commandName = interaction.commandName;

            // Find which server's channel matches the interaction channel
            for (const [key, integ] of this.integrationMap) {
                if (!key.startsWith(`${botId}_`)) continue;
                if (integ.guild_id === guildId) {
                    if (
                        interaction.channelId === integ.log_channel_id ||
                        interaction.channelId === integ.console_channel_id ||
                        interaction.channelId === integ.status_channel_id
                    ) {
                        serverId = key.split('_')[1];
                        break;
                    }
                }
            }

            // Commands other than /init can only run in dedicated channels
            if (commandName !== 'init' && !serverId) {
                return interaction.reply({
                    content: '❌ This command can only be used inside the server\'s dedicated channels.',
                    ephemeral: true
                });
            }

            // For /init, we allow running in general channels and resolve serverId
            if (commandName === 'init' && !serverId) {
                const assigned = [];
                for (const [key, integ] of this.integrationMap) {
                    if (!key.startsWith(`${botId}_`)) continue;
                    if (integ.guild_id === guildId) {
                        assigned.push(key.split('_')[1]);
                    }
                }

                if (assigned.length === 1) {
                    serverId = assigned[0];
                } else if (assigned.length > 1) {
                    const serverOption = interaction.options.getString('server');
                    if (serverOption) {
                        const optLower = serverOption.toLowerCase();
                        const match = await this._findServerMatch(assigned, optLower);
                        if (match) {
                            serverId = match.id.toString();
                        } else {
                            return interaction.reply({
                                content: `❌ Could not find a server matching "${serverOption}". Available servers:\n` +
                                    (await this._buildServerListString(assigned)),
                                ephemeral: true
                            });
                        }
                    } else {
                        return interaction.reply({
                            content: `❌ Multiple servers assigned to this bot. Please specify which one to initialize:\n` +
                                `/init server: <name/ID>\n\n**Available servers:**\n` +
                                (await this._buildServerListString(assigned)),
                            ephemeral: true
                        });
                    }
                } else {
                    return interaction.reply({
                        content: '❌ No servers are assigned to this bot in the panel.',
                        ephemeral: true
                    });
                }
            }
        }

        if (!serverId) return;

        const integration = this.integrationMap.get(`${botId}_${serverId}`);
        if (!integration) return;

        if (interaction.isButton()) {
            await this._handleButton(interaction, serverId, integration, botId);
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = commands.get(interaction.commandName);
        if (!command) return;

        if (interaction.guildId !== integration.guild_id) {
            return interaction.reply({ content: '❌ This bot only operates in its assigned guild.', ephemeral: true });
        }

        const hasAccess = await this._checkRole(interaction, integration, command.requiredRole);
        if (!hasAccess) {
            return interaction.reply({ content: '❌ You do not have the required role to use this command.', ephemeral: true });
        }

        try {
            await command.execute(interaction, serverId);
        } catch (e) {
            logger.error(`[Discord] Command error (${interaction.commandName}, server ${serverId}):`, e);
            const reply = { content: '❌ An error occurred while executing this command.', ephemeral: true };
            try {
                if (interaction.deferred || interaction.replied) await interaction.editReply(reply);
                else await interaction.reply(reply);
            } catch (_) {}
        }
    }

    async _handleButton(interaction, serverId, integration, botId) {
        const customId = interaction.customId;

        if (customId.startsWith('live_console_stop_')) {
            const sid = customId.replace('live_console_stop_', '');
            if (!(await this._checkRole(interaction, integration, 'admin'))) {
                return interaction.reply({ content: '❌ Missing required role.', ephemeral: true });
            }
            const session = liveSessionMgr.getConsole(sid);
            if (session) {
                session.stopped = true;
                session.cleanup();
                try { await interaction.update({ embeds: [session.buildEmbed(true, false)], components: [] }); } catch (_) {}
            } else {
                try { await interaction.update({ components: [] }); } catch (_) {}
            }
            return;
        }

        if (customId.startsWith('live_stats_stop_')) {
            const sid = customId.replace('live_stats_stop_', '');
            if (!(await this._checkRole(interaction, integration, 'viewer'))) {
                return interaction.reply({ content: '❌ Missing required role.', ephemeral: true });
            }
            const session = liveSessionMgr.getStats(sid);
            if (session) {
                session.stopped = true;
                session.cleanup();
                try { await interaction.update({ embeds: [session.buildEmbed(true, false)], components: [] }); } catch (_) {}
            } else {
                try { await interaction.update({ components: [] }); } catch (_) {}
            }
            return;
        }

        if (customId.startsWith('logs_')) {
            const logsCmd = commands.get('logs');
            if (logsCmd && logsCmd.handleButton) {
                if (!(await this._checkRole(interaction, integration, 'viewer'))) {
                    return interaction.reply({ content: '❌ Missing required role.', ephemeral: true });
                }
                try { await logsCmd.handleButton(interaction, serverId); } catch (e) {
                    logger.error(`[Discord] Log button error:`, e.message);
                }
            }
            return;
        }

        if (customId.startsWith('control_')) {
            const parts  = customId.split('_');
            const action = parts[1];
            const requiredRole = action === 'refresh' ? 'viewer' : 'admin';

            if (!(await this._checkRole(interaction, integration, requiredRole))) {
                return interaction.reply({ content: '❌ Missing required role.', ephemeral: true });
            }

            if (action === 'refresh') {
                try {
                    await interaction.deferUpdate();
                    const server = await getServer(parseInt(serverId));
                    if (!server) return;
                    const isOnline = processManager.getStatus(serverId) === 'online';
                    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const embed = new EmbedBuilder()
                        .setTitle(`${isOnline ? '🟢' : '🔴'} ${server.name}`)
                        .setColor(isOnline ? 0x22c55e : 0xef4444)
                        .addFields(
                            { name: 'Status',   value: isOnline ? '**Online**' : '**Offline**', inline: true },
                            { name: 'Software', value: `${server.software} ${server.version}`,  inline: true },
                            { name: 'Port',     value: `${server.port}`,                        inline: true },
                            { name: 'RAM',      value: `${server.ram_mb} MB`,                   inline: true }
                        )
                        .setTimestamp().setFooter({ text: 'MinePanel' });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`control_start_${serverId}`).setLabel('▶ Start').setStyle(ButtonStyle.Success).setDisabled(isOnline),
                        new ButtonBuilder().setCustomId(`control_stop_${serverId}`).setLabel('⏹ Stop').setStyle(ButtonStyle.Danger).setDisabled(!isOnline),
                        new ButtonBuilder().setCustomId(`control_restart_${serverId}`).setLabel('🔄 Restart').setStyle(ButtonStyle.Primary).setDisabled(!isOnline),
                        new ButtonBuilder().setCustomId(`control_refresh_${serverId}`).setLabel('🔃 Refresh').setStyle(ButtonStyle.Secondary)
                    );
                    await interaction.editReply({ embeds: [embed], components: [row] });
                } catch (e) { logger.error(`[Discord] Refresh error:`, e.message); }
            } else {
                const cmd = commands.get(action);
                if (cmd) {
                    try {
                        await interaction.deferReply();
                        await cmd.execute(interaction, serverId);
                    } catch (e) {
                        logger.error(`[Discord] Control button error (${action}):`, e.message);
                        try { await interaction.editReply({ content: `❌ Error: ${e.message}` }); } catch (_) {}
                    }
                }
            }
        }
    }

    async _checkRole(interaction, integration, requiredRole) {
        if (!requiredRole) return true;
        const member = interaction.member;
        if (!member) return false;

        if (member.id === interaction.guild?.ownerId) return true;

        const { PermissionFlagsBits } = require('discord.js');
        if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

        const adminRoleId  = integration.admin_role_id;
        const viewerRoleId = integration.viewer_role_id;

        if (adminRoleId && member.roles.cache.has(adminRoleId)) return true;
        if (requiredRole === 'viewer' && viewerRoleId && member.roles.cache.has(viewerRoleId)) return true;

        return false;
    }

    async _findServerMatch(serverIds, query) {
        for (const sid of serverIds) {
            const server = await getServer(parseInt(sid));
            if (server) {
                if (sid.toString() === query || server.name.toLowerCase().includes(query)) {
                    return server;
                }
            }
        }
        return null;
    }

    async _buildServerListString(serverIds) {
        const list = [];
        for (const sid of serverIds) {
            const server = await getServer(parseInt(sid));
            if (server) {
                list.push(`• **${server.name}** (ID: \`${sid}\`)`);
            } else {
                list.push(`• **Server ${sid}** (ID: \`${sid}\`)`);
            }
        }
        return list.join('\n');
    }
}

module.exports = new DiscordManager();
