const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { provisionGuild } = require('../discordProvisioner');
const { getServer } = require('../../serverHelper');
const { dbRun, dbGet } = require('../../../db/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('init')
        .setDescription('Recreate MinePanel roles and channels for this server')
        .addStringOption(option =>
            option.setName('server')
                .setDescription('The server name or ID to initialize (required if multiple servers)')
                .setRequired(false)),

    requiredRole: 'admin',

    async execute(interaction, serverId) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const server = await getServer(parseInt(serverId));
            if (!server) {
                return interaction.editReply({ embeds: [errorEmbed('Server not found.')] });
            }

            const integration = await dbGet(
                'SELECT * FROM discord_integrations WHERE server_id = ?',
                [serverId]
            );
            if (!integration) {
                return interaction.editReply({
                    embeds: [errorEmbed('No Discord integration found for this server.\nConnect the bot first from the panel.')]
                });
            }

            const waitEmbed = new EmbedBuilder()
                .setTitle('⚙️ Reinitializing...')
                .setDescription('Recreating roles and channels. This may take a few seconds.')
                .setColor(0xf59e0b)
                .setTimestamp()
                .setFooter({ text: 'MinePanel' });

            await interaction.editReply({ embeds: [waitEmbed] });

            // Run provisioner — it handles create-if-missing + delete legacy Viewer role
            const resources = await provisionGuild(
                interaction.client,
                integration.guild_id,
                server.name,
                integration
            );

            // Persist the new IDs
            await dbRun(
                `UPDATE discord_integrations SET
                    admin_role_id = ?, viewer_role_id = ?, category_id = ?,
                    log_channel_id = ?, console_channel_id = ?, status_channel_id = ?,
                    provisioned = 1, updated_at = CURRENT_TIMESTAMP
                WHERE server_id = ?`,
                [
                    resources.adminRoleId,
                    resources.viewerRoleId,
                    resources.categoryId,
                    resources.logChannelId,
                    resources.consoleChannelId,
                    resources.statusChannelId,
                    serverId
                ]
            );

            // Hot-update the event bridge with the new channel/role IDs
            // This swaps IDs in-place without restarting listeners
            const eventBridge = require('../discordEventBridge');
            const updatedIntegration = await dbGet(
                'SELECT * FROM discord_integrations WHERE server_id = ?',
                [serverId]
            );

            const hotUpdated = eventBridge.updateIntegration(serverId.toString(), updatedIntegration);
            if (!hotUpdated) {
                // Bridge wasn't running — do a full attach
                eventBridge.attach(serverId.toString(), interaction.client, updatedIntegration);
            }

            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Reinitialized')
                .setDescription(`Roles and channels for **${server.name}** have been recreated successfully.`)
                .setColor(0x22c55e)
                .addFields(
                    { name: '🔑 Admin Role',     value: `<@&${resources.adminRoleId}>`,     inline: true },
                    { name: '🔑 Moderator Role', value: `<@&${resources.viewerRoleId}>`,    inline: true },
                    { name: '\u200b',            value: '\u200b',                           inline: true },
                    { name: '📟 Console',        value: `<#${resources.consoleChannelId}>`, inline: true },
                    { name: '📊 Status',         value: `<#${resources.statusChannelId}>`,  inline: true },
                    { name: '⌨️ Commands',        value: `<#${resources.logChannelId}>`,    inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'MinePanel' });

            return interaction.editReply({ embeds: [successEmbed] });

        } catch (e) {
            console.error(`[Discord] /init failed for server ${serverId}:`, e.message);
            return interaction.editReply({ embeds: [errorEmbed(e.message)] });
        }
    }
};

function errorEmbed(message) {
    return new EmbedBuilder()
        .setTitle('❌ Error')
        .setDescription(message)
        .setColor(0xef4444)
        .setTimestamp()
        .setFooter({ text: 'MinePanel' });
}
