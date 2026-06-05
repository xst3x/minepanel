const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getServer, getServerDir } = require('../../serverHelper');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gunzip = promisify(zlib.gunzip);
const LINES_PER_PAGE = 30;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('logs')
        .setDescription('View server log files with pagination')
        .addStringOption(option =>
            option.setName('file')
                .setDescription('Log file to view (default: latest.log)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('filter')
                .setDescription('Filter log lines (e.g. "ERROR", "WARN", "joined")')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Page number (default: last page)')
                .setRequired(false)
                .setMinValue(1)),

    requiredRole: 'viewer',

    async execute(interaction, serverId) {
        await interaction.deferReply();

        try {
            const server = await getServer(serverId);
            if (!server) {
                return interaction.editReply({ embeds: [errorEmbed('Server not found.')] });
            }

            const file = interaction.options.getString('file') || 'latest.log';
            const filter = interaction.options.getString('filter');
            const requestedPage = interaction.options.getInteger('page');

            // Security: prevent path traversal
            if (file.includes('..') || file.includes('/') || file.includes('\\')) {
                return interaction.editReply({ embeds: [errorEmbed('Invalid filename.')] });
            }

            const logsDir = path.join(getServerDir(server), 'logs');
            const logPath = path.join(logsDir, file);

            if (!fs.existsSync(logPath)) {
                // List available log files
                let availableFiles = [];
                if (fs.existsSync(logsDir)) {
                    const files = await fsp.readdir(logsDir);
                    availableFiles = files
                        .filter(f => f.endsWith('.log') || f.endsWith('.log.gz'))
                        .slice(0, 15);
                }

                const embed = new EmbedBuilder()
                    .setTitle('📜 Log File Not Found')
                    .setDescription(`\`${file}\` was not found.`)
                    .setColor(0xf59e0b);

                if (availableFiles.length > 0) {
                    embed.addFields({
                        name: 'Available Logs',
                        value: availableFiles.map(f => `\`${f}\``).join('\n')
                    });
                }

                embed.setTimestamp().setFooter({ text: 'MinePanel' });
                return interaction.editReply({ embeds: [embed] });
            }

            // Read and decompress
            const buffer = await fsp.readFile(logPath);
            let content;
            if (file.endsWith('.log.gz')) {
                content = (await gunzip(buffer)).toString('utf8');
            } else {
                content = buffer.toString('utf8');
            }

            let lines = content.split('\n');
            if (filter) {
                const fl = filter.toLowerCase();
                lines = lines.filter(l => l.toLowerCase().includes(fl));
            }

            const totalLines = lines.length;
            const totalPages = Math.ceil(totalLines / LINES_PER_PAGE) || 1;
            const currentPage = requestedPage
                ? Math.max(1, Math.min(requestedPage, totalPages))
                : totalPages; // Default to last page

            const startIdx = (currentPage - 1) * LINES_PER_PAGE;
            const pageLines = lines.slice(startIdx, startIdx + LINES_PER_PAGE);

            let output = pageLines.join('\n');
            if (output.length > 3900) {
                output = output.slice(0, 3900) + '\n…(truncated)';
            }

            const embed = new EmbedBuilder()
                .setTitle(`📜 Logs — ${file}`)
                .setDescription(`\`\`\`\n${output || '(empty)'}\n\`\`\``)
                .setColor(0x1e293b)
                .addFields(
                    { name: 'Page', value: `${currentPage}/${totalPages}`, inline: true },
                    { name: 'Total Lines', value: `${totalLines}`, inline: true },
                    ...(filter ? [{ name: 'Filter', value: `\`${filter}\``, inline: true }] : [])
                )
                .setTimestamp()
                .setFooter({ text: `${server.name} • MinePanel` });

            // Pagination buttons
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`logs_prev_${serverId}_${file}_${currentPage}_${filter || ''}`)
                    .setLabel('◀ Prev')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage <= 1),
                new ButtonBuilder()
                    .setCustomId(`logs_next_${serverId}_${file}_${currentPage}_${filter || ''}`)
                    .setLabel('Next ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage >= totalPages),
                new ButtonBuilder()
                    .setCustomId(`logs_first_${serverId}_${file}_${currentPage}_${filter || ''}`)
                    .setLabel('⏪ First')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage <= 1),
                new ButtonBuilder()
                    .setCustomId(`logs_last_${serverId}_${file}_${currentPage}_${filter || ''}`)
                    .setLabel('Last ⏩')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(currentPage >= totalPages)
            );

            return interaction.editReply({ embeds: [embed], components: [row] });
        } catch (e) {
            return interaction.editReply({ embeds: [errorEmbed(e.message)] });
        }
    },

    /**
     * Handle pagination button interactions.
     */
    async handleButton(interaction, serverId) {
        const customId = interaction.customId;
        const parts = customId.split('_');
        // logs_prev_{serverId}_{file}_{currentPage}_{filter}
        const action = parts[1]; // prev, next, first, last
        const file = parts[3];
        const currentPage = parseInt(parts[4]);
        const filter = parts[5] || null;

        const server = await getServer(serverId);
        if (!server) return;

        const logsDir = path.join(getServerDir(server), 'logs');
        const logPath = path.join(logsDir, file);
        if (!fs.existsSync(logPath)) return;

        const buffer = await fsp.readFile(logPath);
        let content;
        if (file.endsWith('.log.gz')) {
            content = (await gunzip(buffer)).toString('utf8');
        } else {
            content = buffer.toString('utf8');
        }

        let lines = content.split('\n');
        if (filter) {
            const fl = filter.toLowerCase();
            lines = lines.filter(l => l.toLowerCase().includes(fl));
        }

        const totalLines = lines.length;
        const totalPages = Math.ceil(totalLines / LINES_PER_PAGE) || 1;

        let newPage;
        switch (action) {
            case 'prev': newPage = Math.max(1, currentPage - 1); break;
            case 'next': newPage = Math.min(totalPages, currentPage + 1); break;
            case 'first': newPage = 1; break;
            case 'last': newPage = totalPages; break;
            default: newPage = currentPage;
        }

        const startIdx = (newPage - 1) * LINES_PER_PAGE;
        const pageLines = lines.slice(startIdx, startIdx + LINES_PER_PAGE);

        let output = pageLines.join('\n');
        if (output.length > 3900) {
            output = output.slice(0, 3900) + '\n…(truncated)';
        }

        const embed = new EmbedBuilder()
            .setTitle(`📜 Logs — ${file}`)
            .setDescription(`\`\`\`\n${output || '(empty)'}\n\`\`\``)
            .setColor(0x1e293b)
            .addFields(
                { name: 'Page', value: `${newPage}/${totalPages}`, inline: true },
                { name: 'Total Lines', value: `${totalLines}`, inline: true },
                ...(filter ? [{ name: 'Filter', value: `\`${filter}\``, inline: true }] : [])
            )
            .setTimestamp()
            .setFooter({ text: `${server.name} • MinePanel` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`logs_prev_${serverId}_${file}_${newPage}_${filter || ''}`)
                .setLabel('◀ Prev')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(newPage <= 1),
            new ButtonBuilder()
                .setCustomId(`logs_next_${serverId}_${file}_${newPage}_${filter || ''}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(newPage >= totalPages),
            new ButtonBuilder()
                .setCustomId(`logs_first_${serverId}_${file}_${newPage}_${filter || ''}`)
                .setLabel('⏪ First')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(newPage <= 1),
            new ButtonBuilder()
                .setCustomId(`logs_last_${serverId}_${file}_${newPage}_${filter || ''}`)
                .setLabel('Last ⏩')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(newPage >= totalPages)
        );

        await interaction.update({ embeds: [embed], components: [row] });
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
