/**
 * Discord Event Bridge — connects processManager events to Discord channels.
 *
 * Outbound  (Server → Discord):
 *   • Streams batched console output to #console
 *   • Posts a live status embed to #status, pinned and auto-updated every 30 s
 *
 * Inbound  (Discord → Server):
 *   • Any message typed in #commands by a user with the Admin role
 *     is forwarded directly to the Minecraft server stdin — exactly like
 *     typing in a terminal.
 *   • Bot reacts ✅ on success, ⚫ if server is offline, ❌ on error / no perms.
 *   • The bot's own messages are ignored.
 */
const { EmbedBuilder, Events, PermissionFlagsBits, MessageFlags } = require('discord.js');
const processManager = require('../processManager');
const { getServer } = require('../serverHelper');

const BATCH_INTERVAL_MS  = 2000;  // flush console output every 2 s
const STATUS_INTERVAL_MS = 30000; // refresh status embed every 30 s

class DiscordEventBridge {
    constructor() {
        /** @type {Map<string, BridgeState>} serverId → state */
        this.bridges = new Map();
    }

    // ─────────────────────────────────────────────────────
    //  attach — start bridging for one server integration
    // ─────────────────────────────────────────────────────

    /**
     * @param {string} bridgeKey  — composite key `${botId}_${serverId}` (or legacy plain serverId)
     * @param {import('discord.js').Client} client
     * @param {object} integration  — DB row from discord_integrations
     * @param {string} [realServerId] — actual MC server ID; extracted from bridgeKey if omitted
     */
    attach(bridgeKey, client, integration, realServerId) {
        this.detach(bridgeKey);

        // Support both composite "botId_serverId" key and legacy plain "serverId"
        const serverId = realServerId != null ? realServerId.toString()
                       : bridgeKey.includes('_') ? bridgeKey.split('_').pop()
                       : bridgeKey;

        const state = {
            client,
            // Snapshot — fresh copy so stale references never bleed in
            integration: Object.assign({}, integration),
            listeners:  {},
            batchTimer:  null,
            batchBuffer: '',
            statusTimer: null,
            statusMsgId: null
        };

        // ── Outbound: console output → #console ─────────────
        state.listeners.console = (emittedId, output) => {
            if (emittedId.toString() !== serverId.toString()) return;

            state.batchBuffer += output;

            if (!state.batchTimer) {
                state.batchTimer = setTimeout(() => {
                    this._flushConsole(serverId, state);
                }, BATCH_INTERVAL_MS);
            }
        };

        // ── Outbound: status change → #status (immediate update) ──
        state.listeners.status = async (emittedId, status) => {
            if (emittedId.toString() !== serverId.toString()) return;

            // Flush any pending console output first
            if (state.batchBuffer.length > 0) {
                this._flushConsole(serverId, state);
            }

            // Immediately push a status update
            await this._updateStatusEmbed(serverId, state);
        };

        // ── Outbound: console clear ──────────────────────────
        state.listeners.clearConsole = async (emittedId) => {
            if (emittedId.toString() !== serverId.toString()) return;
            state.batchBuffer = '';
            if (state.batchTimer) {
                clearTimeout(state.batchTimer);
                state.batchTimer = null;
            }

            const consoleChannelId = state.integration.console_channel_id;
            if (consoleChannelId) {
                try {
                    const channel = await state.client.channels.fetch(consoleChannelId);
                    if (channel) {
                        await clearChannel(channel);
                    }
                } catch (e) {
                    console.error(`[DiscordBridge] Failed to clear console channel for server ${serverId}:`, e.message);
                }
            }
        };

        // ── Inbound: Discord messages in #commands and #console → server stdin ──
        //
        // Both channels accept commands from users with the Admin role.
        //   • #commands  (log_channel_id)   — dedicated input channel
        //   • #console   (console_channel_id) — admins can also type here
        //
        // Moderators can only view; they get ❌ if they try to type.
        // Bot ignores its own messages.
        state.listeners.message = async (message) => {
            // Ignore bots (including ourselves)
            if (message.author.bot) return;

            // Only in the configured guild
            if (message.guildId !== integration.guild_id) return;

            // Only in #commands or #console
            const commandsChannelId = integration.log_channel_id;
            const consoleChannelId  = integration.console_channel_id;
            const inCommandsChannel = commandsChannelId && message.channelId === commandsChannelId;
            const inConsoleChannel  = consoleChannelId  && message.channelId === consoleChannelId;
            if (!inCommandsChannel && !inConsoleChannel) return;

            // Empty / whitespace-only messages
            const cmd = message.content.trim();
            if (!cmd) return;

            // ── Permission check — only Server Admin (or Discord admin / guild owner) ──
            const member          = message.member;
            const isOwner         = member && message.guild && member.id === message.guild.ownerId;
            const hasAdminRole    = integration.admin_role_id && member?.roles?.cache?.has(integration.admin_role_id);
            const hasDiscordAdmin = member?.permissions?.has(PermissionFlagsBits.Administrator);

            if (!isOwner && !hasAdminRole && !hasDiscordAdmin) {
                try { await message.react('❌'); } catch (_) {}
                return;
            }

            // ── Server must be online ──
            if (processManager.getStatus(serverId.toString()) !== 'online') {
                try { await message.react('⚫'); } catch (_) {}
                return;
            }

            // ── Forward command to Minecraft stdin ──
            try {
                processManager.sendCommand(serverId.toString(), cmd);
                // Immediately delete the message instead of reacting with ✅
                try {
                    await message.delete();
                } catch (_) {}
                console.log(`[DiscordBridge] Command from ${message.author.tag} → server ${serverId}: ${cmd}`);
            } catch (e) {
                console.error(`[DiscordBridge] Failed to send command for server ${serverId}:`, e.message);
                try { await message.react('❌'); } catch (_) {}
            }
        };

        // Register all listeners
        processManager.on('console',       state.listeners.console);
        processManager.on('status',        state.listeners.status);
        processManager.on('clear_console', state.listeners.clearConsole);
        client.on(Events.MessageCreate,    state.listeners.message);

        this.bridges.set(bridgeKey, state);
        console.log(`[DiscordBridge] Attached bridge key=${bridgeKey} serverId=${serverId}`);

        // ── Start live status loop ──────────────────────────
        this._startStatusLoop(serverId, state);
    }

    // ─────────────────────────────────────────────────────
    //  detach — stop bridging for one server
    // ─────────────────────────────────────────────────────

    detach(bridgeKey) {
        const state = this.bridges.get(bridgeKey);
        if (!state) return;

        processManager.removeListener('console',       state.listeners.console);
        processManager.removeListener('status',        state.listeners.status);
        processManager.removeListener('clear_console', state.listeners.clearConsole);
        state.client.removeListener(Events.MessageCreate, state.listeners.message);

        if (state.batchTimer)  { clearTimeout(state.batchTimer);   state.batchTimer  = null; }
        if (state.statusTimer) { clearInterval(state.statusTimer); state.statusTimer = null; }

        this.bridges.delete(bridgeKey);
    }

    // ─────────────────────────────────────────────────────
    //  detachAll — graceful shutdown
    // ─────────────────────────────────────────────────────

    detachAll() {
        for (const [serverId] of this.bridges) {
            this.detach(serverId);
        }
    }

    // ─────────────────────────────────────────────────────
    //  updateIntegration — hot-swap channel/role IDs without
    //  restarting the bridge (used after /init or reprovision)
    // ─────────────────────────────────────────────────────

    updateIntegration(serverId, newIntegration) {
        const state = this.bridges.get(serverId.toString());
        if (!state) return false;
        Object.assign(state.integration, newIntegration);
        // Reset cached status message ID so it gets re-pinned in the new channel
        state.statusMsgId = null;
        console.log(`[DiscordBridge] Integration hot-updated for server ${serverId}`);
        return true;
    }

    // ─────────────────────────────────────────────────────
    //  _startStatusLoop — refresh #status every 30 s
    // ─────────────────────────────────────────────────────

    _startStatusLoop(serverId, state) {
        // First update immediately (after a short delay so channels are ready)
        setTimeout(() => this._updateStatusEmbed(serverId, state), 3000);

        // Then every 30 s
        state.statusTimer = setInterval(() => {
            this._updateStatusEmbed(serverId, state);
        }, STATUS_INTERVAL_MS);
    }

    // ─────────────────────────────────────────────────────
    //  _updateStatusEmbed — edit/post the pinned status message
    // ─────────────────────────────────────────────────────

    async _updateStatusEmbed(serverId, state) {
        const channelId = state.integration.status_channel_id;
        if (!channelId) return;

        try {
            const channel = await state.client.channels.fetch(channelId);
            if (!channel) throw new Error('Unknown Channel');

            const isOnline   = processManager.getStatus(serverId.toString()) === 'online';
            const serverInfo = await getServer(parseInt(serverId));

            // Build the embed
            const embed = this._buildStatusEmbed(isOnline, serverInfo);

            // Try to edit the existing pinned message
            if (state.statusMsgId) {
                try {
                    const existing = await channel.messages.fetch(state.statusMsgId);
                    await existing.edit({ embeds: [embed], flags: [MessageFlags.SuppressNotifications] });
                    return;
                } catch (_) {
                    // Message was deleted or not found — fall through to send a new one
                    state.statusMsgId = null;
                }
            }

            // No pinned message yet — look for one we sent earlier (after restart)
            try {
                const pinned = await channel.messages.fetchPinned();
                const ours = pinned.find(m => m.author.id === state.client.user.id);
                if (ours) {
                    state.statusMsgId = ours.id;
                    await ours.edit({ embeds: [embed], flags: [MessageFlags.SuppressNotifications] });
                    return;
                }
            } catch (_) {}

            // Send a fresh message and pin it
            const sent = await channel.send({ embeds: [embed], flags: [MessageFlags.SuppressNotifications] });
            state.statusMsgId = sent.id;

            try {
                await sent.pin();
            } catch (_) {}

        } catch (e) {
            console.error(`[DiscordBridge] Failed to update status for server ${serverId}:`, e.message);
            const isMissingChannel = e.code === 10003 || e.code === 50001 || 
                                     e.message?.includes('Unknown Channel') || e.message?.includes('Missing Access');
            if (isMissingChannel) {
                console.warn(`[DiscordBridge] Channel ${channelId} is missing/deleted. Triggering auto-reprovision...`);
                this._triggerReprovision(serverId, state);
            }
        }
    }

    // ─────────────────────────────────────────────────────
    //  _buildStatusEmbed — construct the status EmbedBuilder
    // ─────────────────────────────────────────────────────

    _buildStatusEmbed(isOnline, server) {
        const name = server ? server.name : 'Unknown Server';

        const embed = new EmbedBuilder()
            .setTitle(`${isOnline ? '🟢' : '🔴'} ${name}`)
            .setColor(isOnline ? 0x22c55e : 0xef4444)
            .setTimestamp()
            .setFooter({ text: `MinePanel • updates every 30s` });

        if (server) {
            embed.addFields(
                { name: 'Status',   value: isOnline ? '**Online ✅**' : '**Offline ⛔**', inline: true },
                { name: 'Software', value: `${server.software} ${server.version}`,         inline: true },
                { name: 'Port',     value: `\`${server.port}\``,                           inline: true },
                { name: 'RAM',      value: `${server.ram_mb} MB`,                          inline: true }
            );
        } else {
            embed.setDescription(isOnline ? 'Server is **online**.' : 'Server is **offline**.');
        }

        return embed;
    }

    // ─────────────────────────────────────────────────────
    //  _flushConsole — send buffered output to #console
    // ─────────────────────────────────────────────────────

    async _flushConsole(serverId, state) {
        const content = state.batchBuffer;
        state.batchBuffer = '';
        state.batchTimer  = null;

        if (!content || content.trim().length === 0) return;

        const channelId = state.integration.console_channel_id;
        if (!channelId) return;

        try {
            const channel = await state.client.channels.fetch(channelId);
            if (!channel) throw new Error('Unknown Channel');

            const chunks = splitMessage(content, 1900);
            for (const chunk of chunks) {
                await channel.send({ content: `\`\`\`ansi\n${chunk}\n\`\`\``, flags: [MessageFlags.SuppressNotifications] });
            }
        } catch (e) {
            console.error(`[DiscordBridge] Failed to send console output for server ${serverId}:`, e.message);
            const isMissingChannel = e.code === 10003 || e.code === 50001 || 
                                     e.message?.includes('Unknown Channel') || e.message?.includes('Missing Access');
            if (isMissingChannel) {
                console.warn(`[DiscordBridge] Channel ${channelId} is missing/deleted. Triggering auto-reprovision...`);
                this._triggerReprovision(serverId, state);
            }
        }
    }

    async _triggerReprovision(serverId, state) {
        if (state._reprovisioning) return;
        state._reprovisioning = true;

        try {
            const discordManager = require('./discordManager');
            const { dbRun } = require('../../db/database');
            await dbRun(
                'UPDATE discord_integrations SET provisioned = 0 WHERE server_id = ?',
                [serverId]
            );
            await discordManager.reprovision(serverId);
            console.log(`[DiscordBridge] Auto-reprovision completed for server ${serverId}`);
        } catch (err) {
            console.error(`[DiscordBridge] Auto-reprovision failed for server ${serverId}:`, err.message);
        } finally {
            state._reprovisioning = false;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Utility: split long text into Discord-safe chunks, breaking on newlines
// ─────────────────────────────────────────────────────────────────────────────

function splitMessage(text, maxLength) {
    if (text.length <= maxLength) return [text];

    const chunks = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLength) {
            chunks.push(remaining);
            break;
        }

        let breakPoint = remaining.lastIndexOf('\n', maxLength);
        if (breakPoint <= 0) breakPoint = maxLength;

        chunks.push(remaining.slice(0, breakPoint));
        remaining = remaining.slice(breakPoint);

        if (chunks.length > 10) {
            chunks.push('…(truncated)');
            break;
        }
    }

    return chunks;
}

async function clearChannel(channel) {
    if (!channel) return;
    try {
        let fetched;
        do {
            fetched = await channel.messages.fetch({ limit: 100 });
            if (fetched.size === 0) break;
            try {
                await channel.bulkDelete(fetched);
            } catch (err) {
                // fallback to individual deletion for older messages
                for (const message of fetched.values()) {
                    try {
                        await message.delete();
                    } catch (_) {}
                }
            }
        } while (fetched.size >= 10);
    } catch (e) {
        console.error(`[Discord] Failed to clear channel ${channel.id}:`, e.message);
    }
}

module.exports = new DiscordEventBridge();
