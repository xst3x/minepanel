// src/routes/statsRoutes.js
// Statistics & Dashboard API
//
// GET  /api/servers/:serverId/stats               — recent history (default 1h)
// GET  /api/servers/:serverId/stats/aggregated    — hourly/daily aggregations
// GET  /api/servers/:serverId/stats/latest        — single latest snapshot
// GET  /api/servers/:serverId/stats/export        — CSV export
// GET  /api/stats/config                          — get retention config (admin)
// PUT  /api/stats/config                          — update retention config (admin)

'use strict';

const express = require('express');
const { dbGet, dbAll, dbRun } = require('../db/database');
const { authenticateToken } = require('../core/auth');
const { checkPermission } = require('../core/permissions');
const logger = require('../core/utils/logger');

const router = express.Router({ mergeParams: true });

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseRange(query) {
    const map = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720 };
    return map[query?.range] ?? 1;
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
        const hours = parseRange(req.query);
        const rows  = await dbAll(
            `SELECT collected_at, ram_bytes, cpu_percent, tps, players, disk_bytes
             FROM server_stats
             WHERE server_id = ?
               AND collected_at >= datetime('now', '-' || ? || ' hours')
             ORDER BY collected_at ASC`,
            [serverId, hours]
        );
        res.json({ serverId, range: req.query.range || '1h', count: rows.length, data: rows });
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
        res.json({ serverId, snapshot: row || null });
    } catch (err) {
        logger.error('[Stats] GET /latest error:', err);
        res.status(500).json({ error: 'Internal error' });
    }
});

// ── GET /api/servers/:serverId/stats/aggregated ──────────────────────────────
router.get('/aggregated', authenticateToken, checkPermission('server.stats.read'), async (req, res) => {
    try {
        const { serverId } = req.params;
        const hours = parseRange(req.query);
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
               AND collected_at >= datetime('now', '-' || ? || ' hours')
             GROUP BY bucket
             ORDER BY bucket ASC`,
            [serverId, hours]
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
        const hours = parseRange(req.query);
        const rows  = await dbAll(
            `SELECT collected_at, ram_bytes, cpu_percent, tps, players, disk_bytes
             FROM server_stats
             WHERE server_id = ?
               AND collected_at >= datetime('now', '-' || ? || ' hours')
             ORDER BY collected_at ASC`,
            [serverId, hours]
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

module.exports = { statsRouter: router, statsConfigRouter: configRouter };
