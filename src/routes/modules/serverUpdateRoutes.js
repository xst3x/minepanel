const express = require('express');
const { dbRun, dbGet } = require('../../db/database');
const { authenticateToken } = require('../../core/auth');
const { checkPermission } = require('../../core/permissions');
const { E, sendError } = require('../../core/errors');
const { validate } = require('../../middleware/validation');
const V = require('../../middleware/validators');
const { getServer } = require('../../core/serverHelper');
const UpdateManager = require('../../core/update/UpdateManager');
const logger = require('../../core/utils/logger');

const router = express.Router();

// ─── GET update settings ───────────────────────────────────────────────────
router.get('/:serverId/update/settings', authenticateToken, checkPermission('server.properties.read'), async (req, res) => {
    const { serverId } = req.params;
    try {
        let row;
        try {
            row = await dbGet(
                `SELECT auto_update_software, auto_update_content, force_incompatible_updates,
                        auto_backup_before_update, ignored_plugins, update_interval_hours,
                        last_update_check, last_update_run
                 FROM servers WHERE id = ?`,
                [serverId]
            );
        } catch (dbErr) {
            logger.error(`[serverRoutes] GET update/settings DB error (Server: ${serverId}): ${dbErr.message}`);
            if (dbErr.message && dbErr.message.includes('no column named')) {
                return res.status(500).json({
                    success: false,
                    error: 'Database schema is out of date. Restart the server to apply the latest migrations.',
                });
            }
            return res.status(500).json({ success: false, error: `Database error: ${dbErr.message}` });
        }

        if (!row) return sendError(res, E.SERVER_NOT_FOUND, 404);

        let ignoredPlugins = [];
        try {
            const raw = row.ignored_plugins;
            ignoredPlugins = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
        } catch (_) {}

        res.json({
            ...row,
            ignored_plugins:            ignoredPlugins,
            auto_update_software:       !!row.auto_update_software,
            auto_update_content:        !!row.auto_update_content,
            force_incompatible_updates: !!row.force_incompatible_updates,
            auto_backup_before_update:  !!row.auto_backup_before_update,
            _updateState: UpdateManager.getState(serverId),
        });
    } catch (e) {
        logger.error(`[serverRoutes] GET update/settings error (Server: ${serverId}): ${e.message}`);
        return res.status(500).json({ success: false, error: e.message || 'Failed to load update settings' });
    }
});

// ─── PATCH update settings ─────────────────────────────────────────────────
router.patch('/:serverId/update/settings', authenticateToken, checkPermission('server.properties.write'), validate(V.updateSettings), async (req, res) => {
    const { serverId } = req.params;
    logger.info(`[serverRoutes] PATCH update/settings (Server: ${serverId}) body: ${JSON.stringify(req.body)}`);
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const fields = [];
        const values = [];

        const boolMap = {
            auto_update_software:       req.body.auto_update_software,
            auto_update_content:        req.body.auto_update_content,
            force_incompatible_updates: req.body.force_incompatible_updates,
            auto_backup_before_update:  req.body.auto_backup_before_update,
        };
        for (const [col, val] of Object.entries(boolMap)) {
            if (val !== undefined) {
                fields.push(`${col} = ?`);
                values.push(val ? 1 : 0);
            }
        }

        if (req.body.update_interval_hours !== undefined) {
            fields.push('update_interval_hours = ?');
            values.push(req.body.update_interval_hours);
        }

        if (req.body.ignored_plugins !== undefined) {
            const raw = Array.isArray(req.body.ignored_plugins) ? req.body.ignored_plugins : [];
            const normalized = [...new Set(
                raw.map(p => String(p).trim().toLowerCase()).filter(Boolean)
            )];
            fields.push('ignored_plugins = ?');
            values.push(JSON.stringify(normalized));
        }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, error: 'No valid fields provided' });
        }

        values.push(serverId);

        try {
            await dbRun(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`, values);
        } catch (dbErr) {
            logger.error(`[serverRoutes] PATCH update/settings DB error (Server: ${serverId}): ${dbErr.message}`);
            if (dbErr.message && dbErr.message.includes('no column named')) {
                return res.status(500).json({
                    success: false,
                    error: 'Database schema is out of date. Restart the server to apply the latest migrations.',
                });
            }
            return res.status(500).json({ success: false, error: `Database error: ${dbErr.message}` });
        }

        res.json({ success: true, message: 'Update settings saved' });
    } catch (e) {
        logger.error(`[serverRoutes] PATCH update/settings error (Server: ${serverId}, body: ${JSON.stringify(req.body)}):`, e.message);
        return res.status(500).json({ success: false, error: e.message || 'Failed to save update settings' });
    }
});

// ─── POST check for update ─────────────────────────────────────────────────
router.post('/:serverId/update/check', authenticateToken, checkPermission('server.properties.read'), async (req, res) => {
    const { serverId } = req.params;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const result = await UpdateManager.checkForUpdate(serverId);
        res.json(result);
    } catch (e) {
        logger.error(`[serverRoutes] POST update/check error (Server: ${serverId}):`, e);
        return sendError(res, E.BAD_REQUEST, 400, e.message || null);
    }
});

// ─── POST run update ───────────────────────────────────────────────────────
router.post('/:serverId/update/run', authenticateToken, checkPermission('server.properties.write'), validate(V.updateRun), async (req, res) => {
    const { serverId } = req.params;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const { targetVersion = 'latest', skipBackup = false } = req.body;

        const result = await UpdateManager.runUpdate(serverId, { targetVersion, skipBackup });
        res.json(result);
    } catch (e) {
        logger.error(`[serverRoutes] POST update/run error (Server: ${serverId}):`, e);
        return sendError(res, E.BAD_REQUEST, 400, e.message || null);
    }
});

// ─── POST rollback update ──────────────────────────────────────────────────
router.post('/:serverId/update/rollback', authenticateToken, checkPermission('server.properties.write'), async (req, res) => {
    const { serverId } = req.params;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const result = await UpdateManager.rollback(serverId);
        res.json(result);
    } catch (e) {
        logger.error(`[serverRoutes] POST update/rollback error (Server: ${serverId}):`, e);
        return sendError(res, E.BAD_REQUEST, 400, e.message || null);
    }
});

module.exports = router;
