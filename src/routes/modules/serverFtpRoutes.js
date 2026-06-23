const express = require('express');
const { dbRun, dbGet } = require('../../db/database');
const { authenticateToken } = require('../../core/auth');
const { checkPermission } = require('../../core/permissions');
const { E, sendError } = require('../../core/errors');
const { validate } = require('../../middleware/validation');
const V = require('../../middleware/validators');
const bcrypt = require('bcryptjs');
const logger = require('../../core/utils/logger');
const { startServerFtp, stopServerFtp, isServerFtpRunning, storePasswordCache, getPasswordCache } = require('../../core/ftpServer');

const router = express.Router();

// ─── GET FTP config ────────────────────────────────────────────────────────
router.get('/:serverId/ftp', authenticateToken, checkPermission('server.ftp.access'), async (req, res) => {
    try {
        const sv = await dbGet('SELECT id, ftp_enabled, ftp_port, ftp_username, ftp_password FROM servers WHERE id = ?', [req.params.serverId]);
        if (!sv) return sendError(res, E.SERVER_NOT_FOUND, 404);
        res.json({
            enabled: !!sv.ftp_enabled,
            port: sv.ftp_port || null,
            username: sv.ftp_username || null,
            running: isServerFtpRunning(sv.id),
            hasPassword: !!sv.ftp_password
        });
    } catch (e) {
        logger.error(`[serverRoutes] GET FTP config error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});

// ─── POST FTP config ───────────────────────────────────────────────────────
router.post('/:serverId/ftp/config', authenticateToken, checkPermission('server.ftp.manage'), validate(V.ftpConfig), async (req, res) => {
    try {
        const { username, password, port } = req.body;
        const serverId = req.params.serverId;

        if (!username || !port) return sendError(res, E.BAD_REQUEST, 400, 'username and port are required');
        if (port < 1024 || port > 65535) return sendError(res, E.SERVER_PORT_INVALID, 400);

        const conflict = await dbGet('SELECT id FROM servers WHERE ftp_port = ? AND id != ?', [port, serverId]);
        if (conflict) return sendError(res, E.FTP_PORT_TAKEN, 400);

        let hashedPassword = null;

        if (password && password.trim()) {
            hashedPassword = await bcrypt.hash(password, 10);
        } else {
            const existingServer = await dbGet('SELECT ftp_password FROM servers WHERE id = ?', [serverId]);
            hashedPassword = existingServer?.ftp_password || null;
        }

        if (!hashedPassword) {
            return sendError(res, E.BAD_REQUEST, 400, 'At least one password must be set');
        }

        const updateSql = 'UPDATE servers SET ftp_username = ?, ftp_password = ?, ftp_port = ? WHERE id = ?';
        const updateParams = [username, hashedPassword, port, serverId];

        await dbRun(updateSql, updateParams);

        if (password && password.trim()) {
            storePasswordCache(serverId, password);
        }

        const sv = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (sv && sv.ftp_enabled) {
            try {
                await stopServerFtp(serverId);
                await startServerFtp(serverId);
            } catch (e) {
                logger.warn(`[serverRoutes] Failed to restart SFTP for server ${serverId}:`, e.message);
            }
        }

        res.json({ success: true, message: 'FTP configuration saved' });
    } catch (e) {
        logger.error(`[serverRoutes] POST FTP config error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});

// ─── Toggle FTP enabled/disabled ───────────────────────────────────────────
router.post('/:serverId/ftp/toggle', authenticateToken, checkPermission('server.ftp.manage'), async (req, res) => {
    try {
        const serverId = req.params.serverId;
        const sv = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
        if (!sv) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const currentlyRunning = isServerFtpRunning(serverId);
        const newEnabled = currentlyRunning ? 0 : 1;
        await dbRun('UPDATE servers SET ftp_enabled = ? WHERE id = ?', [newEnabled, serverId]);

        if (newEnabled) {
            if (!sv.ftp_port || !sv.ftp_username || !sv.ftp_password) {
                await dbRun('UPDATE servers SET ftp_enabled = 0 WHERE id = ?', [serverId]);
                return sendError(res, E.FTP_CONFIG_INCOMPLETE, 400, 'Complete FTP configuration first');
            }
            try {
                await startServerFtp(serverId);
            } catch (e) {
                await dbRun('UPDATE servers SET ftp_enabled = 0 WHERE id = ?', [serverId]);
                logger.error(`[serverRoutes] Failed to start SFTP:`, e);
                return sendError(res, E.INTERNAL_ERROR, 500, `Failed to start SFTP: ${e.message}`);
            }
        } else {
            try {
                await stopServerFtp(serverId);
            } catch (e) {
                logger.error(`[serverRoutes] Failed to stop SFTP:`, e);
            }
        }

        res.json({ enabled: !!newEnabled, running: isServerFtpRunning(serverId) });
    } catch (e) {
        logger.error(`[serverRoutes] POST FTP toggle error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});

// ─── GET FTP plaintext password ────────────────────────────────────────────
router.get('/:serverId/ftp/password', authenticateToken, checkPermission('server.ftp.manage'), async (req, res) => {
    try {
        const serverId = req.params.serverId;
        const sv = await dbGet('SELECT id FROM servers WHERE id = ?', [serverId]);
        if (!sv) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const pw = getPasswordCache(serverId);

        res.json({
            password: pw || null,
            message: pw ? null : 'Password not available (enter it again to reveal)'
        });
    } catch (e) {
        logger.error(`[serverRoutes] GET FTP password error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});

module.exports = router;
