// src/routes/automationRoutes.js
// CRUD for per-server Python automation scripts.
//
// GET    /api/servers/:serverId/automation               — list rules + server toggle state
// POST   /api/servers/:serverId/automation               — create python automation
// PUT    /api/servers/:serverId/automation/:ruleId       — update script content/name/enabled
// DELETE /api/servers/:serverId/automation/:ruleId       — delete rule
// PATCH  /api/servers/:serverId/automation/:ruleId/toggle — toggle single rule enabled state
// PATCH  /api/servers/:serverId/automation/server-toggle  — toggle server-wide automation_enabled state
// POST   /api/servers/:serverId/automation/verify        — verify code syntax and safety

'use strict';

const express  = require('express');
const { v4: uuidv4 } = require('uuid');
const { dbRun, dbGet, dbAll } = require('../db/database');
const { authenticateToken }   = require('../core/auth');
const { checkPermission }     = require('../core/permissions');
const { E, sendError }        = require('../core/errors');
const logger                  = require('../core/utils/logger');
const workerManager           = require('../core/automation/workerManager');
const processManager          = require('../core/processManager');
const automationEngine        = require('../core/automationEngine');

const router = express.Router({ mergeParams: true });

const MAX_RULES_PER_SERVER = 50;

const DEFAULT_SCRIPT_TEMPLATE = `"""
MinePanel Automation Script

Sandboxed environment.
No system access allowed.
"""

import minepanel


def run(context):
    pass
`;

function parseRule(row) {
    return {
        id:               row.id,
        serverId:         row.server_id,
        name:             row.name,
        enabled:          !!row.enabled,
        script:           row.script ?? '',
        createdAt:        row.created_at,
    };
}

// ── GET /  (list rules + server toggle state) ─────────────────────────────────
router.get('/', authenticateToken, checkPermission('server.automation.read'), async (req, res) => {
    try {
        const { serverId } = req.params;
        
        const server = await dbGet('SELECT automation_enabled FROM servers WHERE id = ?', [serverId]);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404, 'Server not found');

        const rows = await dbAll('SELECT * FROM automation_rules WHERE server_id = ? ORDER BY created_at ASC', [serverId]);
        
        res.json({
            rules: rows.map(parseRule),
            automationEnabled: !!server.automation_enabled
        });
    } catch (err) {
        logger.error('[AutomationRoutes] list error:', err);
        sendError(res, E.INTERNAL_ERROR);
    }
});

// ── POST / (create python script rule) ────────────────────────────────────────
router.post('/', authenticateToken, checkPermission('server.automation.write'), async (req, res) => {
    try {
        const { serverId } = req.params;
        const { name, script = DEFAULT_SCRIPT_TEMPLATE, enabled = true } = req.body;

        if (!name || typeof name !== 'string') {
            return sendError(res, E.VALIDATION_ERROR, 400, 'name is required');
        }

        // Enforce per-server limit
        const count = await dbGet('SELECT COUNT(*) as c FROM automation_rules WHERE server_id = ?', [serverId]);
        if (count.c >= MAX_RULES_PER_SERVER) {
            return sendError(res, E.VALIDATION_ERROR, 400, `Max ${MAX_RULES_PER_SERVER} rules per server`);
        }

        const id = uuidv4();
        await dbRun(
            `INSERT INTO automation_rules (id, server_id, name, enabled, script)
             VALUES (?, ?, ?, ?, ?)`,
            [
                id,
                serverId,
                name.trim(),
                enabled ? 1 : 0,
                script
            ]
        );

        const row = await dbGet('SELECT * FROM automation_rules WHERE id = ?', [id]);
        automationEngine.invalidateCache(serverId);
        logger.info(`[Automation] Rule "${name}" created (server ${serverId}) by user ${req.user.id}`);
        res.status(201).json({ rule: parseRule(row) });
    } catch (err) {
        logger.error('[AutomationRoutes] create error:', err);
        sendError(res, E.INTERNAL_ERROR);
    }
});

// ── GET /:ruleId (single rule) ────────────────────────────────────────────────
router.get('/:ruleId', authenticateToken, checkPermission('server.automation.read'), async (req, res) => {
    try {
        const { serverId, ruleId } = req.params;
        const row = await dbGet('SELECT * FROM automation_rules WHERE id = ? AND server_id = ?', [ruleId, serverId]);
        if (!row) return sendError(res, E.SERVER_NOT_FOUND, 404, 'Rule not found');
        res.json({ rule: parseRule(row) });
    } catch (err) {
        logger.error('[AutomationRoutes] get error:', err);
        sendError(res, E.INTERNAL_ERROR);
    }
});

// ── PUT /:ruleId (update script content/name/enabled) ──────────────────────────
router.put('/:ruleId', authenticateToken, checkPermission('server.automation.write'), async (req, res) => {
    try {
        const { serverId, ruleId } = req.params;
        const row = await dbGet('SELECT * FROM automation_rules WHERE id = ? AND server_id = ?', [ruleId, serverId]);
        if (!row) return sendError(res, E.SERVER_NOT_FOUND, 404, 'Rule not found');

        const { name, script, enabled } = req.body;

        const newName    = name    !== undefined ? name.trim()       : row.name;
        const newScript  = script  !== undefined ? script            : row.script;
        const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : row.enabled;

        await dbRun(
            `UPDATE automation_rules SET name = ?, script = ?, enabled = ? WHERE id = ?`,
            [newName, newScript, newEnabled, ruleId]
        );

        const updated = await dbGet('SELECT * FROM automation_rules WHERE id = ?', [ruleId]);
        automationEngine.invalidateCache(serverId);
        res.json({ rule: parseRule(updated) });
    } catch (err) {
        logger.error('[AutomationRoutes] update error:', err);
        sendError(res, E.INTERNAL_ERROR);
    }
});

// ── DELETE /:ruleId ───────────────────────────────────────────────────────────
router.delete('/:ruleId', authenticateToken, checkPermission('server.automation.write'), async (req, res) => {
    try {
        const { serverId, ruleId } = req.params;
        const row = await dbGet('SELECT id FROM automation_rules WHERE id = ? AND server_id = ?', [ruleId, serverId]);
        if (!row) return sendError(res, E.SERVER_NOT_FOUND, 404, 'Rule not found');
        
        await dbRun('DELETE FROM automation_rules WHERE id = ?', [ruleId]);
        automationEngine.invalidateCache(serverId);
        res.json({ ok: true });
    } catch (err) {
        logger.error('[AutomationRoutes] delete error:', err);
        sendError(res, E.INTERNAL_ERROR);
    }
});

// ── PATCH /:ruleId/toggle (single rule state toggle) ──────────────────────────
router.patch('/:ruleId/toggle', authenticateToken, checkPermission('server.automation.write'), async (req, res) => {
    try {
        const { serverId, ruleId } = req.params;
        const row = await dbGet('SELECT * FROM automation_rules WHERE id = ? AND server_id = ?', [ruleId, serverId]);
        if (!row) return sendError(res, E.SERVER_NOT_FOUND, 404, 'Rule not found');
        
        const newEnabled = row.enabled ? 0 : 1;
        await dbRun('UPDATE automation_rules SET enabled = ? WHERE id = ?', [newEnabled, ruleId]);
        automationEngine.invalidateCache(serverId);
        res.json({ enabled: !!newEnabled });
    } catch (err) {
        logger.error('[AutomationRoutes] toggle error:', err);
        sendError(res, E.INTERNAL_ERROR);
    }
});

// ── PATCH /server-toggle (server-wide state toggle) ───────────────────────────
router.patch('/server-toggle', authenticateToken, checkPermission('server.automation.write'), async (req, res) => {
    try {
        const { serverId } = req.params;
        const server = await dbGet('SELECT automation_enabled FROM servers WHERE id = ?', [serverId]);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404, 'Server not found');

        const newEnabled = server.automation_enabled ? 0 : 1;
        await dbRun('UPDATE servers SET automation_enabled = ? WHERE id = ?', [newEnabled, serverId]);
        automationEngine.invalidateCache(serverId);
        res.json({ automationEnabled: !!newEnabled });
    } catch (err) {
        logger.error('[AutomationRoutes] server toggle error:', err);
        sendError(res, E.INTERNAL_ERROR);
    }
});

// ── POST /verify (run validation on submitted Python code) ───────────────────
router.post('/verify', authenticateToken, checkPermission('server.automation.read'), async (req, res) => {
    try {
        const { code } = req.body;
        if (typeof code !== 'string') {
            return res.json({ valid: false, errors: ['Script code must be a string'] });
        }
        
        const result = await workerManager.verifyCode(code);
        res.json(result);
    } catch (err) {
        logger.error('[AutomationRoutes] verify error:', err);
        res.json({ valid: false, errors: [`Verification exception: ${err.message}`] });
    }
});

// ── POST /run-test (test run unsaved script code) ─────────────────────────────
router.post('/run-test', authenticateToken, checkPermission('server.automation.write'), async (req, res) => {
    try {
        const { serverId } = req.params;
        const { code, name = 'TestScript' } = req.body;
        
        if (typeof code !== 'string') {
            return sendError(res, E.VALIDATION_ERROR, 400, 'Code must be a string');
        }

        const stats = await processManager.getStats(serverId);
        const context = {
            server_id: serverId,
            event: 'manual_trigger',
            data: {},
            metrics: {
                cpu_usage: stats ? Math.round(stats.cpu) : 0,
                global_ram_usage: Math.round(process.memoryUsage().rss / 1024 / 1024),
                server_ram_usage: stats ? Math.round(stats.ram / 1024 / 1024) : 0
            }
        };

        // Execute script in sandbox
        workerManager.executeScript(serverId, name, code, context);
        
        res.json({ ok: true });
    } catch (err) {
        logger.error('[AutomationRoutes] run-test error:', err);
        sendError(res, E.INTERNAL_ERROR);
    }
});

module.exports = router;
