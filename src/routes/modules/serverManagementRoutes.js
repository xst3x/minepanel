const express = require('express');
const { db, dbRun, dbGet, dbAll } = require('../../db/database');
const { authenticateToken } = require('../../core/auth');
const { checkPermission, getEffectivePermissions } = require('../../core/permissions');
const { E, sendError } = require('../../core/errors');
const { validate } = require('../../middleware/validation');
const V = require('../../middleware/validators');
const { resolveJar, downloadJar } = require('../../core/resolvers');
const processManager = require('../../core/processManager');
const executionManager = require('../../core/executionManager');
const { SERVERS_DIR, sanitizeDirName, ensureUniqueDirName, getServer, getServerDir, createBackup, findAvailablePort } = require('../../core/serverHelper');
const bedrockAdapter = require('../../adapters/bedrock');
const pocketmineAdapter = require('../../adapters/pocketmine');
const { retryRename, retryDelete, retryUnlink, retryCopy } = require('../../core/utils/fsRetry');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const StreamZip = require('adm-zip');
const logger = require('../../core/utils/logger');
const { importUpload, runForgeInstaller, runNeoForgeInstaller, buildDefaultStartCommand } = require('./serverHelpers');

const router = express.Router();

// ─── List all servers ─────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
        let servers;
        if (user && user.role === 'admin') {
            servers = await dbAll('SELECT * FROM servers');
        } else {
            servers = await dbAll(`
                SELECT DISTINCT s.* FROM servers s
                LEFT JOIN user_server_permissions p ON s.id = p.server_id AND p.user_id = ?
                LEFT JOIN user_server_ranks ur ON s.id = ur.server_id AND ur.user_id = ?
                WHERE s.owner_id = ? OR p.user_id IS NOT NULL OR ur.user_id IS NOT NULL
            `, [userId, userId, userId]);
        }
        const result = await Promise.all((servers || []).map(async s => ({
            ...s,
            status: await executionManager.getStatus(s.id.toString()),
        })));
        res.json(result);
    } catch (e) {
        logger.error(`[serverRoutes] GET / error (User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Suggest port ──────────────────────────────────────────────────────────
router.get('/suggest-port/:software', authenticateToken, async (req, res) => {
    try {
        const { software } = req.params;
        const basePort = software === 'bedrock' || software === 'bedrock-preview' || software === 'nukkit' || software === 'powernukkit' ? 19132 : 25565;
        const availablePort = await findAvailablePort(basePort, software);
        res.json({ port: availablePort, suggested: true });
    } catch (e) {
        logger.error(`[serverRoutes] GET /suggest-port error:`, e);
        return sendError(res, { error: 'NO_PORT_AVAILABLE', message: 'Could not find available port' }, 503);
    }
});

// ─── Get single server details ─────────────────────────────────────────────
router.get('/:serverId', authenticateToken, async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        server.status = await executionManager.getStatus(server.id.toString());
        res.json(server);
    } catch (e) {
        logger.error(`[serverRoutes] GET /:serverId error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Get user permissions for a server ────────────────────────────────────
router.get('/:serverId/my-permissions', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { serverId } = req.params;
    try {
        const perms = await getEffectivePermissions(userId, serverId);
        const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
        res.json({ admin: user && user.role === 'admin', permissions: perms });
    } catch (e) {
        logger.error(`[serverRoutes] GET /:serverId/my-permissions error (Server: ${serverId}, User: ${userId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Create server (admin only) ────────────────────────────────────────────
router.post('/create', authenticateToken, validate(V.createServer), async (req, res) => {
    const { name, software, version, ram_mb, port } = req.body;
    const userId = req.user.id;

    const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
    if (!user || user.role !== 'admin') {
        return sendError(res, E.FORBIDDEN_ADMIN_ONLY, 403);
    }

    if (!name || !software || !version || !ram_mb || !port) {
        return sendError(res, E.SERVER_FIELDS_REQUIRED, 400);
    }
    if (ram_mb < 512 || ram_mb > 16384) return sendError(res, E.SERVER_RAM_INVALID, 400);
    if (port < 1024 || port > 65535) return sendError(res, E.SERVER_PORT_INVALID, 400);

    try {
        const jarInfo = await resolveJar(software, version);
        const uuid = require('crypto').randomUUID();
        const dirName = await ensureUniqueDirName(sanitizeDirName(name));

        const result = await dbRun(
            'INSERT INTO servers (uuid, name, software, version, ram_mb, port, owner_id, directory_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [uuid, name, software, version, ram_mb, port, userId, dirName]
        );

        const serverId = result.lastID;
        const serverDir = path.join(SERVERS_DIR, dirName);
        fs.mkdirSync(serverDir, { recursive: true });

        processManager.acquireLock(serverId);

        try {
            const finalJarInfo = await downloadJar(jarInfo);
            const softwareLower = software.toLowerCase();

            if (softwareLower === 'bedrock' || softwareLower === 'bedrock-preview') {
                await bedrockAdapter.installBedrock(finalJarInfo.localPath, serverDir, port);
                logger.info(`Bedrock server ${serverId} (${dirName}) setup complete.`);
            } else if (softwareLower === 'pocketmine') {
                await pocketmineAdapter.installPocketMine(finalJarInfo.localPath, serverDir, port);
                logger.info(`PocketMine-MP server ${serverId} (${dirName}) setup complete.`);
            } else if (softwareLower === 'forge') {
                const targetJar = path.join(serverDir, 'server.jar');
                await runForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
                fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n');
                if (!fs.existsSync(path.join(serverDir, 'server.properties'))) {
                    fs.writeFileSync(path.join(serverDir, 'server.properties'), `server-port=${port}\n`);
                }
            } else if (softwareLower === 'neoforge') {
                await runNeoForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
                fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n');
                if (!fs.existsSync(path.join(serverDir, 'server.properties'))) {
                    fs.writeFileSync(path.join(serverDir, 'server.properties'), `server-port=${port}\n`);
                }
            } else {
                const targetJar = path.join(serverDir, 'server.jar');
                fs.copyFileSync(finalJarInfo.localPath, targetJar);
                fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n');
                if (!fs.existsSync(path.join(serverDir, 'server.properties'))) {
                    fs.writeFileSync(path.join(serverDir, 'server.properties'), `server-port=${port}\n`);
                }
            }

            logger.info(`Server ${serverId} (${dirName}) setup complete.`);
            res.json({ message: 'Server deployed successfully', id: serverId, uuid, directory_name: dirName });
        } catch (e) {
            logger.error('Download/Install failed for server', serverId, e);
            try {
                if (fs.existsSync(serverDir)) {
                    fs.rmSync(serverDir, { recursive: true, force: true });
                }
            } catch (rmErr) {
                logger.error(`Failed to clean up directory ${serverDir} after server creation failure:`, rmErr);
            }
            try {
                await dbRun('DELETE FROM servers WHERE id = ?', [serverId]);
            } catch (dbErr) {
                logger.error(`Failed to clean up database record ${serverId} after server creation failure:`, dbErr);
            }
            return sendError(res, E.INTERNAL_ERROR, 500, `Server deployment failed during installation: ${e.message}`);
        } finally {
            processManager.releaseLock(serverId);
        }
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
            if (error.message.includes('servers.name')) {
                return sendError(res, E.SERVER_NAME_TAKEN, 409);
            }
            if (error.message.includes('servers.port')) {
                return sendError(res, E.SERVER_PORT_TAKEN, 409);
            }
        }
        return sendError(res, E.BAD_REQUEST, 400, error.message || null);
    }
});

// ─── Change server version ─────────────────────────────────────────────────
router.post('/:serverId/change-version', authenticateToken, checkPermission('server.properties.write'), validate(V.changeVersion), async (req, res) => {
    const { serverId } = req.params;
    const { version } = req.body;
    if (!version) return sendError(res, E.BAD_REQUEST, 400, 'Version required');

    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        // Spec item 5 — modpack lockout
        if (server.modpack_project_id) {
            return res.status(403).json({ error: 'MODPACK_LOCKED', message: 'Software modifications are strictly locked for curated Modpack environments to prevent server corruption.' });
        }

        if (processManager.getStatus(serverId.toString()) === 'online') {
            return sendError(res, E.SERVER_MUST_BE_STOPPED, 400);
        }

        if (!processManager.acquireLock(serverId)) {
            return sendError(res, E.SERVER_LOCKED, 409);
        }

        try {
            const jarInfo = await resolveJar(server.software, version);
            const finalJarInfo = await downloadJar(jarInfo);
            const serverDir = getServerDir(server);
            const softwareLower = server.software.toLowerCase();

            if (softwareLower === 'bedrock' || softwareLower === 'bedrock-preview') {
                await bedrockAdapter.installBedrock(finalJarInfo.localPath, serverDir, server.port);
            } else if (softwareLower === 'pocketmine') {
                await pocketmineAdapter.installPocketMine(finalJarInfo.localPath, serverDir, server.port);
            } else {
                const targetJar = path.join(serverDir, 'server.jar');
                try { await retryUnlink(targetJar); } catch (_) {}
                if (softwareLower === 'forge') {
                    await runForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
                } else if (softwareLower === 'neoforge') {
                    await runNeoForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
                } else {
                    await retryCopy(finalJarInfo.localPath, targetJar);
                }
            }

            await dbRun('UPDATE servers SET version = ? WHERE id = ?', [version, serverId]);
            logger.info(`Server ${serverId} updated to version ${version}`);
            res.json({ message: `Version changed to ${version} successfully.` });
        } finally {
            processManager.releaseLock(serverId);
        }
    } catch (e) {
        logger.error(`[serverRoutes] Change version error (Server: ${serverId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});

// ─── Switch server software ────────────────────────────────────────────────
router.post('/:serverId/switch-software', authenticateToken, checkPermission('server.properties.write'), validate(V.switchSoftware), async (req, res) => {
    const { serverId } = req.params;
    const { software, version, confirm } = req.body;

    if (!software || !version) {
        return sendError(res, E.BAD_REQUEST, 400, 'Software and version are required');
    }

    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        // Spec item 5 — modpack lockout
        if (server.modpack_project_id) {
            return res.status(403).json({ error: 'MODPACK_LOCKED', message: 'Software modifications are strictly locked for curated Modpack environments to prevent server corruption.' });
        }

        if (processManager.getStatus(serverId.toString()) === 'online') {
            return sendError(res, E.SERVER_MUST_BE_STOPPED, 400);
        }

        const exited = await processManager.waitForExit(serverId.toString(), 3000);
        if (!exited && processManager.getStatus(serverId.toString()) === 'online') {
            return sendError(res, E.SERVER_MUST_BE_STOPPED, 400);
        }

        const oldType = server.software.toLowerCase();
        const newType = software.toLowerCase();

        const isModded = (t) => ['fabric', 'forge', 'neoforge', 'quilt', 'magma', 'mohist', 'arclight', 'spongevanilla'].includes(t);
        const isPluginBased = (t) => ['paper', 'purpur', 'folia', 'leaves', 'pufferfish', 'magma', 'mohist', 'arclight', 'waterfall', 'velocity'].includes(t);

        const warnings = [];
        if (oldType !== newType) {
            warnings.push(`Switching engine from ${server.software} to ${software}.`);
            if (isModded(oldType) && !isModded(newType)) {
                warnings.push("Any installed Mods will be deactivated (renamed to 'mods.disabled').");
            }
            if (!isModded(oldType) && isModded(newType)) {
                warnings.push("Any installed Plugins will be deactivated (renamed to 'plugins.disabled').");
            }
            if (isModded(oldType) && isModded(newType) && oldType !== newType) {
                warnings.push(`Mods from ${server.software} may not be compatible with ${software}. Review your mods folder after switching.`);
            }
        }

        if (!confirm) {
            return res.json({
                compatible: warnings.length === 0,
                warnings: warnings,
                requiresBackup: true,
                message: "Compatibility pre-check complete."
            });
        }

        if (!processManager.acquireLock(serverId)) {
            return sendError(res, E.SERVER_LOCKED, 409);
        }

        let backupInfo;
        try {
            const jarInfo = await resolveJar(software, version);
            const serverDir = getServerDir(server);

            try {
                backupInfo = await createBackup(serverDir, `autoswitch-${oldType}-to-${newType}`);
                logger.info(`Automatic rollback backup created: ${backupInfo.filename}`);
            } catch (backupErr) {
                return sendError(res, E.BACKUP_FAILED, 500, `Automatic backup failed: ${backupErr.message}. Switch aborted.`);
            }

            if (oldType !== newType) {
                if (isModded(oldType) && !isModded(newType)) {
                    const modsPath = path.join(serverDir, 'mods');
                    const disabledMods = path.join(serverDir, 'mods.disabled');
                    if (fs.existsSync(modsPath)) {
                        try {
                            if (fs.existsSync(disabledMods)) await retryDelete(disabledMods);
                            await retryRename(modsPath, disabledMods);
                        } catch (err) {
                            return sendError(res, E.INTERNAL_ERROR, 500, `Failed to deactivate mods folder: ${err.message}. Ensure no files are open.`);
                        }
                    }
                    const disabledPlugins = path.join(serverDir, 'plugins.disabled');
                    const pluginsPath = path.join(serverDir, 'plugins');
                    if (fs.existsSync(disabledPlugins) && !fs.existsSync(pluginsPath)) {
                        try { await retryRename(disabledPlugins, pluginsPath); } catch (_) {}
                    }
                }

                if (isPluginBased(oldType) && !isPluginBased(newType) && isModded(newType)) {
                    const pluginsPath = path.join(serverDir, 'plugins');
                    const disabledPlugins = path.join(serverDir, 'plugins.disabled');
                    if (fs.existsSync(pluginsPath)) {
                        try {
                            if (fs.existsSync(disabledPlugins)) await retryDelete(disabledPlugins);
                            await retryRename(pluginsPath, disabledPlugins);
                        } catch (err) {
                            return sendError(res, E.INTERNAL_ERROR, 500, `Failed to deactivate plugins folder: ${err.message}. Ensure no files are open.`);
                        }
                    }
                    const disabledMods = path.join(serverDir, 'mods.disabled');
                    const modsPath = path.join(serverDir, 'mods');
                    if (fs.existsSync(disabledMods) && !fs.existsSync(modsPath)) {
                        try { await retryRename(disabledMods, modsPath); } catch (_) {}
                    }
                }
            }

            const finalJarInfo = await downloadJar(jarInfo);

            if (newType === 'bedrock' || newType === 'bedrock-preview') {
                await bedrockAdapter.installBedrock(finalJarInfo.localPath, serverDir, server.port);
            } else if (newType === 'pocketmine') {
                await pocketmineAdapter.installPocketMine(finalJarInfo.localPath, serverDir, server.port);
            } else {
                const targetJar = path.join(serverDir, 'server.jar');
                try { await retryUnlink(targetJar); } catch (_) {}
                if (newType === 'forge') {
                    await runForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
                } else if (newType === 'neoforge') {
                    await runNeoForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
                } else {
                    await retryCopy(finalJarInfo.localPath, targetJar);
                }
            }

            await dbRun('UPDATE servers SET software = ?, version = ? WHERE id = ?', [software, version, serverId]);
            logger.info(`Server ${serverId} software switched successfully to ${software} ${version}`);

            res.json({
                message: `Software switched to ${software} ${version} successfully.`,
                backupCreated: backupInfo.filename
            });
        } finally {
            processManager.releaseLock(serverId);
        }
    } catch (e) {
        logger.error(`[serverRoutes] Switch software error (Server: ${serverId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});

// ─── Get backup config ─────────────────────────────────────────────────────
router.get('/:serverId/backup-config', authenticateToken, checkPermission('server.backups.read'), async (req, res) => {
    try {
        const row = await dbGet('SELECT auto_backup, backup_interval, backup_includes FROM servers WHERE id = ?', [req.params.serverId]);
        if (!row) return sendError(res, E.SERVER_NOT_FOUND, 404);
        res.json(row);
    } catch (e) {
        logger.error(`[serverRoutes] GET backup-config error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Update backup config ──────────────────────────────────────────────────
router.post('/:serverId/backup-config', authenticateToken, checkPermission('server.backups.create'), validate(V.backupConfig), (req, res) => {
    const { serverId } = req.params;
    const { enabled, interval, includes } = req.body;
    db.run(
        'UPDATE servers SET auto_backup = ?, backup_interval = ?, backup_includes = ? WHERE id = ?',
        [enabled ? 1 : 0, interval || 24, includes || 'all', serverId],
        function(err) {
            if (err) {
                logger.error(`[serverRoutes] POST backup-config error (Server: ${serverId}, User: ${req.user.id}):`, err);
                return sendError(res, E.INTERNAL_ERROR, 500);
            }
            if (this.changes === 0) return sendError(res, E.SERVER_NOT_FOUND, 404);
            res.json({ message: 'Backup configuration saved' });
        }
    );
});

// ─── Get auto-generated start command ────────────────────────────────────
router.get('/:serverId/start-command', authenticateToken, checkPermission('server.properties.write'), async (req, res) => {
    const { serverId } = req.params;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        const serverDir = getServerDir(server);
        const javaPath = server.java_path || 'java';
        const autoCommand = buildDefaultStartCommand(server, serverDir, javaPath);

        res.json({
            auto_command: autoCommand,
            custom_command: server.custom_start_command || null,
        });
    } catch (e) {
        logger.error(`[serverRoutes] GET start-command error (Server: ${serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Save custom start command ────────────────────────────────────────────
router.patch('/:serverId/start-command', authenticateToken, checkPermission('server.properties.write'), async (req, res) => {
    const { serverId } = req.params;
    const { custom_command } = req.body;

    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        // null / empty string = revert to auto
        const value = (custom_command && custom_command.trim()) ? custom_command.trim() : null;
        await dbRun('UPDATE servers SET custom_start_command = ? WHERE id = ?', [value, serverId]);

        res.json({
            message: value ? 'Custom start command saved.' : 'Reverted to auto-generated start command.',
            custom_command: value,
        });
    } catch (e) {
        logger.error(`[serverRoutes] PATCH start-command error (Server: ${serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Delete server ─────────────────────────────────────────────────────────
router.delete('/:serverId', authenticateToken, checkPermission('account.manage'), async (req, res) => {
    const { serverId } = req.params;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        if (!processManager.acquireLock(serverId.toString())) {
            return sendError(res, E.SERVER_LOCKED, 409);
        }

        try {
            if (processManager.getStatus(serverId.toString()) === 'online') {
                processManager.kill(serverId.toString());
                processManager.clearHistory(serverId.toString());
            }

            try {
                const discordManager = require('../../core/discord/discordManager');
                await discordManager.disconnect(serverId);
            } catch (_) {}

            await dbRun('DELETE FROM user_server_ranks WHERE server_id = ?', [serverId]);
            await dbRun('DELETE FROM user_server_permissions WHERE server_id = ?', [serverId]);
            await dbRun('DELETE FROM servers WHERE id = ?', [serverId]);

            const serverDir = getServerDir(server);
            if (fs.existsSync(serverDir)) {
                fs.rmSync(serverDir, { recursive: true, force: true });
            }

            logger.info(`Server ${serverId} (${server.name}) has been permanently deleted by user ${req.user.id}`);
            res.json({ message: 'Server deleted successfully' });
        } finally {
            processManager.releaseLock(serverId.toString());
        }
    } catch (e) {
        logger.error('Error deleting server:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Import server from zip ────────────────────────────────────────────────
router.post('/import', authenticateToken, importUpload.single('archive'), async (req, res) => {
    const userId = req.user.id;
    const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
    if (!user || user.role !== 'admin') {
        if (req.file) fsp.unlink(req.file.path).catch(() => {});
        return sendError(res, E.FORBIDDEN_ADMIN_ONLY, 403);
    }

    if (!req.file) return sendError(res, E.BAD_REQUEST, 400, 'No archive uploaded');

    const { name, software: rawSoftware, version, ram_mb, port, jar_path, root_path } = req.body;
    const software = (rawSoftware || '').trim().toLowerCase();
    if (!name || !software || !version || !ram_mb || !port || !jar_path) {
        fsp.unlink(req.file.path).catch(() => {});
        return sendError(res, E.BAD_REQUEST, 400, 'Missing required fields: name, software, version, ram_mb, port, jar_path');
    }

    const ramNum = parseInt(ram_mb, 10);
    const portNum = parseInt(port, 10);
    if (ramNum < 512 || ramNum > 16384) { fsp.unlink(req.file.path).catch(() => {}); return sendError(res, E.SERVER_RAM_INVALID, 400); }
    if (portNum < 1024 || portNum > 65535) { fsp.unlink(req.file.path).catch(() => {}); return sendError(res, E.SERVER_PORT_INVALID, 400); }

    const normJar  = jar_path.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    const normRoot = (root_path || '').replace(/^[/\\]+/, '').replace(/\\/g, '/').replace(/\/+$/, '');

    const zipPath = req.file.path;
    let serverId = null;
    let serverDir = null;

    try {
        const uuid = require('crypto').randomUUID();
        const dirName = await ensureUniqueDirName(sanitizeDirName(name));
        serverDir = path.join(SERVERS_DIR, dirName);

        const result = await dbRun(
            'INSERT INTO servers (uuid, name, software, version, ram_mb, port, owner_id, directory_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [uuid, name, software, version, ramNum, portNum, userId, dirName]
        );
        serverId = result.lastID;

        await fsp.mkdir(serverDir, { recursive: true });
        processManager.acquireLock(serverId);

        try {
            const zip = new StreamZip(zipPath);
            const entries = zip.getEntries();
            const prefix = normRoot ? normRoot + '/' : '';
            const toExtract = entries.filter(e => {
                if (prefix) {
                    return e.entryName.startsWith(prefix) && e.entryName !== prefix;
                }
                return true;
            });

            if (toExtract.length === 0) {
                throw new Error(`No files found under path "${normRoot}" inside the zip. Check the Server Root Path.`);
            }

            for (const entry of toExtract) {
                const relativeName = prefix ? entry.entryName.slice(prefix.length) : entry.entryName;
                if (!relativeName) continue;
                const destPath = path.join(serverDir, relativeName.replace(/\//g, path.sep));
                if (entry.isDirectory) {
                    await fsp.mkdir(destPath, { recursive: true });
                } else {
                    await fsp.mkdir(path.dirname(destPath), { recursive: true });
                    const data = zip.readFile(entry);
                    if (data) await fsp.writeFile(destPath, data);
                }
            }
            zip.close ? zip.close() : undefined;

            const jarAbsPath = path.join(serverDir, normJar.replace(/\//g, path.sep));
            try {
                await fsp.access(jarAbsPath);
            } catch {
                throw new Error(`Jar not found at "${normJar}" inside the extracted archive. Check the Executable Path.`);
            }

            const stdJar = path.join(serverDir, 'server.jar');
            if (path.resolve(jarAbsPath) !== path.resolve(stdJar)) {
                await retryCopy(jarAbsPath, stdJar);
            }

            const eulaPath = path.join(serverDir, 'eula.txt');
            try { await fsp.access(eulaPath); } catch {
                await fsp.writeFile(eulaPath, 'eula=true\n');
            }

            const propsPath = path.join(serverDir, 'server.properties');
            try {
                await fsp.access(propsPath);
                let content = await fsp.readFile(propsPath, 'utf8');
                if (/^server-port=/m.test(content)) {
                    content = content.replace(/^server-port=.*/m, `server-port=${portNum}`);
                } else {
                    content += `\nserver-port=${portNum}\n`;
                }
                await fsp.writeFile(propsPath, content);
            } catch {
                await fsp.writeFile(propsPath, `server-port=${portNum}\n`);
            }

            logger.info(`Server import complete: ${serverId} (${dirName})`);
            res.json({ message: 'Server imported successfully', id: serverId, uuid, directory_name: dirName });
        } finally {
            processManager.releaseLock(serverId);
            fsp.unlink(zipPath).catch(() => {});
        }
    } catch (e) {
        if (serverId) {
            try { await dbRun('DELETE FROM servers WHERE id = ?', [serverId]); } catch (_) {}
        }
        if (serverDir) {
            try { if (fs.existsSync(serverDir)) fs.rmSync(serverDir, { recursive: true, force: true }); } catch (_) {}
        }
        fsp.unlink(zipPath).catch(() => {});

        logger.error('[serverRoutes] Import error:', e);
        if (e.code === 'SQLITE_CONSTRAINT') {
            if (e.message.includes('servers.name')) return sendError(res, E.SERVER_NAME_TAKEN, 409);
            if (e.message.includes('servers.port')) return sendError(res, E.SERVER_PORT_TAKEN, 409);
        }
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});

// ─── Update advanced server settings ───────────────────────────────────────
router.post('/:serverId/settings', authenticateToken, checkPermission('server.properties.write'), validate(V.serverSettings), async (req, res) => {
    const { serverId } = req.params;
    const { name, port, ram_mb, java_path, log_retention_days, backup_retention_days, autostart, autostart_on_crash } = req.body;

    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        if (!name) return sendError(res, E.BAD_REQUEST, 400, 'Server name is required');
        const portNum = parseInt(port, 10);
        if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
            return sendError(res, E.SERVER_PORT_INVALID, 400);
        }
        const ramNum = parseInt(ram_mb, 10);
        if (isNaN(ramNum) || ramNum < 512 || ramNum > 16384) {
            return sendError(res, E.SERVER_RAM_INVALID, 400);
        }
        const logRet = parseInt(log_retention_days, 10);
        if (isNaN(logRet) || logRet < 0) {
            return sendError(res, E.BAD_REQUEST, 400, 'Log retention must be a non-negative number');
        }
        const backupRet = parseInt(backup_retention_days, 10);
        if (isNaN(backupRet) || backupRet < 0) {
            return sendError(res, E.BAD_REQUEST, 400, 'Backup retention must be a non-negative number');
        }
        const javaPathStr = (java_path || 'java').trim();
        if (!javaPathStr) {
            return sendError(res, E.SERVER_JAVA_PATH_INVALID, 400);
        }
        if (!/^(java|java\.exe|([A-Za-z]:)?[/\\][^\0]+[/\\]java(\.exe)?)$/.test(javaPathStr)) {
            return sendError(res, E.SERVER_JAVA_PATH_INVALID, 400);
        }

        const isOnline = processManager.getStatus(serverId.toString()) === 'online';
        const isRamChanged = Number(server.ram_mb) !== ramNum;
        const isPortChanged = Number(server.port) !== portNum;
        const isJavaChanged = server.java_path !== javaPathStr;

        if (isOnline && (isRamChanged || isPortChanged || isJavaChanged)) {
            return sendError(res, E.SERVER_MUST_BE_STOPPED, 400);
        }

        if (isPortChanged) {
            const conflict = await dbGet('SELECT id FROM servers WHERE port = ? AND id != ?', [portNum, serverId]);
            if (conflict) {
                return sendError(res, E.SERVER_PORT_TAKEN, 409);
            }
        }

        await dbRun(
            `UPDATE servers SET 
                name = ?, 
                port = ?, 
                ram_mb = ?, 
                java_path = ?, 
                log_retention_days = ?, 
                backup_retention_days = ?,
                autostart = ?,
                autostart_on_crash = ?
             WHERE id = ?`,
            [name, portNum, ramNum, javaPathStr, logRet, backupRet,
             autostart ? 1 : 0, autostart_on_crash ? 1 : 0, serverId]
        );

        if (isPortChanged) {
            const serverDir = getServerDir(server);
            const propsPath = path.join(serverDir, 'server.properties');
            try {
                if (fs.existsSync(propsPath)) {
                    let content = fs.readFileSync(propsPath, 'utf8');
                    if (/^server-port=/m.test(content)) {
                        content = content.replace(/^server-port=.*/m, `server-port=${portNum}`);
                    } else {
                        content += `\nserver-port=${portNum}\n`;
                    }
                    if (/^query\.port=/m.test(content)) {
                        content = content.replace(/^query\.port=.*/m, `query.port=${portNum}`);
                    }
                    fs.writeFileSync(propsPath, content);
                    logger.info(`[Settings] Updated server-port in server.properties to ${portNum} for server ${serverId}`);
                }
            } catch (err) {
                logger.error(`[Settings] Failed to update server.properties for server ${serverId}:`, err.message);
            }
        }

        try {
            const discordManager = require('../../core/discord/discordManager');
            discordManager.getStatusForServer(serverId).then((status) => {
                if (status && status.connected) {
                    discordManager.reprovision(serverId).catch((err) => {
                        logger.error(`[Settings] Failed to reprovision Discord in background for server ${serverId}:`, err.message);
                    });
                }
            }).catch(() => {});
        } catch (err) {
            logger.error(`[Settings] Discord manager error during settings save:`, err.message);
        }

        res.json({ message: 'Settings saved successfully' });
    } catch (e) {
        logger.error(`[serverRoutes] Update settings error (Server: ${serverId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});

module.exports = router;
