"use strict";
const discord_js_1 = require("discord.js");
const processManager = require("../../processManager");
const { getServer } = require('../../serverHelper');
function errorEmbed(message) {
    return new discord_js_1.EmbedBuilder()
        .setTitle('❌ Error')
        .setDescription(message)
        .setColor(0xef4444)
        .setTimestamp()
        .setFooter({ text: 'MinePanel' });
}
module.exports = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('status')
        .setDescription('Show the current server status'),
    requiredRole: 'viewer',
    async execute(interaction, serverId) {
        await interaction.deferReply();
        try {
            const server = await getServer(serverId);
            if (!server) {
                return interaction.editReply({ embeds: [errorEmbed('Server not found.')] });
            }
            const isOnline = processManager.getStatus(serverId.toString()) === 'online';
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`${isOnline ? '🟢' : '🔴'} ${server.name}`)
                .setColor(isOnline ? 0x22c55e : 0xef4444)
                .addFields({ name: 'Status', value: isOnline ? '**Online**' : '**Offline**', inline: true }, { name: 'Software', value: `${server.software} ${server.version}`, inline: true }, { name: 'Port', value: `${server.port}`, inline: true }, { name: 'RAM', value: `${server.ram_mb} MB`, inline: true })
                .setTimestamp()
                .setFooter({ text: 'MinePanel' });
            // Control buttons
            const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                .setCustomId(`control_start_${serverId}`)
                .setLabel('▶ Start')
                .setStyle(discord_js_1.ButtonStyle.Success)
                .setDisabled(isOnline), new discord_js_1.ButtonBuilder()
                .setCustomId(`control_stop_${serverId}`)
                .setLabel('⏹ Stop')
                .setStyle(discord_js_1.ButtonStyle.Danger)
                .setDisabled(!isOnline), new discord_js_1.ButtonBuilder()
                .setCustomId(`control_restart_${serverId}`)
                .setLabel('🔄 Restart')
                .setStyle(discord_js_1.ButtonStyle.Primary)
                .setDisabled(!isOnline), new discord_js_1.ButtonBuilder()
                .setCustomId(`control_refresh_${serverId}`)
                .setLabel('🔃 Refresh')
                .setStyle(discord_js_1.ButtonStyle.Secondary));
            return interaction.editReply({ embeds: [embed], components: [row] });
        }
        catch (e) {
            return interaction.editReply({ embeds: [errorEmbed(e.message)] });
        }
    }
};
//# sourceMappingURL=status.js.map