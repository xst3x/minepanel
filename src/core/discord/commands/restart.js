const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const processManager = require('../../processManager');
const { getServer, getServerDir } = require('../../serverHelper');
const path = require('path');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('restart')
        .setDescription('Restart the Minecraft server (graceful stop then start)'),

    requiredRole: 'admin',

    async execute(interaction, serverId) {
        await interaction.deferReply();

        try {
            const server = await getServer(serverId);
            if (!server) {
                return interaction.editReply({ embeds: [errorEmbed('Server not found in the panel database.')] });
            }

            const { serverDir, jarFile, customArgs } = getStartInfo(server);

            if (!fs.existsSync(jarFile) && !customArgs) {
                return interaction.editReply({ embeds: [errorEmbed('Server jar not found.')] });
            }

            if (!processManager.acquireLock(serverId)) {
                return interaction.editReply({ embeds: [errorEmbed('Another lifecycle action is in progress.')] });
            }

            try {
                processManager.clearHistory(serverId.toString());

                const result = await processManager.restartGraceful(
                    serverId.toString(), serverDir, [], jarFile, server.ram_mb, 15000, customArgs, server.java_path || 'java'
                );

                if (!result.graceful) {
                    const embed = new EmbedBuilder()
                        .setTitle('⚠️ Restart Failed')
                        .setDescription(result.message || 'Server did not stop within timeout. Use the panel to force-kill.')
                        .setColor(0xf59e0b)
                        .setTimestamp()
                        .setFooter({ text: 'MinePanel' });
                    return interaction.editReply({ embeds: [embed] });
                }

                const embed = new EmbedBuilder()
                    .setTitle(result.started ? '🔄 Server Restarted' : '⚠️ Restart Partial')
                    .setDescription(result.started
                        ? `**${server.name}** is restarting...`
                        : `Server stopped but failed to start: ${result.message}`)
                    .setColor(result.started ? 0x22c55e : 0xf59e0b)
                    .setTimestamp()
                    .setFooter({ text: 'MinePanel' });

                return interaction.editReply({ embeds: [embed] });
            } finally {
                processManager.releaseLock(serverId);
            }
        } catch (e) {
            return interaction.editReply({ embeds: [errorEmbed(e.message)] });
        }
    }
};

function getStartInfo(server) {
    const serverDir = getServerDir(server);
    const jarFile = path.join(serverDir, 'server.jar');

    let customArgs = null;
    try {
        if (server.software === 'forge') {
            const isWin = process.platform === 'win32';
            const runScript = path.join(serverDir, isWin ? 'run.bat' : 'run.sh');
            if (fs.existsSync(runScript)) {
                const content = fs.readFileSync(runScript, 'utf8');
                const lines = content.split('\n');
                for (const line of lines) {
                    if (line.trim().startsWith('java ')) {
                        let argsStr = line.trim().substring(5);
                        argsStr = argsStr.replace(/%\*/g, '').replace(/"$@"/g, '').replace(/\$@/g, '').trim();
                        if (argsStr.includes('@user_jvm_args.txt') || argsStr.includes('libraries/')) {
                            customArgs = argsStr.split(/\s+/).filter(a => a.length > 0);
                            break;
                        }
                    }
                }
            }
        }
    } catch (_) {}

    return { serverDir, jarFile, customArgs };
}

function errorEmbed(message) {
    return new EmbedBuilder()
        .setTitle('❌ Error')
        .setDescription(message)
        .setColor(0xef4444)
        .setTimestamp()
        .setFooter({ text: 'MinePanel' });
}
