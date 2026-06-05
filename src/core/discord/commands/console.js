/**
 * /console — shows recent console output.
 * With live:true  →  🔴 LIVE mode: message auto-updates every ~4 s as new output arrives.
 *                    A "⏹ Stop Live" button ends the session early.
 *                    Session auto-stops after 10 minutes.
 */
const {
    SlashCommandBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const processManager   = require('../../processManager');
const { getServer }    = require('../../serverHelper');
const liveSessionMgr   = require('../liveSessionManager');

const MAX_DISPLAY_LINES = 30;
const UPDATE_DEBOUNCE   = 4000;  // ms – max edit rate to stay within Discord rate limits
const AUTO_STOP_MS      = 10 * 60 * 1000; // 10 minutes

// Strip ANSI escape codes so Discord ansi blocks render cleanly
function stripAnsi(str) {
    return str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('console')
        .setDescription('Show recent console output from the server')
        .addBooleanOption(opt =>
            opt.setName('live')
                .setDescription('Enable live mode — message updates automatically (default: false)')
                .setRequired(false))
        .addIntegerOption(opt =>
            opt.setName('lines')
                .setDescription('Lines to show in static mode (default 30, max 50)')
                .setRequired(false)
                .setMinValue(1).setMaxValue(50))
        .addStringOption(opt =>
            opt.setName('filter')
                .setDescription('Filter output (e.g. "ERROR", "joined")')
                .setRequired(false)),

    requiredRole: 'admin',

    // ─────────────────────────────────────────────────────
    async execute(interaction, serverId) {
        await interaction.deferReply();

        const server = await getServer(serverId);
        if (!server) {
            return interaction.editReply({ embeds: [errorEmbed('Server not found.')] });
        }

        const liveMode = interaction.options.getBoolean('live') ?? false;

        // ── Static mode (original behaviour) ─────────────
        if (!liveMode) {
            return this._staticConsole(interaction, server, serverId);
        }

        // ── Live mode ─────────────────────────────────────
        const sid = serverId.toString();

        // Stop any existing live console session for this server
        const existing = liveSessionMgr.getConsole(sid);
        if (existing) existing.cleanup();

        // Seed display lines from current history
        const seedLines = processManager
            .getHistory(sid).join('')
            .split('\n')
            .filter(l => l.trim())
            .map(stripAnsi)
            .slice(-MAX_DISPLAY_LINES);

        let displayLines = [...seedLines];
        let stopped      = false;
        let debounceTimer = null;
        let autoStopTimer = null;
        const startedAt   = Date.now();

        // ── Build embed ──
        const buildEmbed = (isStopped = false, timedOut = false) => {
            const lines  = displayLines.slice(-MAX_DISPLAY_LINES);
            let   output = lines.join('\n');
            if (output.length > 3800) {
                const cut = output.indexOf('\n', output.length - 3800);
                output = cut > 0 ? '…\n' + output.slice(cut + 1) : output.slice(-3800);
            }

            const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
            const mins       = Math.floor(elapsedSec / 60);
            const secs       = elapsedSec % 60;
            const elapsed    = `${mins}m ${secs}s`;

            let statusVal = '🔴 Live';
            if (isStopped) statusVal = timedOut ? '⏱ Auto-stopped (10 min)' : '⏹ Stopped';

            return new EmbedBuilder()
                .setTitle(isStopped
                    ? `📟 Console — ${server.name}`
                    : `🔴 LIVE Console — ${server.name}`)
                .setDescription(output.length > 0
                    ? `\`\`\`ansi\n${output}\n\`\`\``
                    : '*No output yet…*')
                .setColor(isStopped ? 0x6b7280 : 0xef4444)
                .addFields(
                    { name: 'Status',   value: statusVal,        inline: true },
                    { name: 'Lines',    value: `${lines.length}`, inline: true },
                    { name: 'Session',  value: elapsed,           inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'MinePanel • updates every ~4 s' });
        };

        const stopRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`live_console_stop_${sid}`)
                .setLabel('⏹ Stop Live')
                .setStyle(ButtonStyle.Danger)
        );

        // ── Debounced updater ──
        const scheduleUpdate = () => {
            if (stopped || debounceTimer) return;
            debounceTimer = setTimeout(async () => {
                debounceTimer = null;
                if (stopped) return;
                try {
                    await interaction.editReply({
                        embeds: [buildEmbed(false)],
                        components: [stopRow]
                    });
                } catch (_) {
                    // Interaction token expired or message deleted — give up
                    cleanup();
                }
            }, UPDATE_DEBOUNCE);
        };

        // ── Console output listener ──
        const consoleListener = (emittedId, output) => {
            if (emittedId.toString() !== sid) return;
            const newLines = stripAnsi(output).split('\n').filter(l => l.trim());
            displayLines.push(...newLines);
            scheduleUpdate();
        };

        // ── Server status listener (detect server going offline) ──
        const statusListener = (emittedId, status) => {
            if (emittedId.toString() !== sid) return;
            if (status === 'offline') {
                displayLines.push('[MinePanel] ⚠ Server stopped.');
                scheduleUpdate();
            }
        };

        // ── Cleanup ──
        const cleanup = () => {
            if (stopped) return;
            stopped = true;
            if (debounceTimer)  { clearTimeout(debounceTimer); debounceTimer = null; }
            if (autoStopTimer)  { clearTimeout(autoStopTimer); autoStopTimer = null; }
            processManager.removeListener('console', consoleListener);
            processManager.removeListener('status', statusListener);
            liveSessionMgr.delConsole(sid);
        };

        // ── Auto-stop after 10 min ──
        autoStopTimer = setTimeout(async () => {
            cleanup();
            try {
                await interaction.editReply({ embeds: [buildEmbed(true, true)], components: [] });
            } catch (_) {}
        }, AUTO_STOP_MS);

        // Register listeners
        processManager.on('console', consoleListener);
        processManager.on('status',  statusListener);

        // Register session
        liveSessionMgr.setConsole(sid, { stopped: false, interaction, buildEmbed, cleanup });

        // Send initial message
        await interaction.editReply({ embeds: [buildEmbed(false)], components: [stopRow] });
        scheduleUpdate();
    },

    // ─────────────────────────────────────────────────────
    // Static (non-live) console display
    // ─────────────────────────────────────────────────────
    async _staticConsole(interaction, server, serverId) {
        const lineCount = interaction.options.getInteger('lines') || 30;
        const filter    = interaction.options.getString('filter');
        const sid       = serverId.toString();

        const history = processManager.getHistory(sid);
        if (!history || history.length === 0) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle('📟 Console')
                    .setDescription('No console output available. The server may not be running.')
                    .setColor(0x6b7280)
                    .setTimestamp()
                    .setFooter({ text: `${server.name} • MinePanel` })]
            });
        }

        let allLines = history.join('').split('\n')
            .filter(l => l.trim())
            .map(stripAnsi);

        if (filter) {
            const f = filter.toLowerCase();
            allLines = allLines.filter(l => l.toLowerCase().includes(f));
        }

        const lines = allLines.slice(-lineCount);

        if (lines.length === 0) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle('📟 Console')
                    .setDescription(filter
                        ? `No lines matching filter: \`${filter}\``
                        : 'No output available.')
                    .setColor(0x6b7280)
                    .setTimestamp()
                    .setFooter({ text: `${server.name} • MinePanel` })]
            });
        }

        let output = lines.join('\n');
        if (output.length > 3900) {
            const cut = output.indexOf('\n', output.length - 3900);
            output = cut > 0 ? '…\n' + output.slice(cut + 1) : output.slice(-3900);
        }

        const statusIcon = processManager.getStatus(sid) === 'online' ? '🟢' : '🔴';

        return interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(`📟 Console — ${server.name}`)
                .setDescription(`\`\`\`ansi\n${output}\n\`\`\``)
                .setColor(0x1e293b)
                .addFields(
                    { name: 'Status', value: statusIcon, inline: true },
                    { name: 'Lines',  value: `${lines.length}/${allLines.length}`, inline: true },
                    ...(filter ? [{ name: 'Filter', value: `\`${filter}\``, inline: true }] : [])
                )
                .setTimestamp()
                .setFooter({ text: 'MinePanel — use /console live:true for real-time output' })]
        });
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
