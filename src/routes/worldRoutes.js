"use strict";
const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const authModule = require("../core/auth");
const { authenticateToken } = authModule;
const permissionsModule = require("../core/permissions");
const { checkPermission } = permissionsModule;
const errorsModule = require("../core/errors");
const { E, sendError } = errorsModule;
const logger = require("../core/utils/logger");
const processManager = require("../core/processManager");
const javaManager = require("../core/javaManager");
const { getServer, getServerDir } = require('../core/serverHelper');
const serverHelpersModule = require("./modules/serverHelpers");
const { getStartInfo } = serverHelpersModule;
const archiver_1 = require("archiver");
function archiver(_fmt, opts) { return new archiver_1.ZipArchive(opts); }
const AdmZip = require("adm-zip");
const router = express.Router({ mergeParams: true });
const worldCache = new Map();
async function getDirSize(dirPath) {
    let size = 0;
    try {
        const files = await fsp.readdir(dirPath, { withFileTypes: true });
        for (const file of files) {
            const filePath = path.join(dirPath, file.name);
            if (file.isDirectory()) {
                size += await getDirSize(filePath);
            }
            else if (file.isFile()) {
                const stat = await fsp.stat(filePath);
                size += stat.size;
            }
        }
    }
    catch (_) { }
    return size;
}
async function copyDir(src, dest) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDir(srcPath, destPath);
        }
        else {
            await fsp.copyFile(srcPath, destPath);
        }
    }
}
async function scanForWorlds(dir, baseDir) {
    const list = [];
    const skipDirs = ['libraries', 'cache', '.runtime', 'backups', 'logs', 'mods', 'plugins', 'webroot', 'repair_bak', 'repair_bak.zip'];
    try {
        const files = await fsp.readdir(dir, { withFileTypes: true });
        // Check if current dir is a world (has level.dat)
        const hasLevelDat = files.some(f => f.isFile() && f.name.toLowerCase() === 'level.dat');
        if (hasLevelDat) {
            const relPath = path.relative(baseDir, dir) || '.';
            const stat = await fsp.stat(path.join(dir, 'level.dat'));
            const size = await getDirSize(dir);
            // Count datapacks
            let datapacksCount = 0;
            const dpPath = path.join(dir, 'datapacks');
            if (fs.existsSync(dpPath)) {
                try {
                    const dpFiles = await fsp.readdir(dpPath);
                    datapacksCount = dpFiles.length;
                }
                catch (_) { }
            }
            list.push({
                name: path.basename(dir),
                path: relPath.replace(/\\/g, '/'),
                size,
                lastModified: stat.mtimeMs,
                datapacksCount
            });
            // Do not recurse inside a world directory
            return list;
        }
        // Recurse subdirectories
        for (const file of files) {
            if (file.isDirectory() && !skipDirs.includes(file.name)) {
                const subPath = path.join(dir, file.name);
                const subWorlds = await scanForWorlds(subPath, baseDir);
                list.push(...subWorlds);
            }
        }
    }
    catch (_) { }
    return list;
}
function getActiveWorldName(serverDir) {
    const propPath = path.join(serverDir, 'server.properties');
    if (fs.existsSync(propPath)) {
        try {
            const content = fs.readFileSync(propPath, 'utf8');
            const match = content.match(/^level-name\s*=\s*(.+)$/m);
            if (match)
                return match[1].trim();
        }
        catch (_) { }
    }
    return 'world';
}
router.get('/:serverId/worlds', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
    const serverId = req.params.serverId;
    const forceRefresh = req.query.refresh === 'true';
    try {
        const server = await getServer(serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const numericId = parseInt(serverId, 10);
        const isActive = processManager.isActive(serverId);
        // Cache hit
        if (!isActive && !forceRefresh) {
            const cached = worldCache.get(numericId);
            if (cached && (Date.now() - cached.timestamp) < 600000) { // 10 min cache
                return res.json({
                    worlds: cached.worlds,
                    activeWorld: getActiveWorldName(serverDir)
                });
            }
        }
        const worlds = await scanForWorlds(serverDir, serverDir);
        if (!isActive) {
            worldCache.set(numericId, { worlds, timestamp: Date.now() });
        }
        res.json({
            worlds,
            activeWorld: getActiveWorldName(serverDir)
        });
    }
    catch (e) {
        logger.error(`[worldRoutes] GET worlds error (Server: ${serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
router.post('/:serverId/worlds/clone', authenticateToken, checkPermission('server.files.write'), async (req, res) => {
    const serverId = req.params.serverId;
    const { worldName, newName } = req.body;
    if (!worldName || !newName) {
        return sendError(res, E.BAD_REQUEST, 400, 'Parameters worldName and newName are required.');
    }
    try {
        const server = await getServer(serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const srcPath = path.join(serverDir, worldName);
        const destPath = path.join(serverDir, newName);
        if (!fs.existsSync(srcPath)) {
            return sendError(res, E.BAD_REQUEST, 404, 'Source world folder not found.');
        }
        if (fs.existsSync(destPath)) {
            return sendError(res, E.BAD_REQUEST, 400, 'Destination folder name already exists.');
        }
        await copyDir(srcPath, destPath);
        worldCache.delete(parseInt(serverId, 10));
        res.json({ success: true, message: `World folder cloned from ${worldName} to ${newName}.` });
    }
    catch (e) {
        logger.error(`[worldRoutes] POST clone world error (Server: ${serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
router.post('/:serverId/worlds/rename', authenticateToken, checkPermission('server.files.write'), async (req, res) => {
    const serverId = req.params.serverId;
    const { worldName, newName } = req.body;
    if (!worldName || !newName) {
        return sendError(res, E.BAD_REQUEST, 400, 'Parameters worldName and newName are required.');
    }
    try {
        const server = await getServer(serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const srcPath = path.join(serverDir, worldName);
        const destPath = path.join(serverDir, newName);
        if (!fs.existsSync(srcPath)) {
            return sendError(res, E.BAD_REQUEST, 404, 'Source world folder not found.');
        }
        if (fs.existsSync(destPath)) {
            return sendError(res, E.BAD_REQUEST, 400, 'Destination folder name already exists.');
        }
        // Check if server is running and renaming the active world
        const isActiveWorld = getActiveWorldName(serverDir) === worldName;
        if (isActiveWorld && processManager.isActive(serverId)) {
            return sendError(res, E.SERVER_ALREADY_RUNNING, 400, 'Cannot rename active world while server is running.');
        }
        await fsp.rename(srcPath, destPath);
        // If we renamed the active world, update server.properties
        if (isActiveWorld) {
            const propPath = path.join(serverDir, 'server.properties');
            if (fs.existsSync(propPath)) {
                let content = await fsp.readFile(propPath, 'utf8');
                content = content.replace(/^level-name\s*=\s*(.+)$/m, `level-name=${newName}`);
                await fsp.writeFile(propPath, content, 'utf8');
            }
        }
        worldCache.delete(parseInt(serverId, 10));
        res.json({ success: true, message: `World folder renamed to ${newName}.` });
    }
    catch (e) {
        logger.error(`[worldRoutes] POST rename world error (Server: ${serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
router.post('/:serverId/worlds/delete', authenticateToken, checkPermission('server.files.write'), async (req, res) => {
    const serverId = req.params.serverId;
    const { worldName } = req.body;
    if (!worldName) {
        return sendError(res, E.BAD_REQUEST, 400, 'Parameter worldName is required.');
    }
    try {
        const server = await getServer(serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const srcPath = path.join(serverDir, worldName);
        if (!fs.existsSync(srcPath)) {
            return sendError(res, E.BAD_REQUEST, 404, 'World folder not found.');
        }
        const isActiveWorld = getActiveWorldName(serverDir) === worldName;
        if (isActiveWorld && processManager.isActive(serverId)) {
            return sendError(res, E.SERVER_ALREADY_RUNNING, 400, 'Cannot delete active world while server is running.');
        }
        await fsp.rm(srcPath, { recursive: true, force: true });
        worldCache.delete(parseInt(serverId, 10));
        res.json({ success: true, message: `World folder ${worldName} deleted.` });
    }
    catch (e) {
        logger.error(`[worldRoutes] POST delete world error (Server: ${serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
router.post('/:serverId/worlds/compress', authenticateToken, checkPermission('server.files.write'), async (req, res) => {
    const serverId = req.params.serverId;
    const { worldName } = req.body;
    if (!worldName)
        return sendError(res, E.BAD_REQUEST, 400, 'Parameter worldName is required.');
    try {
        const server = await getServer(serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const worldPath = path.join(serverDir, worldName);
        if (!fs.existsSync(worldPath)) {
            return sendError(res, E.BAD_REQUEST, 404, 'World folder not found.');
        }
        const numericId = parseInt(serverId, 10);
        const zipPath = path.join(serverDir, `${worldName}.zip`);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 6 } });
        output.on('close', () => {
            worldCache.delete(numericId);
            res.json({ success: true, message: `Compressed world folder to ${worldName}.zip.` });
        });
        archive.on('error', (err) => {
            throw err;
        });
        archive.pipe(output);
        archive.directory(worldPath, false);
        await archive.finalize();
    }
    catch (e) {
        logger.error(`[worldRoutes] POST compress world error (Server: ${serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
router.post('/:serverId/worlds/extract', authenticateToken, checkPermission('server.files.write'), async (req, res) => {
    const serverId = req.params.serverId;
    const { zipName } = req.body;
    if (!zipName)
        return sendError(res, E.BAD_REQUEST, 400, 'Parameter zipName is required.');
    try {
        const server = await getServer(serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const zipPath = path.join(serverDir, zipName);
        if (!fs.existsSync(zipPath)) {
            return sendError(res, E.BAD_REQUEST, 404, 'ZIP file not found.');
        }
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(serverDir, true);
        worldCache.delete(parseInt(serverId, 10));
        res.json({ success: true, message: `Extracted ${zipName} successfully.` });
    }
    catch (e) {
        logger.error(`[worldRoutes] POST extract zip error (Server: ${serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
router.post('/:serverId/worlds/regenerate', authenticateToken, checkPermission('server.settings.write'), async (req, res) => {
    const serverId = req.params.serverId;
    const { difficulty, gamemode, levelSeed, generateStructures, levelType, spawnMonsters, spawnAnimals, spawnNpcs } = req.body;
    try {
        const server = await getServer(serverId);
        if (!server)
            return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const wasRunning = processManager.isActive(serverId);
        // 1. Stop the server if running
        if (wasRunning) {
            if (!processManager.acquireLock(serverId)) {
                return sendError(res, E.SERVER_LOCKED, 409);
            }
            try {
                await processManager.gracefulStop(serverId, 15000);
            }
            finally {
                processManager.releaseLock(serverId);
            }
        }
        // 2. Update server.properties
        const propPath = path.join(serverDir, 'server.properties');
        if (fs.existsSync(propPath)) {
            const raw = await fsp.readFile(propPath, 'utf8');
            const lines = raw.split('\n');
            const propMap = new Map();
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    const idx = trimmed.indexOf('=');
                    const key = trimmed.substring(0, idx).trim();
                    const val = trimmed.substring(idx + 1).trim();
                    propMap.set(key, val);
                }
            }
            if (difficulty)
                propMap.set('difficulty', difficulty);
            if (gamemode)
                propMap.set('gamemode', gamemode);
            if (levelSeed !== undefined)
                propMap.set('level-seed', levelSeed);
            if (generateStructures !== undefined)
                propMap.set('generate-structures', String(generateStructures));
            if (levelType)
                propMap.set('level-type', levelType);
            if (spawnMonsters !== undefined)
                propMap.set('spawn-monsters', String(spawnMonsters));
            if (spawnAnimals !== undefined)
                propMap.set('spawn-animals', String(spawnAnimals));
            if (spawnNpcs !== undefined)
                propMap.set('spawn-npcs', String(spawnNpcs));
            let output = '# updated by MinePanel World Regenerator\n';
            for (const [k, v] of propMap.entries()) {
                output += `${k}=${v}\n`;
            }
            await fsp.writeFile(propPath, output, 'utf8');
        }
        // 3. Resolve and delete the active world folder
        const activeWorld = getActiveWorldName(serverDir);
        const worldPath = path.join(serverDir, activeWorld);
        if (fs.existsSync(worldPath)) {
            await fsp.rm(worldPath, { recursive: true, force: true });
        }
        worldCache.delete(parseInt(serverId, 10));
        // 4. Restart the server if it was running before
        if (wasRunning) {
            const startInfo = getStartInfo(server);
            const isBedrock = !!startInfo.isBedrock;
            const isPocketMine = !!startInfo.isPocketMine;
            if (!processManager.acquireLock(serverId)) {
                logger.error('[worldRoutes] Failed to acquire lock for server restart after regeneration');
            }
            else {
                try {
                    processManager.clearHistory(serverId);
                    if (isBedrock) {
                        processManager.start(serverId, serverDir, [], startInfo.executable, server.ram_mb, [], startInfo.executable, startInfo.env, 'bedrock');
                    }
                    else if (isPocketMine) {
                        processManager.start(serverId, serverDir, [], startInfo.jarFile, server.ram_mb, startInfo.customArgs, startInfo.executable, startInfo.env, 'pocketmine');
                    }
                    else {
                        const javaPath = await javaManager.getJavaPath(server.java_path);
                        processManager.start(serverId, serverDir, [], startInfo.jarFile, server.ram_mb, startInfo.customArgs, javaPath);
                    }
                }
                finally {
                    processManager.releaseLock(serverId);
                }
            }
        }
        res.json({ success: true, message: 'Active world regenerated with new properties. Server is restarting.' });
    }
    catch (e) {
        logger.error(`[worldRoutes] POST regenerate world error (Server: ${serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});
module.exports = router;
//# sourceMappingURL=worldRoutes.js.map