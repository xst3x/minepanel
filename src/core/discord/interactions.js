/**
 * Discord interaction & button handling — slash commands, buttons, role checks.
 * Extracted from discordManager.js — single responsibility.
 */
const { clients, integrationMap } = require('./state');
const commands = require('./commands');
const logger = require('../utils/logger');
const processManager = require('../processManager');
const { getServer } = require('../serverHelper');
const liveSessionMgr = require('./liveSessionManager');
const { dbGet } = require('../../db/database');

/**
 * Resolve serverId from an interaction (button customId or slash command channel).
 * @param {import('discord.js').Interaction} interaction
 * @param {string} botId
 * @returns {Promise<string|null>}
 */
async function resolveServerId(interaction, botId) {
    const guildId = interaction.guildId;

    if (interaction.isButton()) {
        const customId = interaction.customId;
        if (customId.startsWith('live_console_stop_')) {
            return customId.replace('live_console_stop_', '');
        } else if (customId.startsWith('live_stats_stop_')) {
            return customId.replace('live_stats_stop_', '');
        } else if (customId.startsWith('logs_')) {
            return customId.split('_')[2];
        } else if (customId.startsWith('control_')) {
            return customId.split('_')[2];
        }
        return null;
    }

    if (!interaction.isChatInputCommand()) return null;

    const commandName = interaction.commandName;
    let serverId = null;

    // Find which server's channel matches the interaction channel
    for (const [key, integ] of integrationMap) {
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
        await interaction.reply({
            content: '❌ This command can only be used inside the server\'s dedicated channels.',
            ephemeral: true
        });
        return null;
    }

    // For /init, resolve serverId from channel or server option
    if (commandName === 'init' && !serverId) {
        const assigned = [];
        for (const [key, integ] of integrationMap) {
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
                const match = await findServerMatch(assigned, optLower);
                if (match) {
                    serverId = match.id.toString();
                } else {
                    await interaction.reply({
                        content: `❌ Could not find a server matching "${serverOption}". Available servers:\n` +
                            await buildServerListString(assigned),
                        ephemeral: true
                    });
                    return null;
                }
            } else {
                await interaction.reply({
                    content: `❌ Multiple servers assigned to this bot. Please specify which one to initialize:\n` +
                        `/init server: <name/ID>\n\n**Available servers:**\n` +
                        await buildServerListString(assigned),
                    ephemeral: true
                });
                return null;
            }
        } else {
            await interaction.reply({
                content: '❌ No servers are assigned to this bot in the panel.',
                ephemeral: true
            });
            return null;
        }
    }

    return serverId;
}

/**
 * Handle any Discord interaction (button click or slash command).
 * @param {import('discord.js').Interaction} interaction
 * @param {string} botId
 * @param {import('discord.js').Client} client
 */
async function handleInteraction(interaction, botId, client) {
    const serverId = await resolveServerId(interaction, botId);
    if (!serverId) return;

    const integration = integrationMap.get(`${botId}_${serverId}`);
    if (!integration) return;

    if (interaction.isButton()) {
        await handleButton(interaction, serverId, integration, botId);
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    if (interaction.guildId !== integration.guild_id) {
        return interaction.reply({ content: '❌ This bot only operates in its assigned guild.', ephemeral: true });
    }

    const hasAccess = await checkRole(interaction, integration, command.requiredRole);
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
        } catch (_) { }
    }
}

/**
 * Handle button interactions (live console stop, live stats stop, logs, control buttons).
 */
async function handleButton(interaction, serverId, integration, botId) {
    const customId = interaction.customId;

    if (customId.startsWith('live_console_stop_')) {
        const sid = customId.replace('live_console_stop_', '');
        if (!(await checkRole(interaction, integration, 'admin'))) {
            return interaction.reply({ content: '❌ Missing required role.', ephemeral: true });
        }
        const session = liveSessionMgr.getConsole(sid);
        if (session) {
            session.stopped = true;
            session.cleanup();
            try { await interaction.update({ embeds: [session.buildEmbed(true, false)], components: [] }); } catch (_) { }
        } else {
            try { await interaction.update({ components: [] }); } catch (_) { }
        }
        return;
    }

    if (customId.startsWith('live_stats_stop_')) {
        const sid = customId.replace('live_stats_stop_', '');
        if (!(await checkRole(interaction, integration, 'viewer'))) {
            return interaction.reply({ content: '❌ Missing required role.', ephemeral: true });
        }
        const session = liveSessionMgr.getStats(sid);
        if (session) {
            session.stopped = true;
            session.cleanup();
            try { await interaction.update({ embeds: [session.buildEmbed(true, false)], components: [] }); } catch (_) { }
        } else {
            try { await interaction.update({ components: [] }); } catch (_) { }
        }
        return;
    }

    if (customId.startsWith('logs_')) {
        const logsCmd = commands.get('logs');
        if (logsCmd && logsCmd.handleButton) {
            if (!(await checkRole(interaction, integration, 'viewer'))) {
                return interaction.reply({ content: '❌ Missing required role.', ephemeral: true });
            }
            try { await logsCmd.handleButton(interaction, serverId); } catch (e) {
                logger.error(`[Discord] Log button error:`, e.message);
            }
        }
        return;
    }

    if (customId.startsWith('control_')) {
        const parts = customId.split('_');
        const action = parts[1];
        const requiredRole = action === 'refresh' ? 'viewer' : 'admin';

        if (!(await checkRole(interaction, integration, requiredRole))) {
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
                        { name: 'Status', value: isOnline ? '**Online**' : '**Offline**', inline: true },
                        { name: 'Software', value: `${server.software} ${server.version}`, inline: true },
                        { name: 'Port', value: `${server.port}`, inline: true },
                        { name: 'RAM', value: `${server.ram_mb} MB`, inline: true }
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
                    try { await interaction.editReply({ content: `❌ Error: ${e.message}` }); } catch (_) { }
                }
            }
        }
    }
}

/**
 * Check if a Discord member has the required role for an action.
 */
async function checkRole(interaction, integration, requiredRole) {
    if (!requiredRole) return true;
    const member = interaction.member;
    if (!member) return false;

    if (member.id === interaction.guild?.ownerId) return true;

    const { PermissionFlagsBits } = require('discord.js');
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

    const adminRoleId = integration.admin_role_id;
    const viewerRoleId = integration.viewer_role_id;

    if (adminRoleId && member.roles.cache.has(adminRoleId)) return true;
    if (requiredRole === 'viewer' && viewerRoleId && member.roles.cache.has(viewerRoleId)) return true;

    return false;
}

/**
 * Find a server by matching name/ID against a list of server IDs.
 */
async function findServerMatch(serverIds, query) {
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

/**
 * Build a formatted list of servers for ephemeral replies.
 */
async function buildServerListString(serverIds) {
    const list = [];
    for (const sid of serverIds) {
        const server = await getServer(parseInt(sid));
        if (server) {
            list.push(`• **${server.name}** (ID: \`${sid}\`)`);
        } else {
            list.push(`• **Server ${sid}** (ID: \`${sid}\`)`);
        }
    }
    return list.join('\\n');
}

module.exports = { handleInteraction, handleButton, checkRole, findServerMatch, buildServerListString, resolveServerId };
