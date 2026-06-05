const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const processManager = require('../../processManager');
const { getServer } = require('../../serverHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('execute')
        .setDescription('Send a command to the Minecraft server console')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('The command to execute (e.g. "say Hello" or "whitelist add Player")')
                .setRequired(true)),

    requiredRole: 'admin',

    async execute(interaction, serverId) {
        await interaction.deferReply();

        try {
            const server = await getServer(serverId);
            if (!server) {
                return interaction.editReply({ embeds: [errorEmbed('Server not found.')] });
            }

            const status = processManager.getStatus(serverId.toString());
            if (status !== 'online') {
                return interaction.editReply({ embeds: [errorEmbed('Server is not running. Start it first.')] });
            }

            const command = interaction.options.getString('command');

            processManager.sendCommand(serverId.toString(), command);

            const embed = new EmbedBuilder()
                .setTitle('💻 Command Sent')
                .setDescription(`\`\`\`\n${command}\n\`\`\``)
                .setColor(0x8b5cf6)
                .addFields(
                    { name: 'Server', value: server.name, inline: true },
                    { name: 'Sent by', value: interaction.user.tag, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'MinePanel • Check #server-console for output' });

            return interaction.editReply({ embeds: [embed] });
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
