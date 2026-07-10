"use strict";
// ── Per-Server External API Router ─────────────────────────────────────
// Mounted at /serverapi/:serverId/*
// All routes are protected by API key authentication middleware.
//
// Endpoints:
//   GET    /serverapi/:serverId/info
//   GET    /serverapi/:serverId/performance
//   GET    /serverapi/:serverId/players
//   GET    /serverapi/:serverId/players/count
//   GET    /serverapi/:serverId/players/:uuid
//   GET    /serverapi/:serverId/console
//   POST   /serverapi/:serverId/console
//   POST   /serverapi/:serverId/start
//   POST   /serverapi/:serverId/stop
//   POST   /serverapi/:serverId/restart
//   POST   /serverapi/:serverId/kill
//   POST   /serverapi/:serverId/send-sigint
//   GET    /serverapi/:serverId/files
//   GET    /serverapi/:serverId/files/content
//   POST   /serverapi/:serverId/files/write
//   DELETE /serverapi/:serverId/files
//   POST   /serverapi/:serverId/files/rename
//   POST   /serverapi/:serverId/files/move
//   POST   /serverapi/:serverId/files/copy
//   POST   /serverapi/:serverId/files/upload
//   GET    /serverapi/:serverId/backups
//   POST   /serverapi/:serverId/backups
//   POST   /serverapi/:serverId/backups/:id/restore
//   DELETE /serverapi/:serverId/backups/:id
//   GET    /serverapi/:serverId/plugins
//   GET    /serverapi/:serverId/plugins/:name
//   POST   /serverapi/:serverId/plugins/install
//   POST   /serverapi/:serverId/plugins/:name/enable
//   POST   /serverapi/:serverId/plugins/:name/disable
//   DELETE /serverapi/:serverId/plugins/:name
//   GET    /serverapi/:serverId/mods
//   GET    /serverapi/:serverId/mods/:name
//   POST   /serverapi/:serverId/mods/install
//   POST   /serverapi/:serverId/mods/:name/enable
//   POST   /serverapi/:serverId/mods/:name/disable
//   DELETE /serverapi/:serverId/mods/:name
//   GET    /serverapi/:serverId/worlds
//   POST   /serverapi/:serverId/worlds/load
//   POST   /serverapi/:serverId/worlds/unload
//   POST   /serverapi/:serverId/worlds/delete
//   GET    /serverapi/:serverId/datapacks
//   POST   /serverapi/:serverId/datapacks/install
//   DELETE /serverapi/:serverId/datapacks/:name
//   POST   /serverapi/:serverId/datapacks/:name/enable
//   POST   /serverapi/:serverId/datapacks/:name/disable
//   GET    /serverapi/:serverId/logs
//   GET    /serverapi/:serverId/statistics
//   GET    /serverapi/:serverId/environment
//   GET    /serverapi/:serverId/tasks
//   POST   /serverapi/:serverId/tasks
//   PATCH  /serverapi/:serverId/tasks/:id
//   DELETE /serverapi/:serverId/tasks/:id
//   GET    /serverapi/:serverId/variables
//   POST   /serverapi/:serverId/variables
//   GET    /serverapi/:serverId/health
const express = require("express");
const database_1 = require("../db/database");
const { apiKeyAuth } = require('../middleware/apiKeyAuth');
const { E, sendError } = require('../core/errors');
const processManager = require("../core/processManager");
const executionManager = require("../core/executionManager");
const https = require("https");
const http = require("http");
const path = require("path");
const fs = require("fs");
const logger = require("../core/utils/logger");
const { getServer, getServerDir } = require('../core/serverHelper');
// ── Native download helper (no external fetch dep needed) ───────────────
function downloadUrl(url) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        lib.get(url, { headers: { 'User-Agent': 'MinePanel/1.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                downloadUrl(res.headers.location).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`Download failed: HTTP ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}
const router = express.Router();
// ── All routes require authentication with appropriate scope ────────────
// ─── GET /info ─────────────────────────────────────────────────────────
router.get('/info', apiKeyAuth('server.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const status = await executionManager.getStatus(server.id.toString());
        const stats = await executionManager.getStats(server.id.toString()).catch(() => null);
        const serverDir = getServerDir(server);
        const worldSize = getWorldSize(serverDir);
        const storageUsage = getStorageUsage(serverDir);
        const iconPath = path.join(serverDir, 'server-icon.png');
        const iconExists = fs.existsSync(iconPath);
        res.json({
            success: true,
            data: {
                name: server.name,
                id: server.id,
                uuid: server.uuid,
                version: server.version,
                software: server.software,
                status,
                uptime: status === 'online' ? Math.floor(process.uptime()) : 0,
                motd: await getMotd(serverDir),
                icon: iconExists ? `/api/servers/${server.id}/properties/icon` : null,
                java_version: await getJavaVersion(server).catch(() => 'unknown'),
                allocated_ram: server.ram_mb,
                used_ram: stats?.ram ? Math.round(stats.ram / 1024 / 1024) : 0,
                cpu_usage: stats?.cpu || 0,
                tps: stats?.tps || 0,
                mspt: stats?.mspt || 0,
                online_players: stats?.players || 0,
                max_players: stats?.maxPlayers || 20,
                world_size: worldSize,
                storage_usage: storageUsage,
            }
        });
    }
    catch (e) {
        logger.error('[serverApi] GET /info error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /performance ──────────────────────────────────────────────────
router.get('/performance', apiKeyAuth('server.performance.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const status = await executionManager.getStatus(server.id.toString());
        const stats = await executionManager.getStats(server.id.toString()).catch(() => null);
        const serverDir = getServerDir(server);
        res.json({
            success: true,
            data: {
                status,
                tps: stats?.tps || 0,
                mspt: stats?.mspt || 0,
                cpu: stats?.cpu || 0,
                ram: stats?.ram ? Math.round(stats.ram / 1024 / 1024) : 0,
                allocated_ram: server.ram_mb,
                network_usage: stats?.network || null,
                disk_usage: getStorageUsage(serverDir),
                tick_time: stats?.mspt || 0,
                thread_count: stats?.threads || 0,
            }
        });
    }
    catch (e) {
        logger.error('[serverApi] GET /performance error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /players ──────────────────────────────────────────────────────
router.get('/players', apiKeyAuth('server.players.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const status = await executionManager.getStatus(server.id.toString());
        if (status !== 'online') {
            return res.json({ success: true, data: [], online: false });
        }
        const stats = await executionManager.getStats(server.id.toString()).catch(() => null);
        const rawPlayers = stats?.playersList || [];
        const players = (rawPlayers || []).map((p) => ({
            uuid: p.uuid || null,
            username: p.name || p.username || 'Unknown',
            ping: p.ping || 0,
            gamemode: p.gamemode || 'survival',
            world: p.world || 'world',
            health: p.health || 20,
            food: p.food || 20,
            x: p.x || 0,
            y: p.y || 0,
            z: p.z || 0,
            playtime: p.playtime || 0,
            ip: null,
        }));
        res.json({ success: true, data: players, count: players.length });
    }
    catch (e) {
        logger.error('[serverApi] GET /players error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /players/count ────────────────────────────────────────────────
router.get('/players/count', apiKeyAuth('server.players.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const stats = await executionManager.getStats(server.id.toString()).catch(() => null);
        res.json({
            success: true,
            data: {
                online: stats?.players || 0,
                max: stats?.maxPlayers || 20,
            }
        });
    }
    catch (e) {
        logger.error('[serverApi] GET /players/count error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /players/:uuid ────────────────────────────────────────────────
router.get('/players/:uuid', apiKeyAuth('server.players.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const stats = await executionManager.getStats(server.id.toString()).catch(() => null);
        const rawPlayers = stats?.playersList || [];
        const player = rawPlayers.find((p) => p.uuid === req.params.uuid || p.name === req.params.uuid);
        if (!player)
            return sendError(res, E.PLAYER_NOT_FOUND, 404);
        res.json({
            success: true,
            data: {
                uuid: player.uuid || req.params.uuid,
                username: player.name || 'Unknown',
                ping: player.ping || 0,
                gamemode: player.gamemode || 'survival',
                world: player.world || 'world',
                health: player.health || 20,
                food: player.food || 20,
                x: player.x || 0,
                y: player.y || 0,
                z: player.z || 0,
                playtime: player.playtime || 0,
                ip: null,
            }
        });
    }
    catch (e) {
        logger.error('[serverApi] GET /players/:uuid error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /console ──────────────────────────────────────────────────────
router.get('/console', apiKeyAuth('server.console.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        let lines = processManager.getHistory(server.id.toString()) || [];
        // Support query params: limit, after, before, search
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const search = req.query.search ? String(req.query.search).toLowerCase() : null;
        if (search) {
            lines = lines.filter((l) => l.toLowerCase().includes(search));
        }
        // Slice for pagination (newest last)
        lines = lines.slice(-limit);
        res.json({
            success: true,
            data: lines,
            count: lines.length,
            server_online: await executionManager.getStatus(server.id.toString()) === 'online',
        });
    }
    catch (e) {
        logger.error('[serverApi] GET /console error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /console ─────────────────────────────────────────────────────
router.post('/console', apiKeyAuth('server.console.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const { command } = req.body;
        if (!command || typeof command !== 'string' || !command.trim()) {
            return sendError(res, E.BAD_REQUEST, 400, 'Command is required');
        }
        const status = await executionManager.getStatus(server.id.toString());
        if (status !== 'online') {
            return sendError(res, E.SERVER_NOT_RUNNING, 400);
        }
        processManager.sendCommand(server.id.toString(), command.trim());
        logger.info(`[serverApi] Console command sent to server ${server.id}: ${command.trim()}`);
        res.json({ success: true, message: 'Command sent' });
    }
    catch (e) {
        logger.error('[serverApi] POST /console error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── Power endpoints ───────────────────────────────────────────────────
const POWER_ACTIONS = {
    start: 'start',
    stop: 'stop',
    restart: 'restart',
    kill: 'kill',
    'send-sigint': 'send_sigint',
};
router.post('/:action(start|stop|restart|kill|send-sigint)', apiKeyAuth('server.power'), async (req, res) => {
    try {
        const action = req.params.action;
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const sid = server.id.toString();
        switch (action) {
            case 'start': {
                const status = await executionManager.getStatus(sid);
                if (status === 'online')
                    return sendError(res, E.SERVER_ALREADY_RUNNING, 400);
                const serverDir = getServerDir(server);
                const jarFile = path.join(serverDir, 'server.jar');
                const javaManager = require('../core/javaManager');
                const javaPath = await javaManager.getJavaPath(server.java_path);
                processManager.start(sid, serverDir, [], jarFile, server.ram_mb, null, javaPath);
                break;
            }
            case 'stop': {
                processManager.stop(sid);
                break;
            }
            case 'restart': {
                processManager.restart(sid);
                break;
            }
            case 'kill': {
                processManager.kill(sid);
                break;
            }
            case 'send-sigint': {
                processManager.sendSignal(sid, 'SIGINT');
                break;
            }
        }
        logger.info(`[serverApi] Power action "${action}" for server ${server.id}`);
        res.json({ success: true, message: `Server ${action} command sent` });
    }
    catch (e) {
        logger.error(`[serverApi] POST /${req.params.action} error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /files ────────────────────────────────────────────────────────
router.get('/files', apiKeyAuth('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const relativePath = req.query.path || '/';
        const absPath = path.join(serverDir, relativePath);
        if (!absPath.startsWith(serverDir)) {
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        }
        if (!fs.existsSync(absPath)) {
            return sendError(res, E.FILE_NOT_FOUND, 404);
        }
        if (fs.statSync(absPath).isDirectory()) {
            const items = fs.readdirSync(absPath).map(name => {
                const full = path.join(absPath, name);
                const stat = fs.statSync(full);
                return {
                    name,
                    is_directory: stat.isDirectory(),
                    size: stat.size,
                    modified_at: stat.mtime.toISOString(),
                };
            }).sort((a, b) => {
                if (a.is_directory !== b.is_directory)
                    return a.is_directory ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
            res.json({ success: true, data: items, path: relativePath });
        }
        else {
            const stat = fs.statSync(absPath);
            res.json({
                success: true,
                data: {
                    name: path.basename(absPath),
                    is_directory: false,
                    size: stat.size,
                    modified_at: stat.mtime.toISOString(),
                },
                path: relativePath,
            });
        }
    }
    catch (e) {
        logger.error('[serverApi] GET /files error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /files/content ───────────────────────────────────────────────
router.get('/files/content', apiKeyAuth('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const relativePath = req.query.path || '';
        const absPath = path.join(serverDir, relativePath);
        if (!absPath.startsWith(serverDir))
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) {
            return sendError(res, E.FILE_NOT_FOUND, 404);
        }
        const maxSize = 10 * 1024 * 1024; // 10 MB
        if (fs.statSync(absPath).size > maxSize) {
            return sendError(res, E.FILE_TOO_LARGE, 413);
        }
        const content = fs.readFileSync(absPath, 'utf-8');
        res.json({ success: true, data: { path: relativePath, content } });
    }
    catch (e) {
        logger.error('[serverApi] GET /files/content error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /files/write ────────────────────────────────────────────────
router.post('/files/write', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const relativePath = req.body.path || '';
        const content = req.body.content || '';
        const absPath = path.join(serverDir, relativePath);
        if (!absPath.startsWith(serverDir))
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.writeFileSync(absPath, content, 'utf-8');
        res.json({ success: true, message: 'File written' });
    }
    catch (e) {
        logger.error('[serverApi] POST /files/write error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── DELETE /files ────────────────────────────────────────────────────
router.delete('/files', apiKeyAuth('server.files.delete'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const relativePath = req.query.path || req.body.path || '';
        const absPath = path.join(serverDir, relativePath);
        if (!absPath.startsWith(serverDir))
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        if (!fs.existsSync(absPath))
            return sendError(res, E.FILE_NOT_FOUND, 404);
        const stat = fs.statSync(absPath);
        if (stat.isDirectory()) {
            fs.rmSync(absPath, { recursive: true, force: true });
        }
        else {
            fs.unlinkSync(absPath);
        }
        res.json({ success: true, message: 'File deleted' });
    }
    catch (e) {
        logger.error('[serverApi] DELETE /files error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /files/rename ───────────────────────────────────────────────
router.post('/files/rename', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const oldPath = req.body.path || '';
        const newName = req.body.name || '';
        const absOld = path.join(serverDir, oldPath);
        const absNew = path.join(path.dirname(absOld), newName);
        if (!absOld.startsWith(serverDir) || !absNew.startsWith(serverDir)) {
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        }
        if (!fs.existsSync(absOld))
            return sendError(res, E.FILE_NOT_FOUND, 404);
        if (fs.existsSync(absNew))
            return sendError(res, E.FILE_ALREADY_EXISTS, 409, 'Target name already exists');
        fs.renameSync(absOld, absNew);
        res.json({ success: true, message: 'File renamed', data: { from: oldPath, to: path.join(path.dirname(oldPath), newName) } });
    }
    catch (e) {
        logger.error('[serverApi] POST /files/rename error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /files/move ─────────────────────────────────────────────────
router.post('/files/move', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const sourcePath = req.body.source || '';
        const destPath = req.body.destination || req.body.dest || '';
        const absSource = path.join(serverDir, sourcePath);
        const absDest = path.join(serverDir, destPath);
        if (!absSource.startsWith(serverDir) || !absDest.startsWith(serverDir)) {
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        }
        if (!fs.existsSync(absSource))
            return sendError(res, E.FILE_NOT_FOUND, 404);
        if (fs.existsSync(absDest))
            return sendError(res, E.FILE_ALREADY_EXISTS, 409, 'Destination already exists');
        fs.mkdirSync(path.dirname(absDest), { recursive: true });
        fs.renameSync(absSource, absDest);
        res.json({ success: true, message: 'File moved', data: { from: sourcePath, to: destPath } });
    }
    catch (e) {
        logger.error('[serverApi] POST /files/move error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /files/copy ─────────────────────────────────────────────────
router.post('/files/copy', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const sourcePath = req.body.source || '';
        const destPath = req.body.destination || req.body.dest || '';
        const absSource = path.join(serverDir, sourcePath);
        const absDest = path.join(serverDir, destPath);
        if (!absSource.startsWith(serverDir) || !absDest.startsWith(serverDir)) {
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        }
        if (!fs.existsSync(absSource))
            return sendError(res, E.FILE_NOT_FOUND, 404);
        if (absSource === absDest)
            return sendError(res, E.BAD_REQUEST, 400, 'Source and destination are the same');
        fs.mkdirSync(path.dirname(absDest), { recursive: true });
        const stat = fs.statSync(absSource);
        if (stat.isDirectory()) {
            copyDirSync(absSource, absDest);
        }
        else {
            fs.copyFileSync(absSource, absDest);
        }
        res.json({ success: true, message: 'File copied', data: { from: sourcePath, to: destPath } });
    }
    catch (e) {
        logger.error('[serverApi] POST /files/copy error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /files/upload ───────────────────────────────────────────────
router.post('/files/upload', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const destPath = req.body.path || req.body.destination || '/';
        const absDest = path.join(serverDir, destPath);
        if (!absDest.startsWith(serverDir))
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        // Support both base64-encoded content and multipart file uploads
        if (req.body.content !== undefined) {
            // Base64-encoded file upload
            const filename = req.body.filename || 'upload.dat';
            const content = Buffer.from(req.body.content, 'base64');
            const filePath = path.join(absDest, filename);
            if (!filePath.startsWith(serverDir))
                return sendError(res, E.FILE_ACCESS_DENIED, 403);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, content);
            return res.json({ success: true, message: 'File uploaded', data: { path: path.join(destPath, filename) } });
        }
        // Raw content upload (non-base64)
        const filename = req.body.filename || 'upload.dat';
        const content = req.body.data || req.body.file || '';
        const filePath = path.join(absDest, filename);
        if (!filePath.startsWith(serverDir))
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
        res.json({ success: true, message: 'File uploaded', data: { path: path.join(destPath, filename) } });
    }
    catch (e) {
        logger.error('[serverApi] POST /files/upload error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /backups ──────────────────────────────────────────────────────
router.get('/backups', apiKeyAuth('server.backups.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const backupDir = path.join(getServerDir(server), 'backups');
        const backups = [];
        if (fs.existsSync(backupDir)) {
            const files = fs.readdirSync(backupDir).filter(f => f.endsWith('.zip')).sort().reverse();
            for (const file of files) {
                const stat = fs.statSync(path.join(backupDir, file));
                backups.push({
                    id: file,
                    filename: file,
                    size: stat.size,
                    created_at: stat.mtime.toISOString(),
                });
            }
        }
        res.json({ success: true, data: backups });
    }
    catch (e) {
        logger.error('[serverApi] GET /backups error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /backups ─────────────────────────────────────────────────────
router.post('/backups', apiKeyAuth('server.backups.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const { createBackup } = require('../core/serverHelper');
        const backupInfo = await createBackup(getServerDir(server), req.body.name || undefined);
        res.json({ success: true, message: 'Backup created', data: backupInfo });
    }
    catch (e) {
        logger.error('[serverApi] POST /backups error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});
// ─── POST /backups/:id/restore ─────────────────────────────────────────
router.post('/backups/:id/restore', apiKeyAuth('server.backups.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const { restoreBackup } = require('../core/serverHelper');
        await restoreBackup(getServerDir(server), req.params.id);
        res.json({ success: true, message: 'Backup restored' });
    }
    catch (e) {
        logger.error('[serverApi] POST /backups/:id/restore error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});
// ─── DELETE /backups/:id ──────────────────────────────────────────────
router.delete('/backups/:id', apiKeyAuth('server.backups.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const backupPath = path.join(getServerDir(server), 'backups', req.params.id);
        if (!fs.existsSync(backupPath))
            return sendError(res, E.BACKUP_NOT_FOUND, 404);
        fs.unlinkSync(backupPath);
        res.json({ success: true, message: 'Backup deleted' });
    }
    catch (e) {
        logger.error('[serverApi] DELETE /backups/:id error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /plugins ──────────────────────────────────────────────────────
router.get('/plugins', apiKeyAuth('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const pluginDir = path.join(getServerDir(server), 'plugins');
        const plugins = [];
        if (fs.existsSync(pluginDir)) {
            const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.jar') || f.endsWith('.phar'));
            for (const file of files) {
                const stat = fs.statSync(path.join(pluginDir, file));
                plugins.push({
                    name: file.replace(/\.(jar|phar)$/, ''),
                    filename: file,
                    size: stat.size,
                    modified_at: stat.mtime.toISOString(),
                });
            }
        }
        res.json({ success: true, data: plugins });
    }
    catch (e) {
        logger.error('[serverApi] GET /plugins error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /plugins/:name ────────────────────────────────────────────────
router.get('/plugins/:name', apiKeyAuth('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const pluginDir = path.join(getServerDir(server), 'plugins');
        const pluginName = req.params.name;
        const jarName = pluginName.endsWith('.jar') || pluginName.endsWith('.phar') ? pluginName : pluginName + '.jar';
        const pluginPath = path.join(pluginDir, jarName);
        if (!pluginPath.startsWith(pluginDir))
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        if (!fs.existsSync(pluginPath))
            return sendError(res, E.PLUGIN_NOT_FOUND, 404);
        const stat = fs.statSync(pluginPath);
        res.json({
            success: true,
            data: {
                name: pluginName.replace(/\.(jar|phar)$/, ''),
                filename: path.basename(pluginPath),
                size: stat.size,
                modified_at: stat.mtime.toISOString(),
            }
        });
    }
    catch (e) {
        logger.error('[serverApi] GET /plugins/:name error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /plugins/install ─────────────────────────────────────────────
router.post('/plugins/install', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const pluginDir = path.join(getServerDir(server), 'plugins');
        if (!fs.existsSync(pluginDir))
            fs.mkdirSync(pluginDir, { recursive: true });
        const { url } = req.body;
        if (!url) {
            return sendError(res, E.BAD_REQUEST, 400, 'Download URL is required. POST with {"url": "..."}');
        }
        // Determine filename from URL or body
        let filename = req.body.filename || '';
        if (!filename) {
            filename = path.basename(new URL(url).pathname) || 'plugin.jar';
            if (!filename.endsWith('.jar') && !filename.endsWith('.phar'))
                filename += '.jar';
        }
        const destPath = path.join(pluginDir, filename);
        if (!destPath.startsWith(pluginDir))
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        // Download the plugin
        const buffer = await downloadUrl(url);
        fs.writeFileSync(destPath, buffer);
        res.json({ success: true, message: 'Plugin installed', data: { filename, size: buffer.length } });
    }
    catch (e) {
        logger.error('[serverApi] POST /plugins/install error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});
// ─── POST /plugins/:name/enable ────────────────────────────────────────
router.post('/plugins/:name/enable', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const pluginDir = path.join(getServerDir(server), 'plugins');
        const disabledDir = path.join(getServerDir(server), 'plugins.disabled');
        const name = req.params.name.endsWith('.jar') ? req.params.name : req.params.name + '.jar';
        const disabledPath = path.join(disabledDir, name);
        const activePath = path.join(pluginDir, name);
        if (fs.existsSync(activePath))
            return res.json({ success: true, message: 'Plugin already enabled' });
        if (!fs.existsSync(disabledPath))
            return sendError(res, E.PLUGIN_NOT_FOUND, 404);
        if (!fs.existsSync(pluginDir))
            fs.mkdirSync(pluginDir, { recursive: true });
        fs.renameSync(disabledPath, activePath);
        res.json({ success: true, message: 'Plugin enabled' });
    }
    catch (e) {
        logger.error('[serverApi] POST /plugins/:name/enable error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /plugins/:name/disable ───────────────────────────────────────
router.post('/plugins/:name/disable', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const pluginDir = path.join(getServerDir(server), 'plugins');
        const disabledDir = path.join(getServerDir(server), 'plugins.disabled');
        const name = req.params.name.endsWith('.jar') ? req.params.name : req.params.name + '.jar';
        const activePath = path.join(pluginDir, name);
        const disabledPath = path.join(disabledDir, name);
        if (!fs.existsSync(activePath))
            return sendError(res, E.PLUGIN_NOT_FOUND, 404);
        if (!fs.existsSync(disabledDir))
            fs.mkdirSync(disabledDir, { recursive: true });
        fs.renameSync(activePath, disabledPath);
        res.json({ success: true, message: 'Plugin disabled' });
    }
    catch (e) {
        logger.error('[serverApi] POST /plugins/:name/disable error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── DELETE /plugins/:name ─────────────────────────────────────────────
router.delete('/plugins/:name', apiKeyAuth('server.files.delete'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const pluginDir = path.join(getServerDir(server), 'plugins');
        const disabledDir = path.join(getServerDir(server), 'plugins.disabled');
        const name = req.params.name.endsWith('.jar') || req.params.name.endsWith('.phar') ? req.params.name : req.params.name + '.jar';
        for (const dir of [pluginDir, disabledDir]) {
            const filePath = path.join(dir, name);
            if (filePath.startsWith(dir) && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                return res.json({ success: true, message: 'Plugin deleted' });
            }
        }
        return sendError(res, E.PLUGIN_NOT_FOUND, 404);
    }
    catch (e) {
        logger.error('[serverApi] DELETE /plugins/:name error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /mods ─────────────────────────────────────────────────────────
router.get('/mods', apiKeyAuth('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const modDir = path.join(getServerDir(server), 'mods');
        const mods = [];
        if (fs.existsSync(modDir)) {
            const files = fs.readdirSync(modDir).filter(f => f.endsWith('.jar'));
            for (const file of files) {
                const stat = fs.statSync(path.join(modDir, file));
                mods.push({
                    name: file.replace(/\.jar$/, ''),
                    filename: file,
                    size: stat.size,
                    modified_at: stat.mtime.toISOString(),
                });
            }
        }
        res.json({ success: true, data: mods });
    }
    catch (e) {
        logger.error('[serverApi] GET /mods error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /mods/:name ───────────────────────────────────────────────────
router.get('/mods/:name', apiKeyAuth('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const modDir = path.join(getServerDir(server), 'mods');
        const modName = req.params.name.endsWith('.jar') ? req.params.name : req.params.name + '.jar';
        const modPath = path.join(modDir, modName);
        if (!modPath.startsWith(modDir))
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        if (!fs.existsSync(modPath))
            return sendError(res, E.PLUGIN_NOT_FOUND, 404);
        const stat = fs.statSync(modPath);
        res.json({
            success: true,
            data: {
                name: modName.replace(/\.jar$/, ''),
                filename: modName,
                size: stat.size,
                modified_at: stat.mtime.toISOString(),
            }
        });
    }
    catch (e) {
        logger.error('[serverApi] GET /mods/:name error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /mods/install ────────────────────────────────────────────────
router.post('/mods/install', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const modDir = path.join(getServerDir(server), 'mods');
        if (!fs.existsSync(modDir))
            fs.mkdirSync(modDir, { recursive: true });
        const { url } = req.body;
        if (!url) {
            return sendError(res, E.BAD_REQUEST, 400, 'Download URL is required');
        }
        let filename = req.body.filename || '';
        if (!filename) {
            filename = path.basename(new URL(url).pathname) || 'mod.jar';
            if (!filename.endsWith('.jar'))
                filename += '.jar';
        }
        const destPath = path.join(modDir, filename);
        if (!destPath.startsWith(modDir))
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        const buffer = await downloadUrl(url);
        fs.writeFileSync(destPath, buffer);
        res.json({ success: true, message: 'Mod installed', data: { filename, size: buffer.length } });
    }
    catch (e) {
        logger.error('[serverApi] POST /mods/install error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});
// ─── POST /mods/:name/enable ───────────────────────────────────────────
router.post('/mods/:name/enable', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const modDir = path.join(getServerDir(server), 'mods');
        const disabledDir = path.join(getServerDir(server), 'mods.disabled');
        const name = req.params.name.endsWith('.jar') ? req.params.name : req.params.name + '.jar';
        const disabledPath = path.join(disabledDir, name);
        const activePath = path.join(modDir, name);
        if (fs.existsSync(activePath))
            return res.json({ success: true, message: 'Mod already enabled' });
        if (!fs.existsSync(disabledPath))
            return sendError(res, E.PLUGIN_NOT_FOUND, 404);
        if (!fs.existsSync(modDir))
            fs.mkdirSync(modDir, { recursive: true });
        fs.renameSync(disabledPath, activePath);
        res.json({ success: true, message: 'Mod enabled' });
    }
    catch (e) {
        logger.error('[serverApi] POST /mods/:name/enable error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /mods/:name/disable ──────────────────────────────────────────
router.post('/mods/:name/disable', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const modDir = path.join(getServerDir(server), 'mods');
        const disabledDir = path.join(getServerDir(server), 'mods.disabled');
        const name = req.params.name.endsWith('.jar') ? req.params.name : req.params.name + '.jar';
        const activePath = path.join(modDir, name);
        const disabledPath = path.join(disabledDir, name);
        if (!fs.existsSync(activePath))
            return sendError(res, E.PLUGIN_NOT_FOUND, 404);
        if (!fs.existsSync(disabledDir))
            fs.mkdirSync(disabledDir, { recursive: true });
        fs.renameSync(activePath, disabledPath);
        res.json({ success: true, message: 'Mod disabled' });
    }
    catch (e) {
        logger.error('[serverApi] POST /mods/:name/disable error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── DELETE /mods/:name ────────────────────────────────────────────────
router.delete('/mods/:name', apiKeyAuth('server.files.delete'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const modDir = path.join(getServerDir(server), 'mods');
        const disabledDir = path.join(getServerDir(server), 'mods.disabled');
        const name = req.params.name.endsWith('.jar') ? req.params.name : req.params.name + '.jar';
        for (const dir of [modDir, disabledDir]) {
            const filePath = path.join(dir, name);
            if (filePath.startsWith(dir) && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                return res.json({ success: true, message: 'Mod deleted' });
            }
        }
        return sendError(res, E.PLUGIN_NOT_FOUND, 404);
    }
    catch (e) {
        logger.error('[serverApi] DELETE /mods/:name error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /worlds ───────────────────────────────────────────────────────
router.get('/worlds', apiKeyAuth('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const worlds = [];
        if (fs.existsSync(serverDir)) {
            const entries = fs.readdirSync(serverDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.') &&
                    !['plugins', 'mods', 'logs', 'backups', 'cache', 'crash-reports', 'libraries', 'versions'].includes(entry.name)) {
                    const worldPath = path.join(serverDir, entry.name);
                    if (fs.existsSync(path.join(worldPath, 'level.dat')) || fs.existsSync(path.join(worldPath, 'region'))) {
                        const stat = fs.statSync(worldPath);
                        worlds.push({
                            name: entry.name,
                            size: getDirSize(worldPath),
                            modified_at: stat.mtime.toISOString(),
                        });
                    }
                }
            }
        }
        res.json({ success: true, data: worlds });
    }
    catch (e) {
        logger.error('[serverApi] GET /worlds error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /worlds/load ─────────────────────────────────────────────────
router.post('/worlds/load', apiKeyAuth('server.console.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const worldName = req.body.name || req.body.world || '';
        if (!worldName)
            return sendError(res, E.BAD_REQUEST, 400, 'World name is required');
        processManager.sendCommand(server.id.toString(), `mv confirm`);
        processManager.sendCommand(server.id.toString(), `world load ${worldName}`);
        res.json({ success: true, message: `Load command sent for world "${worldName}"` });
    }
    catch (e) {
        logger.error('[serverApi] POST /worlds/load error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /worlds/unload ───────────────────────────────────────────────
router.post('/worlds/unload', apiKeyAuth('server.console.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const worldName = req.body.name || req.body.world || '';
        if (!worldName)
            return sendError(res, E.BAD_REQUEST, 400, 'World name is required');
        processManager.sendCommand(server.id.toString(), `mv confirm`);
        processManager.sendCommand(server.id.toString(), `world unload ${worldName}`);
        res.json({ success: true, message: `Unload command sent for world "${worldName}"` });
    }
    catch (e) {
        logger.error('[serverApi] POST /worlds/unload error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /worlds/delete ───────────────────────────────────────────────
router.post('/worlds/delete', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const worldName = req.body.name || req.body.world || '';
        if (!worldName)
            return sendError(res, E.BAD_REQUEST, 400, 'World name is required');
        const serverDir = getServerDir(server);
        const worldPath = path.join(serverDir, worldName);
        if (!worldPath.startsWith(serverDir))
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        if (!fs.existsSync(worldPath))
            return sendError(res, E.FILE_NOT_FOUND, 404, 'World directory not found');
        if (fs.statSync(worldPath).isDirectory()) {
            // Send world delete command to server first if online
            const status = await executionManager.getStatus(server.id.toString()).catch(() => 'offline');
            if (status === 'online') {
                processManager.sendCommand(server.id.toString(), `mv confirm`);
                processManager.sendCommand(server.id.toString(), `world delete ${worldName}`);
            }
            // Also remove from filesystem as backup
            fs.rmSync(worldPath, { recursive: true, force: true });
        }
        else {
            fs.unlinkSync(worldPath);
        }
        res.json({ success: true, message: `World "${worldName}" deleted` });
    }
    catch (e) {
        logger.error('[serverApi] POST /worlds/delete error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /datapacks ────────────────────────────────────────────────────
router.get('/datapacks', apiKeyAuth('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        // Read level-name from server.properties to find datapacks directory
        const propsPath = path.join(getServerDir(server), 'server.properties');
        let levelName = 'world';
        if (fs.existsSync(propsPath)) {
            const content = fs.readFileSync(propsPath, 'utf-8');
            const match = content.match(/^level-name=(.*)$/m);
            if (match)
                levelName = match[1].trim();
        }
        const datapacksDir = path.join(getServerDir(server), levelName, 'datapacks');
        const datapacks = [];
        if (fs.existsSync(datapacksDir)) {
            const entries = fs.readdirSync(datapacksDir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name.startsWith('.minepanel-metadata-') || entry.name.startsWith('.'))
                    continue;
                const fullPath = path.join(datapacksDir, entry.name);
                const stat = fs.statSync(fullPath);
                const item = {
                    name: entry.name,
                    is_directory: entry.isDirectory(),
                    size: stat.size,
                    modified_at: stat.mtime.toISOString(),
                };
                // Read sidecar metadata
                const metaPath = path.join(datapacksDir, `.minepanel-metadata-${entry.name}.json`);
                if (fs.existsSync(metaPath)) {
                    try {
                        item.metadata = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                    }
                    catch { /* ignore */ }
                }
                datapacks.push(item);
            }
        }
        res.json({ success: true, data: datapacks });
    }
    catch (e) {
        logger.error('[serverApi] GET /datapacks error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /datapacks/install ───────────────────────────────────────────
router.post('/datapacks/install', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const propsPath = path.join(getServerDir(server), 'server.properties');
        let levelName = 'world';
        if (fs.existsSync(propsPath)) {
            const match = fs.readFileSync(propsPath, 'utf-8').match(/^level-name=(.*)$/m);
            if (match)
                levelName = match[1].trim();
        }
        const datapacksDir = path.join(getServerDir(server), levelName, 'datapacks');
        if (!fs.existsSync(datapacksDir))
            fs.mkdirSync(datapacksDir, { recursive: true });
        const { url, name } = req.body;
        if (!url)
            return sendError(res, E.BAD_REQUEST, 400, 'Download URL is required');
        const filename = (name || path.basename(new URL(url).pathname) || 'datapack.zip');
        const finalName = filename.toLowerCase().endsWith('.zip') ? filename : filename + '.zip';
        const destPath = path.join(datapacksDir, finalName);
        if (!destPath.startsWith(datapacksDir))
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        const buffer = await downloadUrl(url);
        fs.writeFileSync(destPath, buffer);
        res.json({ success: true, message: 'Datapack installed', data: { filename: finalName, size: buffer.length } });
    }
    catch (e) {
        logger.error('[serverApi] POST /datapacks/install error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});
// ─── DELETE /datapacks/:name ───────────────────────────────────────────
router.delete('/datapacks/:name', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const propsPath = path.join(getServerDir(server), 'server.properties');
        let levelName = 'world';
        if (fs.existsSync(propsPath)) {
            const match = fs.readFileSync(propsPath, 'utf-8').match(/^level-name=(.*)$/m);
            if (match)
                levelName = match[1].trim();
        }
        const datapacksDir = path.join(getServerDir(server), levelName, 'datapacks');
        const targetName = req.params.name.toLowerCase().endsWith('.zip') ? req.params.name : req.params.name + '.zip';
        const filePath = path.join(datapacksDir, targetName);
        if (!filePath.startsWith(datapacksDir))
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        if (!fs.existsSync(filePath))
            return sendError(res, E.FILE_NOT_FOUND, 404);
        fs.unlinkSync(filePath);
        // Remove sidecar metadata
        const metaPath = path.join(datapacksDir, `.minepanel-metadata-${targetName}.json`);
        if (fs.existsSync(metaPath))
            fs.unlinkSync(metaPath);
        res.json({ success: true, message: 'Datapack deleted' });
    }
    catch (e) {
        logger.error('[serverApi] DELETE /datapacks/:name error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /datapacks/:name/enable ──────────────────────────────────────
router.post('/datapacks/:name/enable', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const propsPath = path.join(getServerDir(server), 'server.properties');
        let levelName = 'world';
        if (fs.existsSync(propsPath)) {
            const match = fs.readFileSync(propsPath, 'utf-8').match(/^level-name=(.*)$/m);
            if (match)
                levelName = match[1].trim();
        }
        const datapacksDir = path.join(getServerDir(server), levelName, 'datapacks');
        const disabledDir = path.join(datapacksDir, '.disabled');
        const targetName = req.params.name.toLowerCase().endsWith('.zip') ? req.params.name : req.params.name + '.zip';
        const disabledPath = path.join(disabledDir, targetName);
        const activePath = path.join(datapacksDir, targetName);
        if (fs.existsSync(activePath))
            return res.json({ success: true, message: 'Datapack already enabled' });
        if (!fs.existsSync(disabledPath))
            return sendError(res, E.FILE_NOT_FOUND, 404, 'Datapack not found in disabled folder');
        fs.renameSync(disabledPath, activePath);
        res.json({ success: true, message: 'Datapack enabled' });
    }
    catch (e) {
        logger.error('[serverApi] POST /datapacks/:name/enable error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /datapacks/:name/disable ─────────────────────────────────────
router.post('/datapacks/:name/disable', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const propsPath = path.join(getServerDir(server), 'server.properties');
        let levelName = 'world';
        if (fs.existsSync(propsPath)) {
            const match = fs.readFileSync(propsPath, 'utf-8').match(/^level-name=(.*)$/m);
            if (match)
                levelName = match[1].trim();
        }
        const datapacksDir = path.join(getServerDir(server), levelName, 'datapacks');
        const disabledDir = path.join(datapacksDir, '.disabled');
        const targetName = req.params.name.toLowerCase().endsWith('.zip') ? req.params.name : req.params.name + '.zip';
        const activePath = path.join(datapacksDir, targetName);
        const disabledPath = path.join(disabledDir, targetName);
        if (!fs.existsSync(activePath))
            return sendError(res, E.FILE_NOT_FOUND, 404, 'Datapack not found');
        if (!fs.existsSync(disabledDir))
            fs.mkdirSync(disabledDir, { recursive: true });
        fs.renameSync(activePath, disabledPath);
        res.json({ success: true, message: 'Datapack disabled' });
    }
    catch (e) {
        logger.error('[serverApi] POST /datapacks/:name/disable error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /logs ─────────────────────────────────────────────────────────
router.get('/logs', apiKeyAuth('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const logsDir = path.join(getServerDir(server), 'logs');
        const logs = [];
        if (fs.existsSync(logsDir)) {
            const files = fs.readdirSync(logsDir)
                .filter(f => f.endsWith('.log') || f.endsWith('.txt') || f.endsWith('.gz'))
                .sort()
                .reverse();
            for (const file of files.slice(0, 20)) {
                const stat = fs.statSync(path.join(logsDir, file));
                logs.push({
                    filename: file,
                    size: stat.size,
                    modified_at: stat.mtime.toISOString(),
                });
            }
        }
        // Also include the latest log
        const latestLog = processManager.getHistory(server.id.toString());
        const latestLines = latestLog ? latestLog.slice(-100) : [];
        res.json({ success: true, data: { files: logs, latest: latestLines } });
    }
    catch (e) {
        logger.error('[serverApi] GET /logs error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /statistics ───────────────────────────────────────────────────
router.get('/statistics', apiKeyAuth('server.performance.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const range = req.query.range || '24h';
        const allowedRanges = ['1h', '24h', '7d', '30d'];
        if (!allowedRanges.includes(range)) {
            return sendError(res, E.BAD_REQUEST, 400, 'Range must be one of: 1h, 24h, 7d, 30d');
        }
        const now = new Date();
        let since;
        switch (range) {
            case '1h':
                since = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case '7d':
                since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            default: since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
        const history = await (0, database_1.dbAll)(`SELECT * FROM server_stats WHERE server_id = ? AND created_at >= ? ORDER BY created_at ASC`, [server.id, since.toISOString()]);
        res.json({
            success: true,
            data: (history || []).map((h) => ({
                tps: h.tps,
                mspt: h.mspt,
                cpu: h.cpu,
                ram: h.ram,
                players: h.players,
                timestamp: h.created_at,
            })),
            range,
        });
    }
    catch (e) {
        logger.error('[serverApi] GET /statistics error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /environment ──────────────────────────────────────────────────
router.get('/environment', apiKeyAuth('server.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const javaPath = server.java_path || 'java';
        let javaVersion = 'unknown';
        try {
            const { execSync } = require('child_process');
            javaVersion = execSync(`"${javaPath}" -version 2>&1`).toString().split('\n')[0] || 'unknown';
        }
        catch { /* ignore */ }
        res.json({
            success: true,
            data: {
                java_version: javaVersion,
                java_path: javaPath,
                allocated_ram: server.ram_mb,
                allocated_ram_gb: (server.ram_mb / 1024).toFixed(1),
                startup_flags: [],
                jvm_arguments: [
                    `-Xms${server.ram_mb}M`,
                    `-Xmx${server.ram_mb}M`,
                    '-XX:+UseG1GC',
                    '-XX:+ParallelReflectionEnabled',
                    '-XX:MaxGCPauseMillis=200',
                ],
            }
        });
    }
    catch (e) {
        logger.error('[serverApi] GET /environment error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /tasks ────────────────────────────────────────────────────────
router.get('/tasks', apiKeyAuth('server.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        // Read tasks from the server's tasks.json file
        const tasksFile = path.join(getServerDir(server), 'server-tasks.json');
        let tasks = [];
        if (fs.existsSync(tasksFile)) {
            try {
                tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
                if (!Array.isArray(tasks))
                    tasks = [];
            }
            catch {
                tasks = [];
            }
        }
        res.json({ success: true, data: tasks });
    }
    catch (e) {
        logger.error('[serverApi] GET /tasks error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /tasks ───────────────────────────────────────────────────────
router.post('/tasks', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const tasksFile = path.join(getServerDir(server), 'server-tasks.json');
        let tasks = [];
        if (fs.existsSync(tasksFile)) {
            try {
                tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
                if (!Array.isArray(tasks))
                    tasks = [];
            }
            catch {
                tasks = [];
            }
        }
        const { name, type, command, cron, enabled, description } = req.body;
        if (!name || !type)
            return sendError(res, E.BAD_REQUEST, 400, 'Name and type are required');
        const newTask = {
            id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6),
            name,
            type: type || 'command',
            command: command || '',
            cron: cron || null,
            enabled: enabled !== false,
            description: description || '',
            created_at: new Date().toISOString(),
            last_run: null,
            runs: 0,
        };
        tasks.push(newTask);
        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
        res.status(201).json({ success: true, message: 'Task created', data: newTask });
    }
    catch (e) {
        logger.error('[serverApi] POST /tasks error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── PATCH /tasks/:id ──────────────────────────────────────────────────
router.patch('/tasks/:id', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const tasksFile = path.join(getServerDir(server), 'server-tasks.json');
        if (!fs.existsSync(tasksFile))
            return sendError(res, E.NOT_FOUND, 404, 'No tasks found');
        let tasks = [];
        try {
            tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
            if (!Array.isArray(tasks))
                tasks = [];
        }
        catch {
            tasks = [];
        }
        const idx = tasks.findIndex((t) => t.id === req.params.id);
        if (idx === -1)
            return sendError(res, E.NOT_FOUND, 404, 'Task not found');
        const { name, type, command, cron, enabled, description } = req.body;
        if (name !== undefined)
            tasks[idx].name = name;
        if (type !== undefined)
            tasks[idx].type = type;
        if (command !== undefined)
            tasks[idx].command = command;
        if (cron !== undefined)
            tasks[idx].cron = cron;
        if (enabled !== undefined)
            tasks[idx].enabled = enabled;
        if (description !== undefined)
            tasks[idx].description = description;
        tasks[idx].updated_at = new Date().toISOString();
        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
        res.json({ success: true, message: 'Task updated', data: tasks[idx] });
    }
    catch (e) {
        logger.error('[serverApi] PATCH /tasks/:id error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── DELETE /tasks/:id ─────────────────────────────────────────────────
router.delete('/tasks/:id', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const tasksFile = path.join(getServerDir(server), 'server-tasks.json');
        if (!fs.existsSync(tasksFile))
            return sendError(res, E.NOT_FOUND, 404, 'No tasks found');
        let tasks = [];
        try {
            tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'));
            if (!Array.isArray(tasks))
                tasks = [];
        }
        catch {
            tasks = [];
        }
        const idx = tasks.findIndex((t) => t.id === req.params.id);
        if (idx === -1)
            return sendError(res, E.NOT_FOUND, 404, 'Task not found');
        tasks.splice(idx, 1);
        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
        res.json({ success: true, message: 'Task deleted' });
    }
    catch (e) {
        logger.error('[serverApi] DELETE /tasks/:id error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /variables ────────────────────────────────────────────────────
router.get('/variables', apiKeyAuth('server.read'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const varsFile = path.join(getServerDir(server), 'server-variables.json');
        let variables = {};
        if (fs.existsSync(varsFile)) {
            try {
                variables = JSON.parse(fs.readFileSync(varsFile, 'utf-8'));
                if (typeof variables !== 'object' || Array.isArray(variables))
                    variables = {};
            }
            catch {
                variables = {};
            }
        }
        res.json({ success: true, data: variables });
    }
    catch (e) {
        logger.error('[serverApi] GET /variables error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── POST /variables ───────────────────────────────────────────────────
router.post('/variables', apiKeyAuth('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.apiKey.serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const varsFile = path.join(getServerDir(server), 'server-variables.json');
        let variables = {};
        if (fs.existsSync(varsFile)) {
            try {
                variables = JSON.parse(fs.readFileSync(varsFile, 'utf-8'));
                if (typeof variables !== 'object' || Array.isArray(variables))
                    variables = {};
            }
            catch {
                variables = {};
            }
        }
        const { key, value, data } = req.body;
        // Support both single key-value and bulk update
        if (data && typeof data === 'object') {
            // Bulk update: merge all key-value pairs
            for (const [k, v] of Object.entries(data)) {
                variables[k] = String(v);
            }
        }
        else if (key) {
            if (value === null || value === undefined) {
                // Delete the variable
                delete variables[key];
            }
            else {
                variables[key] = String(value);
            }
        }
        else {
            return sendError(res, E.BAD_REQUEST, 400, 'Provide { key, value } or { data: { ... } }');
        }
        fs.writeFileSync(varsFile, JSON.stringify(variables, null, 2));
        res.json({ success: true, message: 'Variables updated', data: variables });
    }
    catch (e) {
        logger.error('[serverApi] POST /variables error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
// ─── GET /health ───────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
    res.json({
        success: true,
        data: {
            status: 'operational',
            timestamp: new Date().toISOString(),
            version: require('../../package.json').version,
        }
    });
});
// ── Helper functions ───────────────────────────────────────────────────
function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        }
        else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
function getWorldSize(serverDir) {
    if (!fs.existsSync(serverDir))
        return '0 B';
    try {
        const entries = fs.readdirSync(serverDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const levelPath = path.join(serverDir, entry.name, 'level.dat');
                if (fs.existsSync(levelPath)) {
                    const worldPath = path.join(serverDir, entry.name);
                    return formatSize(getDirSize(worldPath));
                }
            }
        }
    }
    catch { /* ignore */ }
    return '0 B';
}
function getStorageUsage(serverDir) {
    if (!fs.existsSync(serverDir))
        return '0 B';
    try {
        return formatSize(getDirSize(serverDir));
    }
    catch {
        return '0 B';
    }
}
function getDirSize(dirPath) {
    let total = 0;
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                total += getDirSize(fullPath);
            }
            else {
                total += fs.statSync(fullPath).size;
            }
        }
    }
    catch { /* ignore */ }
    return total;
}
function formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return `${size.toFixed(1)} ${units[i]}`;
}
async function getMotd(serverDir) {
    const propsPath = path.join(serverDir, 'server.properties');
    if (!fs.existsSync(propsPath))
        return '';
    try {
        const content = fs.readFileSync(propsPath, 'utf-8');
        const match = content.match(/^motd=(.*)$/m);
        return match ? match[1].trim() : '';
    }
    catch {
        return '';
    }
}
async function getJavaVersion(server) {
    try {
        const { execSync } = require('child_process');
        const javaPath = server.java_path || 'java';
        const out = execSync(`"${javaPath}" -version 2>&1`).toString();
        return out.split('\n')[0] || 'unknown';
    }
    catch {
        return 'unknown';
    }
}
module.exports = router;
//# sourceMappingURL=serverApiRoutes.js.map