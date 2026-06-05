/**
 * /stats — shows server resource usage.
 * With live:true  →  📡 LIVE mode: embed updates every 5 s with real CPU/RAM data.
 *                    Player count refreshes every 30 s (via /list command).
 *                    A "⏹ Stop Live" button ends the session.
 *                    Session auto-stops after 10 minutes.
 */
const {
    SlashCommandBuilder, EmbedBuilder,
    ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const processManager = require('../../processManager');
const { getServer }  = require('../../serverHelper');
const liveSessionMgr = require('../liveSessionManager');
const os             = require('os');

const STATS_INTERVAL_MS = 5000;
const PLAYER_REFRESH_EVERY = 6;   // ticks → every 30 s
const AUTO_STOP_MS = 10 * 60 * 1000;

// ── Helpers ────────────────────────────────────────────────────────────────

function progressBar(value, max, length = 18) {
    const pct    = Math.max(0, Math.min(100, (value / max) * 100));
    const filled = Math.round((pct / 100) * length);
    return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function fmtRam(bytes) {
    return Math.round(bytes / 1024 / 1024);
}

function barColor(cpu) {
    if (cpu > 80) return 0xef4444;
    if (cpu > 50) return 0xf59e0b;
    return 0x22c55e;
}

function fmtElapsed(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
}

/**
 * Send the Minecraft /list command and parse the response.
 * Returns { playerCount, maxPlayers } or null on failure.
 */
async function fetchPlayerCount(serverId) {
    const sid = serverId.toString();
    if (processManager.getStatus(sid) !== 'online') return null;

    const histBefore = processManager.getHistory(sid).join('');
    try { processManager.sendCommand(sid, 'list'); } catch (_) { return null; }

    await new Promise(r => setTimeout(r, 1600));

    const newOutput = processManager.getHistory(sid).join('').slice(histBefore.length);
    for (const line of newOutput.split('\n')) {
        const m = line.match(/There are (\d+) of a max of (\d+) players online/i);
        if (m) return { playerCount: parseInt(m[1]), maxPlayers: parseInt(m[2]) };
    }
    return null;
}

// ── Build the stats embed ──────────────────────────────────────────────────

function buildStatsEmbed(session, isStopped = false, timedOut = false) {
    const { server, cpu, ramMB, ramMax, playerCount, maxPlayers, startedAt } = session;
    const isOnline = processManager.getStatus(session.serverId) === 'online';

    const ramPct   = ramMax > 0 ? Math.round((ramMB / ramMax) * 100) : 0;
    const cpuBar   = progressBar(cpu, 100);
    const ramBar   = progressBar(ramPct, 100);

    let statusVal = isStopped
        ? (timedOut ? '⏱ Auto-stopped (10 min)' : '⏹ Stopped')
        : (isOnline ? '📡 Live' : '🔴 Offline');

    const embed = new EmbedBuilder()
        .setTitle(isStopped
            ? `📊 Stats — ${server.name}`
            : `📡 LIVE Stats — ${server.name}`)
        .setColor(isStopped ? 0x6b7280 : barColor(cpu))
        .addFields(
            {
                name: '🔧 CPU',
                value: `\`${cpuBar}\` **${cpu}%**`,
                inline: false
            },
            {
                name: '💾 RAM',
                value: `\`${ramBar}\` **${ramMB}** / ${ramMax} MB (**${ramPct}%**)`,
                inline: false
            },
            {
                name: '👥 Players',
                value: playerCount !== null ? `${playerCount} / ${maxPlayers}` : '—',
                inline: true
            },
            {
                name: '⏱ Uptime',
                value: isOnline ? fmtElapsed(Date.now() - startedAt) : '—',
                inline: true
            },
            {
                name: '🖥 Host CPU',
                value: `${os.cpus().length} cores`,
                inline: true
            },
            {
                name: 'Software',
                value: `${server.software} ${server.version}`,
                inline: true
            },
            {
                name: 'Port',
                value: `${server.port}`,
                inline: true
            },
            {
                name: 'Status',
                value: statusVal,
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({ text: isStopped ? 'MinePanel' : 'MinePanel • updates every 5 s' });

    return embed;
}

// ── Module ─────────────────────────────────────────────────────────────────

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Show server resource usage (CPU, RAM, players)')
        .addBooleanOption(opt =>
            opt.setName('live')
                .setDescription('Enable live mode — auto-updates every 5 s (default: false)')
                .setRequired(false)),

    requiredRole: 'viewer',

    async execute(interaction, serverId) {
        await interaction.deferReply();

        const server = await getServer(serverId);
        if (!server) {
            return interaction.editReply({ embeds: [errorEmbed('Server not found.')] });
        }

        const sid      = serverId.toString();
        const liveMode = interaction.options.getBoolean('live') ?? false;
        const isOnline = processManager.getStatus(sid) === 'online';

        if (!isOnline) {
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle('📊 Server Stats')
                    .setDescription('Server is **offline**. No stats available.')
                    .setColor(0x6b7280)
                    .setTimestamp()
                    .setFooter({ text: `${server.name} • MinePanel` })]
            });
        }

        // ── Static mode ──────────────────────────────────
        if (!liveMode) {
            return this._staticStats(interaction, server, sid);
        }

        // ── Live mode ────────────────────────────────────
        // Stop any existing stats session for this server
        const existing = liveSessionMgr.getStats(sid);
        if (existing) existing.cleanup();

        // Fetch initial data
        const initialStats = await processManager.getStats(sid);
        const initialPlayers = await fetchPlayerCount(sid);

        const session = {
            serverId: sid,
            server,
            interaction,
            cpu:          Math.round(initialStats.cpu * 10) / 10,
            ramMB:        fmtRam(initialStats.ram),
            ramMax:       server.ram_mb,
            playerCount:  initialPlayers ? initialPlayers.playerCount  : null,
            maxPlayers:   initialPlayers ? initialPlayers.maxPlayers    : server.max_players || 20,
            startedAt:    Date.now(),
            tickCount:    0,
            stopped:      false,
            intervalId:   null,
            autoStopTimer: null,
            buildEmbed:   (isStopped, timedOut) => buildStatsEmbed(session, isStopped, timedOut),
            cleanup:      null // assigned below
        };

        const stopRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`live_stats_stop_${sid}`)
                .setLabel('⏹ Stop Live')
                .setStyle(ButtonStyle.Danger)
        );

        // ── Cleanup ──
        const cleanup = () => {
            if (session.stopped) return;
            session.stopped = true;
            clearInterval(session.intervalId);
            clearTimeout(session.autoStopTimer);
            liveSessionMgr.delStats(sid);
        };
        session.cleanup = cleanup;

        // ── Poll interval ──
        session.intervalId = setInterval(async () => {
            if (session.stopped) return;

            // Check if server went offline
            if (processManager.getStatus(sid) !== 'online') {
                session.cpu   = 0;
                session.ramMB = 0;
                try {
                    await interaction.editReply({
                        embeds: [buildStatsEmbed(session, false)],
                        components: [stopRow]
                    });
                } catch (_) { cleanup(); }
                return;
            }

            // Fetch CPU/RAM
            try {
                const fresh = await processManager.getStats(sid);
                session.cpu   = Math.round(fresh.cpu * 10) / 10;
                session.ramMB = fmtRam(fresh.ram);
            } catch (_) {}

            // Refresh player count every PLAYER_REFRESH_EVERY ticks
            session.tickCount++;
            if (session.tickCount % PLAYER_REFRESH_EVERY === 0) {
                const p = await fetchPlayerCount(sid);
                if (p) {
                    session.playerCount = p.playerCount;
                    session.maxPlayers  = p.maxPlayers;
                }
            }

            try {
                await interaction.editReply({
                    embeds: [buildStatsEmbed(session, false)],
                    components: [stopRow]
                });
            } catch (_) {
                cleanup(); // Interaction token likely expired
            }
        }, STATS_INTERVAL_MS);

        // ── Auto-stop ──
        session.autoStopTimer = setTimeout(async () => {
            cleanup();
            try {
                await interaction.editReply({ embeds: [buildStatsEmbed(session, true, true)], components: [] });
            } catch (_) {}
        }, AUTO_STOP_MS);

        liveSessionMgr.setStats(sid, session);

        // Initial message
        await interaction.editReply({
            embeds: [buildStatsEmbed(session, false)],
            components: [stopRow]
        });
    },

    // ── Static stats (original behaviour) ─────────────────
    async _staticStats(interaction, server, sid) {
        try {
            const stats    = await processManager.getStats(sid);
            const ramMB    = fmtRam(stats.ram);
            const ramMax   = server.ram_mb;
            const ramPct   = Math.round((ramMB / ramMax) * 100);
            const cpuBar   = progressBar(stats.cpu, 100);
            const ramBar   = progressBar(ramPct, 100);
            const cpu      = Math.round(stats.cpu * 10) / 10;

            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📊 Stats — ${server.name}`)
                    .setColor(barColor(cpu))
                    .addFields(
                        { name: '🔧 CPU', value: `\`${cpuBar}\` **${cpu}%**`, inline: false },
                        { name: '💾 RAM', value: `\`${ramBar}\` **${ramMB}** / ${ramMax} MB (**${ramPct}%**)`, inline: false },
                        { name: 'Software', value: `${server.software} ${server.version}`, inline: true },
                        { name: 'Port',     value: `${server.port}`, inline: true },
                        { name: 'CPU Cores', value: `${os.cpus().length}`, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'MinePanel — use /stats live:true for real-time data' })]
            });
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
