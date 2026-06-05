const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const processManager = require('../../processManager');
const { getServer } = require('../../serverHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Gracefully stop the Minecraft server'),

    requiredRole: 'admin',

    async execute(interaction, serverId) {
        await interaction.deferReply();

        try {
            const server = await getServer(serverId);
            if (!server) {
                return interaction.editReply({ embeds: [errorEmbed('Server not found in the panel database.')] });
            }

            const status = processManager.getStatus(serverId.toString());
            if (status !== 'online') {
                return interaction.editReply({ embeds: [errorEmbed('Server is not running.')] });
            }

            if (!processManager.acquireLock(serverId.toString())) {
                return interaction.editReply({ embeds: [errorEmbed('Another lifecycle action is in progress.')] });
            }

            try {
                const result = await processManager.gracefulStop(serverId.toString(), 15000);

                if (!result.wasRunning) {
                    const embed = new EmbedBuilder()
                        .setTitle('ℹ️ Server Status')
                        .setDescription('Server was not running.')
                        .setColor(0x3b82f6)
                        .setTimestamp()
                        .setFooter({ text: 'MinePanel' });
                    return interaction.editReply({ embeds: [embed] });
                }

                if (result.graceful) {
                    processManager.clearHistory(serverId.toString());
                    const embed = new EmbedBuilder()
                        .setTitle('🔴 Server Stopped')
                        .setDescription(`**${server.name}** stopped gracefully.`)
                        .setColor(0xef4444)
                        .setTimestamp()
                        .setFooter({ text: 'MinePanel' });
                    return interaction.editReply({ embeds: [embed] });
                } else {
                    const embed = new EmbedBuilder()
                        .setTitle('⚠️ Stop Pending')
                        .setDescription('Stop command was sent but the server has not exited yet. You may need to use the panel to force-kill.')
                        .setColor(0xf59e0b)
                        .setTimestamp()
                        .setFooter({ text: 'MinePanel' });
                    return interaction.editReply({ embeds: [embed] });
                }
            } finally {
                processManager.releaseLock(serverId.toString());
            }
        } catch (e) {
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
