// src/core/statsCollector.js
// Background daemon that samples RAM/CPU/TPS/Players/Storage every 30 seconds
// for every server, and prunes rows older than the configured retention period.

const { dbRun, dbAll, dbGet } = require('../db/database');
const processManager = require('./processManager');
const { getDirSize }  = require('./diskUsage');
const { getServerDir } = require('./serverHelper');
const logger = require('./utils/logger');

const COLLECTION_INTERVAL_MS = 30 * 1000;    // 30 seconds
const PRUNE_INTERVAL_MS      = 60 * 60 * 1000; // 1 hour
const DEFAULT_RETENTION_DAYS = 7;

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTpsFromHistory(serverId) {
    try {
        const history = processManager.getHistory(serverId.toString()).join('');
        const match = history.match(/TPS from last 1m,\s*5m,\s*15m:\s*([\d.]+)/i);
        if (match) return parseFloat(match[1]);
    } catch (_) {}
    return null;
}

function parsePlayersFromHistory(serverId) {
    try {
        const history = processManager.getHistory(serverId.toString()).join('');
        const regex = /There are (\d+) of a max(?: of)? \d+ players online/gi;
        let match, last = null;
        while ((match = regex.exec(history)) !== null) last = parseInt(match[1], 10);
        if (last !== null) return last;
    } catch (_) {}
    return null;
}

// ── Collection cycle ──────────────────────────────────────────────────────────

async function collectStats() {
    try {
        const servers = await dbAll('SELECT id, directory_name, name FROM servers');

        for (const server of servers) {
            const sid    = server.id.toString();
            const online = processManager.getStatus(sid) === 'online';

            // Disk usage — always collected (even when offline)
            let diskBytes = 0;
            try {
                const dir = getServerDir(server);
                diskBytes = await getDirSize(dir);
            } catch (_) {}

            if (!online) {
                await dbRun(
                    `INSERT INTO server_stats (server_id, ram_bytes, cpu_percent, tps, players, disk_bytes)
                     VALUES (?, 0, 0, null, 0, ?)`,
                    [server.id, diskBytes]
                ).catch(() => {});
                continue;
            }

            const { cpu, ram } = await processManager.getStats(sid);
            const tps     = parseTpsFromHistory(sid);
            const players = parsePlayersFromHistory(sid) ?? 0;

            await dbRun(
                `INSERT INTO server_stats (server_id, ram_bytes, cpu_percent, tps, players, disk_bytes)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [server.id, ram, cpu, tps, players, diskBytes]
            ).catch(err => {
                logger.warn(`[StatsCollector] Insert failed for server ${server.id}: ${err.message}`);
            });
        }
    } catch (err) {
        logger.error('[StatsCollector] Collection error:', err);
    }
}

// ── Pruning cycle ─────────────────────────────────────────────────────────────

async function pruneOldStats() {
    try {
        const cfg = await dbGet(
            `SELECT value FROM statistics_config WHERE key = 'retention_days'`
        ).catch(() => null);
        const retentionDays = Math.max(1, parseInt(cfg?.value, 10) || DEFAULT_RETENTION_DAYS);
        const result = await dbRun(
            `DELETE FROM server_stats WHERE collected_at < datetime('now', '-' || ? || ' days')`,
            [retentionDays]
        );
        if (result && result.changes > 0) {
            logger.info(`[StatsCollector] Pruned ${result.changes} old stat rows (>${retentionDays}d).`);
        }
    } catch (err) {
        logger.error('[StatsCollector] Pruning error:', err);
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

let collectionTimer = null;
let pruneTimer      = null;

function start() {
    if (collectionTimer) return;
    logger.info('[StatsCollector] Starting — collecting every 30s, pruning every 1h.');
    collectStats();
    collectionTimer = setInterval(collectStats, COLLECTION_INTERVAL_MS);
    pruneOldStats();
    pruneTimer = setInterval(pruneOldStats, PRUNE_INTERVAL_MS);
}

function stop() {
    if (collectionTimer) { clearInterval(collectionTimer); collectionTimer = null; }
    if (pruneTimer)      { clearInterval(pruneTimer);      pruneTimer      = null; }
    logger.info('[StatsCollector] Stopped.');
}

module.exports = { start, stop };
