// src/routes/statsRoutes.js
// Statistics & Dashboard API
//
// GET  /api/servers/:serverId/stats               — history with server-side downsampling
// GET  /api/servers/:serverId/stats/aggregated    — hourly/daily aggregations
// GET  /api/servers/:serverId/stats/latest        — single latest snapshot
// GET  /api/servers/:serverId/stats/export        — CSV export
// GET  /api/stats/config                          — get retention config (admin)
// PUT  /api/stats/config                          — update retention config (admin)

'use strict';

const express = require('express')
import databaseModule = require('../db/database')
const { dbGet, dbAll, dbRun } = databaseModule;
import authModule = require('../core/auth')
const { authenticateToken } = authModule;
import permissionsModule = require('../core/permissions')
const { checkPermission } = permissionsModule;
import logger = require('../core/utils/logger')

const router = express.Router({ mergeParams: true });

const HOST_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// ── Range configuration ───────────────────────────────────────────────────────
// Every range maps to a lookback window (minutes) and a downsample bucket
// (seconds). Bucketing keeps the payload small: at most ~360 points per request
// no matter how far back the user zooms — this is what keeps frontend↔backend
// traffic tiny for the 7-day view.
const RANGE_CONFIG = {
    '5m':  { minutes: 5,     bucketSeconds: 30 },
    '15m': { minutes: 15,    bucketSeconds: 30 },
    '30m': { minutes: 30,    bucketSeconds: 30 },
    '1h':  { minutes: 60,    bucketSeconds: 60 },
    '6h':  { minutes: 360,   bucketSeconds: 120 },
    '12h': { minutes: 720,   bucketSeconds: 300 },
    '24h': { minutes: 1440,  bucketSeconds: 600 },
    '7d':  { minutes: 10080, bucketSeconds: 1800 },
    '30d': { minutes: 43200, bucketSeconds: 7200 },
};

function parseRange(query) {
    const cfg = RANGE_CONFIG[query?.range];
    if (cfg) return cfg;
    // Backward compat: numeric hour ranges (e.g. "1", "6", "24")
    const hours = parseFloat(query?.range);
    if (!isNaN(hours) && hours > 0) {
        const bucketSeconds = Math.max(30, Math.round((hours * 3600) / 360));
        return { minutes: hours * 60, bucketSeconds };
    }
    return RANGE_CONFIG['1h'];
}

function round1(v) {
    return v === null || v === undefined ? null : Math.round(v * 10) / 10;
}

function toCSV(rows) {
    if (!rows.length) return 'collected_at,ram_bytes,cpu_percent,tps,players,disk_bytes\n';
    const header = 'collected_at,ram_bytes,cpu_percent,tps,players,disk_bytes';
    const lines  = rows.map(r =>
        `${r.collected_at},${r.ram_bytes},${r.cpu_percent},${r.tps ?? ''},${r.players},${r.disk_bytes ?? 0}`
    );
    return [header, ...lines].join('\n');
}

// ── GET /api/servers/:serverId/stats ─────────────────────────────────────────
router.get('/', authenticateToken, checkPermission('server.stats.read'), async (req, res) => {
    try {
        const { serverId } = req.params;
        const { minutes, bucketSeconds } = parseRange(req.query);

        const rows = await dbAll(
            `SELECT
                (strftime('%s', collected_at) / ?) * ?        AS bucket_epoch,
                datetime((strftime('%s', collected_at) / ?) * ?, 'unixepoch') AS collected_at,
                AVG(ram_bytes)   AS ram_bytes,
                AVG(cpu_percent) AS cpu_percent,
                AVG(tps)         AS tps,
                AVG(players)     AS players,
                MAX(players)     AS max_players,
                AVG(disk_bytes)  AS disk_bytes
             FROM server_stats
             WHERE server_id = ?
               AND collected_at >= datetime('now', '-' || ? || ' minutes')
             GROUP BY bucket_epoch
             ORDER BY bucket_epoch ASC`,
            [bucketSeconds, bucketSeconds, bucketSeconds, bucketSeconds, serverId, minutes]
        );

        const data = rows.map(r => ({
            t: r.bucket_epoch * 1000,
            collected_at: r.collected_at,
            ram_bytes: Math.round(r.ram_bytes || 0),
            cpu_percent: round1(r.cpu_percent),
            tps: r.tps === null || r.tps === undefined ? null : round1(r.tps),
            players: Math.round(r.players || 0),
            max_players: Math.round(r.max_players || 0),
            disk_bytes: Math.round(r.disk_bytes || 0)
        }));

        res.json({
            serverId,
            range: req.query.range || '1h',
            bucketSeconds,
            timezone: HOST_TIMEZONE,
            count: data.length,
            data
        });
    } catch (err) {
        logger.error('[Stats] GET / error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ── GET /api/servers/:serverId/stats/latest ──────────────────────────────────
router.get('/latest', authenticateToken, checkPermission('server.stats.read'), async (req, res) => {
    try {
        const { serverId } = req.params;
        const row = await dbGet(
            `SELECT collected_at, ram_bytes, cpu_percent, tps, players, disk_bytes
             FROM server_stats WHERE server_id = ?
             ORDER BY collected_at DESC LIMIT 1`,
            [serverId]
        );
        res.json({ serverId, timezone: HOST_TIMEZONE, snapshot: row || null });
    } catch (err) {
        logger.error('[Stats] GET /latest error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ── GET /api/servers/:serverId/stats/aggregated ──────────────────────────────
router.get('/aggregated', authenticateToken, checkPermission('server.stats.read'), async (req, res) => {
    try {
        const { serverId } = req.params;
        const { minutes } = parseRange(req.query);
        const hours = minutes / 60;
        const bucketFmt = hours <= 24
            ? `strftime('%Y-%m-%dT%H:00', collected_at)`
            : `strftime('%Y-%m-%d', collected_at)`;

        const rows = await dbAll(
            `SELECT
                ${bucketFmt}            AS bucket,
                AVG(ram_bytes)          AS avg_ram,
                MAX(ram_bytes)          AS max_ram,
                AVG(cpu_percent)        AS avg_cpu,
                MAX(cpu_percent)        AS max_cpu,
                AVG(tps)                AS avg_tps,
                MIN(tps)                AS min_tps,
                MAX(players)            AS max_players,
                AVG(players)            AS avg_players,
                MAX(disk_bytes)         AS disk_bytes
             FROM server_stats
             WHERE server_id = ?
               AND collected_at >= datetime('now', '-' || ? || ' minutes')
             GROUP BY bucket
             ORDER BY bucket ASC`,
            [serverId, minutes]
        );

        res.json({
            serverId,
            range: req.query.range || '1h',
            granularity: hours <= 24 ? 'hourly' : 'daily',
            count: rows.length,
            data: rows
        });
    } catch (err) {
        logger.error('[Stats] GET /aggregated error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ── GET /api/servers/:serverId/stats/export ──────────────────────────────────
router.get('/export', authenticateToken, checkPermission('server.stats.read'), async (req, res) => {
    try {
        const { serverId } = req.params;
        const { minutes } = parseRange(req.query);
        const rows  = await dbAll(
            `SELECT collected_at, ram_bytes, cpu_percent, tps, players, disk_bytes
             FROM server_stats
             WHERE server_id = ?
               AND collected_at >= datetime('now', '-' || ? || ' minutes')
             ORDER BY collected_at ASC`,
            [serverId, minutes]
        );
        const csv      = toCSV(rows);
        const filename = `server-${serverId}-stats-${req.query.range || '1h'}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csv);
    } catch (err) {
        logger.error('[Stats] GET /export error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ── Config router (mounted at /api/stats/config) ──────────────────────────────
const configRouter = express.Router();

configRouter.get('/', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
        const rows = await dbAll(`SELECT key, value FROM statistics_config ORDER BY key`);
        const config = {};
        rows.forEach(r => { config[r.key] = r.value; });
        res.json(config);
    } catch (err) {
        logger.error('[Stats] GET /config error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

configRouter.put('/', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

        const { retention_days, collection_interval_seconds } = req.body;

        if (retention_days !== undefined) {
            const days = parseInt(retention_days, 10);
            if (isNaN(days) || days < 1 || days > 365)
                return res.status(400).json({ error: 'retention_days must be 1–365' });
            await dbRun(
                `INSERT INTO statistics_config (key, value, updated_at) VALUES ('retention_days', ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
                [days.toString()]
            );
        }

        if (collection_interval_seconds !== undefined) {
            const secs = parseInt(collection_interval_seconds, 10);
            if (isNaN(secs) || secs < 10 || secs > 3600)
                return res.status(400).json({ error: 'collection_interval_seconds must be 10–3600' });
            await dbRun(
                `INSERT INTO statistics_config (key, value, updated_at) VALUES ('collection_interval_seconds', ?, CURRENT_TIMESTAMP)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
                [secs.toString()]
            );
        }

        res.json({ ok: true, message: 'Config updated.' });
    } catch (err) {
        logger.error('[Stats] PUT /config error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

export = { statsRouter: router, statsConfigRouter: configRouter };
