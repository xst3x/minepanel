// src/routes/thresholdRoutes.js
// REST API for the Threshold Management System.
// Mounted at /api/servers/:serverId/thresholds

'use strict';

const express = require('express');
const router  = express.Router({ mergeParams: true });

const { authenticateToken }   = require('../core/auth');
const { checkPermission }     = require('../core/permissions');
const { E, sendError }        = require('../core/errors');
const { validate }            = require('../middleware/validation');
const V                       = require('../middleware/validators');
const { dbGet, dbRun }        = require('../db/database');
const logger                  = require('../core/utils/logger');
const {
    parseRules,
    validateThresholds,
    defaultRules,
    METRIC_CONFIG,
    ACTION_SEVERITY,
} = require('../core/thresholdManager');

// ── Helper: generate a short unique ID ───────────────────────────────────────
function genId() {
    return 'thr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

// ── GET /api/servers/:serverId/thresholds ─────────────────────────────────────
// Returns the full rules object for a server.
router.get('/', authenticateToken, checkPermission('server.properties.read'), async (req, res) => {
    const { serverId } = req.params;
    try {
        const row = await dbGet('SELECT threshold_rules FROM servers WHERE id = ?', [serverId]);
        if (!row) return sendError(res, E.SERVER_NOT_FOUND, 404);
        res.json(parseRules(row.threshold_rules));
    } catch (e) {
        logger.error(`[thresholdRoutes] GET error (Server: ${serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── PUT /api/servers/:serverId/thresholds ─────────────────────────────────────
// Replaces the entire rules object (bulk save from the UI).
// Body: { cpu_temperature: { enabled, thresholds: [...] }, ram_percent: { ... } }
router.put('/', authenticateToken, checkPermission('server.properties.write'), async (req, res) => {
    const { serverId } = req.params;
    try {
        const row = await dbGet('SELECT id FROM servers WHERE id = ?', [serverId]);
        if (!row) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const incoming = req.body;
        const allErrors = [];

        // Validate each metric block present in the payload
        for (const [metric, cfg] of Object.entries(incoming)) {
            if (!(metric in METRIC_CONFIG)) {
                allErrors.push(`Unknown metric "${metric}".`);
                continue;
            }
            const thresholds = cfg.thresholds || [];
            const { errors } = validateThresholds(metric, thresholds);
            errors.forEach(e => allErrors.push(`[${metric}] ${e}`));
        }

        if (allErrors.length > 0) {
            return sendError(res, E.THRESHOLD_VALIDATION_FAILED, 400, allErrors);
        }

        // Merge with existing, assign IDs where missing
        const existing = parseRules(
            (await dbGet('SELECT threshold_rules FROM servers WHERE id = ?', [serverId]))?.threshold_rules
        );

        const merged = { ...existing };
        for (const [metric, cfg] of Object.entries(incoming)) {
            merged[metric] = {
                enabled: !!cfg.enabled,
                thresholds: (cfg.thresholds || []).map(t => ({
                    id:      t.id || genId(),
                    value:   Number(t.value),
                    action:  t.action,
                    label:   (t.label || t.action).trim().slice(0, 50),
                    enabled: t.enabled !== false,
                })).sort((a, b) => a.value - b.value),
            };
        }

        await dbRun(
            'UPDATE servers SET threshold_rules = ? WHERE id = ?',
            [JSON.stringify(merged), serverId]
        );

        logger.info(`[thresholdRoutes] Rules saved for server ${serverId}`);
        res.json({ message: 'Threshold rules saved successfully', rules: merged });
    } catch (e) {
        logger.error(`[thresholdRoutes] PUT error (Server: ${serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});

// ── PATCH /api/servers/:serverId/thresholds/:metric/toggle ───────────────────
// Toggle a whole metric on/off without changing individual thresholds.
router.patch('/:metric/toggle', authenticateToken, checkPermission('server.properties.write'), validate(V.thresholdToggle), async (req, res) => {
    const { serverId, metric } = req.params;
    try {
        if (!(metric in METRIC_CONFIG)) return sendError(res, E.BAD_REQUEST, 400, `Unknown metric "${metric}"`);

        const row = await dbGet('SELECT threshold_rules FROM servers WHERE id = ?', [serverId]);
        if (!row) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const rules = parseRules(row.threshold_rules);
        const enabled = req.body.enabled !== undefined ? !!req.body.enabled : !rules[metric].enabled;
        rules[metric].enabled = enabled;

        await dbRun('UPDATE servers SET threshold_rules = ? WHERE id = ?', [JSON.stringify(rules), serverId]);
        res.json({ metric, enabled, rules });
    } catch (e) {
        logger.error(`[thresholdRoutes] PATCH toggle error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── POST /api/servers/:serverId/thresholds/:metric ────────────────────────────
// Add a single threshold to a metric.
router.post('/:metric', authenticateToken, checkPermission('server.properties.write'), validate(V.thresholdAdd), async (req, res) => {
    const { serverId, metric } = req.params;
    try {
        if (!(metric in METRIC_CONFIG)) return sendError(res, E.BAD_REQUEST, 400, `Unknown metric "${metric}"`);

        const row = await dbGet('SELECT threshold_rules FROM servers WHERE id = ?', [serverId]);
        if (!row) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const { value, action, label, enabled } = req.body;

        const rules = parseRules(row.threshold_rules);
        const newThreshold = {
            id:      genId(),
            value:   Number(value),
            action,
            label:   (label || action).trim().slice(0, 50),
            enabled: enabled !== false,
        };

        const thresholds = [...rules[metric].thresholds, newThreshold];
        const { valid, errors } = validateThresholds(metric, thresholds);
        if (!valid) return sendError(res, E.THRESHOLD_VALIDATION_FAILED, 400, errors);

        rules[metric].thresholds = thresholds.sort((a, b) => a.value - b.value);
        await dbRun('UPDATE servers SET threshold_rules = ? WHERE id = ?', [JSON.stringify(rules), serverId]);
        res.status(201).json({ message: 'Threshold added', threshold: newThreshold, rules });
    } catch (e) {
        logger.error(`[thresholdRoutes] POST threshold error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── PATCH /api/servers/:serverId/thresholds/:metric/:thrId ───────────────────
// Update a single threshold.
router.patch('/:metric/:thrId', authenticateToken, checkPermission('server.properties.write'), validate(V.thresholdPatch), async (req, res) => {
    const { serverId, metric, thrId } = req.params;
    try {
        if (!(metric in METRIC_CONFIG)) return sendError(res, E.BAD_REQUEST, 400, `Unknown metric "${metric}"`);

        const row = await dbGet('SELECT threshold_rules FROM servers WHERE id = ?', [serverId]);
        if (!row) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const rules = parseRules(row.threshold_rules);
        const idx   = rules[metric].thresholds.findIndex(t => t.id === thrId);
        if (idx === -1) return sendError(res, E.NOT_FOUND, 404, `Threshold "${thrId}" not found.`);

        const existing = rules[metric].thresholds[idx];
        const updated  = {
            ...existing,
            value:   req.body.value   !== undefined ? Number(req.body.value)                : existing.value,
            action:  req.body.action  !== undefined ? req.body.action                       : existing.action,
            label:   req.body.label   !== undefined ? req.body.label.trim().slice(0, 50)    : existing.label,
            enabled: req.body.enabled !== undefined ? !!req.body.enabled                    : existing.enabled,
        };

        const newList = rules[metric].thresholds.map((t, i) => i === idx ? updated : t);
        const { valid, errors } = validateThresholds(metric, newList);
        if (!valid) return sendError(res, E.THRESHOLD_VALIDATION_FAILED, 400, errors);

        rules[metric].thresholds = newList.sort((a, b) => a.value - b.value);
        await dbRun('UPDATE servers SET threshold_rules = ? WHERE id = ?', [JSON.stringify(rules), serverId]);
        res.json({ message: 'Threshold updated', threshold: updated, rules });
    } catch (e) {
        logger.error(`[thresholdRoutes] PATCH threshold error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── DELETE /api/servers/:serverId/thresholds/:metric/:thrId ──────────────────
// Delete a single threshold.
router.delete('/:metric/:thrId', authenticateToken, checkPermission('server.properties.write'), async (req, res) => {
    const { serverId, metric, thrId } = req.params;
    try {
        if (!(metric in METRIC_CONFIG)) return sendError(res, E.BAD_REQUEST, 400, `Unknown metric "${metric}"`);

        const row = await dbGet('SELECT threshold_rules FROM servers WHERE id = ?', [serverId]);
        if (!row) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const rules = parseRules(row.threshold_rules);
        const before = rules[metric].thresholds.length;
        rules[metric].thresholds = rules[metric].thresholds.filter(t => t.id !== thrId);

        if (rules[metric].thresholds.length === before) {
            return sendError(res, E.NOT_FOUND, 404, `Threshold "${thrId}" not found.`);
        }

        await dbRun('UPDATE servers SET threshold_rules = ? WHERE id = ?', [JSON.stringify(rules), serverId]);
        res.json({ message: 'Threshold deleted', rules });
    } catch (e) {
        logger.error(`[thresholdRoutes] DELETE threshold error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── GET /api/servers/:serverId/thresholds/meta ────────────────────────────────
// Returns valid metrics, actions, and their configs — for UI dropdowns.
router.get('/meta', authenticateToken, async (_req, res) => {
    res.json({
        metrics: Object.entries(METRIC_CONFIG).map(([key, cfg]) => ({
            key,
            label: key === 'cpu_temperature' ? 'CPU Temperature' : 'RAM Usage',
            ...cfg,
        })),
        actions: Object.keys(ACTION_SEVERITY).map(key => ({
            key,
            label:    key.charAt(0).toUpperCase() + key.slice(1),
            severity: ACTION_SEVERITY[key],
        })),
    });
});

module.exports = router;
