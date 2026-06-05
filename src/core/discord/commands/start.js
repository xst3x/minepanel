const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const processManager = require('../../processManager');
const { getServer } = require('../../serverHelper');
const path = require('path');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Start the Minecraft server'),

    requiredRole: 'admin',

    async execute(interaction, serverId) {
        await interaction.deferReply();

        try {
            const server = await getServer(serverId);
            if (!server) {
                return interaction.editReply({ embeds: [errorEmbed('Server not found in the panel database.')] });
            }

            const status = processManager.getStatus(serverId.toString());
            if (status === 'online') {
                return interaction.editReply({ embeds: [errorEmbed('Server is already running.')] });
            }

            if (!processManager.acquireLock(serverId)) {
                return interaction.editReply({ embeds: [errorEmbed('Another lifecycle action is in progress.')] });
            }

            try {
                const { serverDir, jarFile, customArgs } = getStartInfo(server);

                if (!fs.existsSync(jarFile) && !customArgs) {
                    return interaction.editReply({ embeds: [errorEmbed('Server jar not found. It may still be downloading.')] });
                }

                processManager.clearHistory(serverId.toString());
                processManager.start(serverId.toString(), serverDir, [], jarFile, server.ram_mb, customArgs, server.java_path || 'java');

                const embed = new EmbedBuilder()
                    .setTitle('🟢 Server Starting')
                    .setDescription(`**${server.name}** is starting up...`)
                    .setColor(0x22c55e)
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
    const { getServerDir } = require('../../serverHelper');
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
