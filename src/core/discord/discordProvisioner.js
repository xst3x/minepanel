/**
 * Discord Provisioner — auto-creates roles and channels when a bot is first connected.
 *
 * Role layout:
 *   Server Admin     — can view + write in #console and #commands, see all channels
 *   Server Moderator — can view all 3 channels (read-only everywhere)
 *
 * Channel layout:
 *   #console   — bot streams server output here; Admins can also type commands
 *   #status    — pinned live status embed, auto-updated every 30 s (read-only)
 *   #commands  — Admins type Minecraft commands here; bot forwards to server stdin
 *
 * Channels are tracked by Discord ID in the DB.
 * Users can freely rename, move, or re-topic any channel — bot always finds them by ID.
 */
const { ChannelType, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

async function fetchRole(guild, roleId) {
    if (!roleId) return null;
    try {
        return await guild.roles.fetch(roleId);
    } catch (_) {
        return null;
    }
}

async function fetchChannel(guild, channelId) {
    if (!channelId) return null;
    try {
        return await guild.channels.fetch(channelId);
    } catch (_) {
        return null;
    }
}

async function provisionGuild(client, guildId, serverName, integration = null) {
    const guild = await client.guilds.fetch(guildId);
    if (!guild) throw new Error(`Bot is not in guild ${guildId}. Please invite the bot first.`);

    const botMember = await guild.members.fetchMe();
    for (const perm of [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels]) {
        if (!botMember.permissions.has(perm))
            throw new Error('Bot is missing required permissions: Manage Roles, Manage Channels');
    }

    const safeName = serverName.replace(/[^a-zA-Z0-9\s-]/g, '').slice(0, 30);

    // ── Roles ─────────────────────────────────────────────────────────────────
    let adminRole = null;
    if (integration) {
        adminRole = await fetchRole(guild, integration.admin_role_id);
    }

    const existingRoles = await guild.roles.fetch();

    if (!adminRole) {
        adminRole = existingRoles.find(r => r.name === `${safeName} Admin`);
    }

    if (!adminRole) {
        adminRole = await guild.roles.create({
            name: `${safeName} Admin`,
            color: 0xe74c3c,
            mentionable: false,
            reason: `MinePanel: Admin role for "${serverName}"`
        });
    }

    // Delete legacy Viewer role if it still exists from a previous provisioning
    const legacyViewerRole = existingRoles.find(r => r.name === `${safeName} Viewer`);
    if (legacyViewerRole) {
        try {
            await legacyViewerRole.delete('MinePanel: Replaced by Moderator role');
            console.log(`[Provisioner] Deleted legacy Viewer role for "${serverName}"`);
        } catch (_) {}
    }

    // Server Moderator — read-only access to all channels
    let moderatorRole = null;
    if (integration) {
        moderatorRole = await fetchRole(guild, integration.viewer_role_id);
    }

    if (!moderatorRole) {
        moderatorRole = existingRoles.find(r => r.name === `${safeName} Moderator`);
    }

    if (!moderatorRole) {
        moderatorRole = await guild.roles.create({
            name: `${safeName} Moderator`,
            color: 0xf59e0b,
            mentionable: false,
            reason: `MinePanel: Moderator role for "${serverName}"`
        });
    }

    // ── Category ──────────────────────────────────────────────────────────────
    let category = null;
    if (integration) {
        category = await fetchChannel(guild, integration.category_id);
    }

    const categoryName = `🎮 ${safeName}`;
    if (!category) {
        category = guild.channels.cache.find(
            c => c.type === ChannelType.GuildCategory && c.name === categoryName
        );
    }

    if (!category) {
        category = await guild.channels.create({
            name: categoryName,
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
                { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                {
                    id: botMember.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ManageMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.ManageChannels
                    ]
                }
            ],
            reason: `MinePanel: Category for "${serverName}"`
        });
    }

    // ── #console ──────────────────────────────────────────────────────────────
    //   Bot writes server output here.
    //   Admin: view + send (they can type commands directly here too).
    //   Moderator: view only.
    const consoleChannel = await findOrCreateChannel(guild, integration?.console_channel_id, 'console', category, botMember, {
        topic: `📟 Live console output for ${serverName}. Admins can type commands here too.`,
        permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
                id: botMember.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            {
                // Admin — can view AND write (commands go to server stdin via bridge)
                id: adminRole.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            {
                // Moderator — view only
                id: moderatorRole.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny:  [PermissionFlagsBits.SendMessages]
            }
        ]
    });

    // ── #status ───────────────────────────────────────────────────────────────
    //   Pinned live embed, nobody types here.
    //   Admin + Moderator: view only.
    const statusChannel = await findOrCreateChannel(guild, integration?.status_channel_id, 'status', category, botMember, {
        topic: `📊 Live server status for ${serverName} — auto-updates every 30 s.`,
        permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
                id: botMember.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.ManageChannels
                ]
            },
            {
                id: adminRole.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny:  [PermissionFlagsBits.SendMessages]
            },
            {
                id: moderatorRole.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny:  [PermissionFlagsBits.SendMessages]
            }
        ]
    });

    // ── #commands ─────────────────────────────────────────────────────────────
    //   Primary input channel. Admin: view + write. Moderator: view only.
    const commandsChannel = await findOrCreateChannel(guild, integration?.log_channel_id, 'commands', category, botMember, {
        topic: `⌨️ Send commands to ${serverName} — type any Minecraft command, bot forwards it instantly. Admin only.`,
        permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            {
                id: botMember.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ManageMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            {
                id: adminRole.id,
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.ReadMessageHistory
                ]
            },
            {
                id: moderatorRole.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                deny:  [PermissionFlagsBits.SendMessages]
            }
        ]
    });

    // ── Welcome embed in #commands ────────────────────────────────────────────
    try {
        const welcome = new EmbedBuilder()
            .setTitle('🎮 MinePanel — Ready')
            .setDescription(
                `**${serverName}** is now connected to Discord.\n\n` +
                `Admins can type Minecraft commands directly in this channel or in <#${consoleChannel.id}>.`
            )
            .setColor(0x22c55e)
            .addFields(
                {
                    name: '📟 Console',
                    value: `<#${consoleChannel.id}>\nLive server output.\nAdmins can type commands here.`,
                    inline: true
                },
                {
                    name: '📊 Status',
                    value: `<#${statusChannel.id}>\nLive stats, auto-updates every 30 s.`,
                    inline: true
                },
                {
                    name: '⌨️ Commands',
                    value: `<#${commandsChannel.id}>\nAdmins type commands here.`,
                    inline: true
                },
                {
                    name: '🔑 Roles',
                    value: [
                        `<@&${adminRole.id}> — View + write in #console and #commands`,
                        `<@&${moderatorRole.id}> — View all channels (read-only)`
                    ].join('\n')
                },
                {
                    name: 'Slash Commands',
                    value: [
                        '`/status` — Status panel with Start/Stop/Restart buttons',
                        '`/console` `live:true` — Live console in any channel',
                        '`/stats` `live:true` — Live CPU & RAM',
                        '`/start` `/stop` `/restart` — Server control',
                        '`/execute` — Run a command via slash',
                        '`/players` — Online player list',
                        '`/logs` — Browse log files'
                    ].join('\n')
                },
                {
                    name: '💡 Tip',
                    value: 'You can rename, move, or re-topic these channels freely — the bot tracks them by ID.',
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({ text: 'MinePanel' });

        await commandsChannel.send({ embeds: [welcome], flags: [MessageFlags.SuppressNotifications] });
    } catch (_) {}

    return {
        adminRoleId:      adminRole.id,
        viewerRoleId:     moderatorRole.id,   // stored in viewer_role_id column → moderator
        categoryId:       category.id,
        logChannelId:     commandsChannel.id, // stored in log_channel_id column → commands channel
        consoleChannelId: consoleChannel.id,
        statusChannelId:  statusChannel.id
    };
}

// ─────────────────────────────────────────────────────────────────────────────

async function findOrCreateChannel(guild, channelId, name, category, botMember, opts) {
    let channel = await fetchChannel(guild, channelId);
    if (!channel) {
        // Look up by name within this category
        channel = guild.channels.cache.find(
            c => c.name === name && c.parentId === category.id
        );
    }
    if (channel) return channel;

    return guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: opts.topic || '',
        permissionOverwrites: opts.permissionOverwrites,
        reason: 'MinePanel: Auto-provisioned channel'
    });
}

// ─────────────────────────────────────────────────────────────────────────────

async function deprovisionGuild(client, guildId, resourceIds) {
    try {
        const guild = await client.guilds.fetch(guildId);
        if (!guild) return;

        const { adminRoleId, viewerRoleId, categoryId, logChannelId, consoleChannelId, statusChannelId } = resourceIds;

        for (const channelId of [logChannelId, consoleChannelId, statusChannelId]) {
            if (!channelId) continue;
            try {
                const ch = await guild.channels.fetch(channelId);
                if (ch) await ch.delete('MinePanel: Integration removed');
            } catch (_) {}
        }

        // Delete category directly via its stored ID
        if (categoryId) {
            try {
                const cat = await guild.channels.fetch(categoryId);
                if (cat) await cat.delete('MinePanel: Integration removed');
            } catch (_) {}
        } else {
            // Fallback legacy cleanup: Delete category if now empty
            try {
                for (const [, ch] of guild.channels.cache) {
                    if (
                        ch.type === ChannelType.GuildCategory &&
                        ch.name.includes('🎮') &&
                        ch.children?.cache?.size === 0
                    ) {
                        await ch.delete('MinePanel: Category empty after cleanup');
                    }
                }
            } catch (_) {}
        }

        for (const roleId of [adminRoleId, viewerRoleId]) {
            if (!roleId) continue;
            try {
                const role = await guild.roles.fetch(roleId);
                if (role) await role.delete('MinePanel: Integration removed');
            } catch (_) {}
        }
    } catch (_) {}
}

module.exports = { provisionGuild, deprovisionGuild };
