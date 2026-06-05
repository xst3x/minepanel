const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getServer, getServerDir } = require('../../serverHelper');
const processManager = require('../../processManager');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('players')
        .setDescription('List currently online players'),

    requiredRole: 'viewer',

    async execute(interaction, serverId) {
        await interaction.deferReply();

        try {
            const server = await getServer(serverId);
            if (!server) {
                return interaction.editReply({ embeds: [errorEmbed('Server not found.')] });
            }

            const status = processManager.getStatus(serverId.toString());
            if (status !== 'online') {
                const embed = new EmbedBuilder()
                    .setTitle('👥 Players')
                    .setDescription('Server is **offline**. No players to show.')
                    .setColor(0x6b7280)
                    .setTimestamp()
                    .setFooter({ text: `${server.name} • MinePanel` });
                return interaction.editReply({ embeds: [embed] });
            }

            // Try to read player data from various sources
            let playerList = [];

            // Method 1: Check ops.json / whitelist.json for a hint, but primarily
            // look at the log for recent join/leave to approximate online list.
            // The most reliable approach is to parse the server output after running /list.
            // We'll send the 'list' command and check recent console output after a short delay.
            const historyBefore = processManager.getHistory(serverId.toString()).join('');

            try {
                processManager.sendCommand(serverId.toString(), 'list');
            } catch (_) {
                return interaction.editReply({ embeds: [errorEmbed('Failed to query player list. Server may be unresponsive.')] });
            }

            // Wait a moment for the response
            await new Promise(r => setTimeout(r, 1500));

            const historyAfter = processManager.getHistory(serverId.toString()).join('');
            // Extract the new output that appeared after our command
            const newOutput = historyAfter.slice(historyBefore.length);
            const lines = newOutput.split('\n');

            // Parse "There are X of a max of Y players online: player1, player2"
            let playerCount = 0;
            let maxPlayers = 0;

            for (const line of lines) {
                const match = line.match(/There are (\d+) of a max of (\d+) players online:\s*(.*)/i);
                if (match) {
                    playerCount = parseInt(match[1]);
                    maxPlayers = parseInt(match[2]);
                    const names = match[3].trim();
                    if (names.length > 0) {
                        playerList = names.split(',').map(n => n.trim()).filter(n => n.length > 0);
                    }
                    break;
                }

                // Alternative format: "There are X of a max of Y players online."
                const match2 = line.match(/There are (\d+) of a max of (\d+) players online/i);
                if (match2) {
                    playerCount = parseInt(match2[1]);
                    maxPlayers = parseInt(match2[2]);
                    break;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('👥 Online Players')
                .setColor(playerCount > 0 ? 0x22c55e : 0x6b7280)
                .addFields(
                    { name: 'Players', value: `${playerCount}/${maxPlayers}`, inline: true },
                    { name: 'Server', value: server.name, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'MinePanel' });

            if (playerList.length > 0) {
                // Format player names in a nice list
                const formattedPlayers = playerList.map(p => `\`${p}\``).join(', ');
                embed.setDescription(formattedPlayers);
            } else if (playerCount === 0) {
                embed.setDescription('No players online.');
            } else {
                embed.setDescription(`${playerCount} player(s) online.`);
            }

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
