const express = require('express');
const { dbRun, dbGet } = require('../../db/database');
const { authenticateToken } = require('../../core/auth');
const { checkPermission } = require('../../core/permissions');
const { E, sendError } = require('../../core/errors');
const { getServer, getServerDir } = require('../../core/serverHelper');
const processManager = require('../../core/processManager');
const javaManager = require('../../core/javaManager');
const path = require('path');
const fs = require('fs');
const logger = require('../../core/utils/logger');
const { getStartInfo } = require('./serverHelpers');

const router = express.Router();

// ─── Start server ──────────────────────────────────────────────────────────
router.post('/:serverId/start', authenticateToken, checkPermission('server.start'), async (req, res) => {
    const serverId = req.params.serverId;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const startInfo = getStartInfo(server);
        const { serverDir, jarFile, customArgs } = startInfo;
        const isBedrock = !!startInfo.isBedrock;
        const isPocketMine = !!startInfo.isPocketMine;

        if (!isBedrock && !isPocketMine && !fs.existsSync(jarFile) && !customArgs) {
            return sendError(res, E.BAD_REQUEST, 400, 'Server jar not found. May still be downloading.');
        }
        if (isBedrock && !fs.existsSync(startInfo.executable)) {
            return sendError(res, E.BAD_REQUEST, 400, 'Bedrock server binary not found. May still be installing.');
        }
        if (isPocketMine && !fs.existsSync(startInfo.jarFile)) {
            return sendError(res, E.BAD_REQUEST, 400, 'PocketMine-MP.phar not found. May still be downloading.');
        }

        if (!processManager.acquireLock(serverId)) {
            return sendError(res, E.SERVER_LOCKED, 409);
        }

        try {
            processManager.clearHistory(serverId.toString());

            if (isBedrock) {
                processManager.start(
                    serverId.toString(), serverDir,
                    [], startInfo.executable, server.ram_mb,
                    [], startInfo.executable, startInfo.env, 'bedrock'
                );
            } else if (isPocketMine) {
                processManager.start(
                    serverId.toString(), serverDir,
                    [], startInfo.jarFile, server.ram_mb,
                    startInfo.customArgs, startInfo.executable, startInfo.env, 'pocketmine'
                );
            } else {
                const javaPath = await javaManager.getJavaPath(server.java_path);
                processManager.start(serverId.toString(), serverDir, [], jarFile, server.ram_mb, customArgs, javaPath);
            }
            res.json({ message: 'Server starting' });
        } finally {
            processManager.releaseLock(serverId);
        }
    } catch (e) {
        logger.error(`[serverRoutes] Start error (Server: ${serverId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});

// ─── Stop server (graceful) ────────────────────────────────────────────────
router.post('/:serverId/stop', authenticateToken, checkPermission('server.stop'), async (req, res) => {
    const serverId = req.params.serverId;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        if (!processManager.acquireLock(serverId.toString())) {
            return sendError(res, E.SERVER_LOCKED, 409);
        }

        try {
            const result = await processManager.gracefulStop(serverId.toString(), 15000);
            if (!result.wasRunning) return res.json({ message: 'Server was not running', graceful: true });
            if (result.graceful) {
                processManager.clearHistory(serverId.toString());
                return res.json({ message: 'Server stopped gracefully', graceful: true });
            } else {
                return res.json({ message: 'Stop command sent but server has not exited yet. You can use Kill to force terminate.', graceful: false });
            }
        } finally {
            processManager.releaseLock(serverId.toString());
        }
    } catch (e) {
        logger.error(`[serverRoutes] Stop error (Server: ${serverId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Restart server ────────────────────────────────────────────────────────
router.post('/:serverId/restart', authenticateToken, checkPermission('server.restart'), async (req, res) => {
    const serverId = req.params.serverId;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const restartInfo = getStartInfo(server);
        const { serverDir, jarFile, customArgs } = restartInfo;
        const isBedrock = !!restartInfo.isBedrock;
        const isPocketMine = !!restartInfo.isPocketMine;

        if (!isBedrock && !isPocketMine && !fs.existsSync(jarFile) && !customArgs) {
            return sendError(res, E.BAD_REQUEST, 400, 'Server jar not found.');
        }
        if (isBedrock && !fs.existsSync(restartInfo.executable)) {
            return sendError(res, E.BAD_REQUEST, 400, 'Bedrock server binary not found.');
        }
        if (isPocketMine && !fs.existsSync(restartInfo.jarFile)) {
            return sendError(res, E.BAD_REQUEST, 400, 'PocketMine-MP.phar not found.');
        }

        if (!processManager.acquireLock(serverId)) {
            return sendError(res, E.SERVER_LOCKED, 409);
        }

        try {
            processManager.clearHistory(serverId.toString());
            let result;
            if (isBedrock) {
                result = await processManager.restartGraceful(
                    serverId.toString(), serverDir,
                    [], restartInfo.executable, server.ram_mb, 15000,
                    [], restartInfo.executable, restartInfo.env, 'bedrock'
                );
            } else if (isPocketMine) {
                result = await processManager.restartGraceful(
                    serverId.toString(), serverDir,
                    [], restartInfo.jarFile, server.ram_mb, 15000,
                    restartInfo.customArgs, restartInfo.executable, restartInfo.env, 'pocketmine'
                );
            } else {
                const javaPath = await javaManager.getJavaPath(server.java_path);
                result = await processManager.restartGraceful(
                    serverId.toString(), serverDir, [], jarFile, server.ram_mb, 15000, customArgs, javaPath
                );
            }
            if (!result.graceful) {
                return res.json({ message: result.message || 'Server did not stop within timeout. Use Kill to force terminate, then start manually.', graceful: false, started: false });
            }
            res.json({ message: result.started ? 'Server restarted successfully' : `Restart failed: ${result.message}`, graceful: true, started: result.started });
        } finally {
            processManager.releaseLock(serverId);
        }
    } catch (e) {
        logger.error(`[serverRoutes] Restart error (Server: ${serverId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});

// ─── Kill server (force terminate) ─────────────────────────────────────────
router.post('/:serverId/kill', authenticateToken, checkPermission('server.kill'), async (req, res) => {
    const serverId = req.params.serverId;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        processManager.acquireLockForce(serverId.toString());
        try {
            processManager.kill(serverId.toString());
            processManager.clearHistory(serverId.toString());
            res.json({ message: 'Server process force-killed' });
        } finally {
            processManager.releaseLock(serverId.toString());
        }
    } catch (e) {
        logger.error(`[serverRoutes] Kill error (Server: ${serverId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Clear console history ─────────────────────────────────────────────────
router.post('/:serverId/clear-console', authenticateToken, checkPermission('server.console.write'), async (req, res) => {
    const serverId = req.params.serverId;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        processManager.clearHistory(serverId.toString());
        res.json({ message: 'Console history cleared' });
    } catch (e) {
        logger.error(`[serverRoutes] Clear-console error (Server: ${serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ─── Send command to server console ────────────────────────────────────────
router.post('/:serverId/command', authenticateToken, checkPermission('server.console.write'), async (req, res) => {
    try {
        const { serverId } = req.params;
        const { command } = req.body;

        if (!command || typeof command !== 'string') {
            return res.status(400).json({ error: 'Command is required' });
        }

        const pm = require('../../core/processManager');
        pm.sendCommand(serverId, command);
        res.json({ message: 'Command sent' });
    } catch (e) {
        logger.error(`[serverRoutes] Send command error (Server: ${req.params.serverId}):`, e);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
