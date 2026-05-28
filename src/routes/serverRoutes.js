const express = require('express');
const { db, dbRun, dbGet, dbAll } = require('../db/database');
const { authenticateToken } = require('../core/auth');
const { checkPermission, getEffectivePermissions } = require('../core/permissions');
const { resolveJar, downloadJar } = require('../core/resolvers');
const processManager = require('../core/processManager');
const { SERVERS_DIR, sanitizeDirName, ensureUniqueDirName, getServer, getServerDir, createBackup } = require('../core/serverHelper');
const { retryRename, retryDelete, retryUnlink, retryCopy } = require('../core/utils/fsRetry');
const { startServerFtp, stopServerFtp, isServerFtpRunning } = require('../core/ftpServer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const multer = require('multer');
const os = require('os');
const StreamZip = require('adm-zip');

// Multer — store uploaded zip in OS temp dir
const importUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, os.tmpdir()),
        filename: (_req, file, cb) => {
            const rand = require('crypto').randomBytes(8).toString('hex');
            cb(null, `minepanel-import-${rand}.zip`);
        }
    }),
    limits: { fileSize: Infinity }, // no size cap — servers can be 20GB+
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'application/zip' ||
            file.mimetype === 'application/x-zip-compressed' ||
            file.originalname.toLowerCase().endsWith('.zip')) {
            cb(null, true);
        } else {
            cb(new Error('Only .zip files are accepted for server import'));
        }
    }
});

const router = express.Router();

function getStartInfo(server) {
    const serverDir = getServerDir(server);
    const jarFile = path.join(serverDir, 'server.jar');
    
    let customArgs = null;
    try {
        if (server.software === 'forge') {
            const isWin = process.platform === 'win32';
            const runScript = path.join(serverDir, isWin ? 'run.bat' : 'run.sh');
            if (fs.existsSync(runScript)) {
                const content = fs.readFileSync(runScript, 'utf8');
                const lines = content.split('\n');
                for (const line of lines) {
                    if (line.trim().startsWith('java ')) {
                        // Extract arguments between "java" and "%*" or '"$@"'
                        let argsStr = line.trim().substring(5);
                        argsStr = argsStr.replace(/%\*/g, '').replace(/"\$@"/g, '').replace(/\$@/g, '').trim();
                        if (argsStr.includes('@user_jvm_args.txt') || argsStr.includes('libraries/')) {
                            // Split by space but preserve paths if they had spaces (usually they don't in forge)
                            customArgs = argsStr.split(/\s+/).filter(a => a.length > 0);
                            break;
                        }
                    }
                }
            }
        }
    } catch (_) {}

    return { serverDir, jarFile, customArgs };
}

// ─── List all servers ────────────────────────────────────────────────────────
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
        const result = (servers || []).map(s => ({
            ...s,
            status: processManager.getStatus(s.id.toString())
        }));
        res.json(result);
    } catch (e) {
        console.error(`[serverRoutes] GET / error (User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to list servers' });
    }
});

// ─── Get single server details ───────────────────────────────────────────────
router.get('/:serverId', authenticateToken, async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        server.status = processManager.getStatus(server.id.toString());
        res.json(server);
    } catch (e) {
        console.error(`[serverRoutes] GET /:serverId error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to retrieve server details' });
    }
});

// ─── Get current user's permissions for a server ─────────────────────────────
router.get('/:serverId/my-permissions', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { serverId } = req.params;
    try {
        const perms = await getEffectivePermissions(userId, serverId);
        const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
        res.json({ admin: user && user.role === 'admin', permissions: perms });
    } catch (e) {
        console.error(`[serverRoutes] GET /:serverId/my-permissions error (Server: ${serverId}, User: ${userId}):`, e);
        res.status(500).json({ error: 'Database error' });
    }
});


// ─── Create a server (admin only) ────────────────────────────────────────────
router.post('/create', authenticateToken, async (req, res) => {
    const { name, software, version, ram_mb, port } = req.body;
    const userId = req.user.id;

    const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Only administrators can create servers' });
    }

    if (!name || !software || !version || !ram_mb || !port) {
        return res.status(400).json({ error: 'All fields required: name, software, version, ram_mb, port' });
    }
    if (ram_mb < 512 || ram_mb > 16384) return res.status(400).json({ error: 'RAM must be 512-16384 MB' });
    if (port < 1024 || port > 65535) return res.status(400).json({ error: 'Port must be 1024-65535' });

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

        // Lock during installation to avoid any lifecycle interference
        processManager.acquireLock(serverId);

        try {
            const finalJarInfo = await downloadJar(jarInfo);
            const targetJar = path.join(serverDir, 'server.jar');
            const softwareLower = software.toLowerCase();

            if (softwareLower === 'forge') {
                await runForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
            } else {
                fs.copyFileSync(finalJarInfo.localPath, targetJar);
            }

            fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n');
            if (!fs.existsSync(path.join(serverDir, 'server.properties'))) {
                fs.writeFileSync(path.join(serverDir, 'server.properties'), `server-port=${port}\n`);
            }
            console.log(`Server ${serverId} (${dirName}) setup complete.`);
            res.json({ message: 'Server deployed successfully', id: serverId, uuid, directory_name: dirName });
        } catch (e) {
            console.error('Download/Install failed for server', serverId, e);
            try {
                if (fs.existsSync(serverDir)) {
                    fs.rmSync(serverDir, { recursive: true, force: true });
                }
            } catch (rmErr) {
                console.error(`Failed to clean up directory ${serverDir} after server creation failure:`, rmErr);
            }
            try {
                await dbRun('DELETE FROM servers WHERE id = ?', [serverId]);
            } catch (dbErr) {
                console.error(`Failed to clean up database record ${serverId} after server creation failure:`, dbErr);
            }
            res.status(500).json({ error: `Server deployment failed during installation: ${e.message}` });
        } finally {
            processManager.releaseLock(serverId);
        }
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
            if (error.message.includes('servers.name')) {
                return res.status(400).json({ error: 'A server with this name already exists. Please choose a different name.' });
            }
            if (error.message.includes('servers.port')) {
                return res.status(400).json({ error: 'This port is already in use by another server.' });
            }
        }
        res.status(400).json({ error: error.message || 'An error occurred during server creation.' });
    }
});

// ─── Change server version ───────────────────────────────────────────────────
router.post('/:serverId/change-version', authenticateToken, checkPermission('server.properties.write'), async (req, res) => {
    const { serverId } = req.params;
    const { version } = req.body;
    if (!version) return res.status(400).json({ error: 'Version required' });

    try {
        const server = await getServer(serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        if (processManager.getStatus(serverId.toString()) === 'online') {
            return res.status(400).json({ error: 'Stop the server before changing version' });
        }

        if (!processManager.acquireLock(serverId)) {
            return res.status(409).json({ error: 'Another lifecycle action is in progress for this server.' });
        }

        try {
            const jarInfo = await resolveJar(server.software, version);
            const finalJarInfo = await downloadJar(jarInfo);

            const serverDir = getServerDir(server);
            const targetJar = path.join(serverDir, 'server.jar');
            try { await retryUnlink(targetJar); } catch (_) {}
            
            if (server.software.toLowerCase() === 'forge') {
                await runForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
            } else {
                await retryCopy(finalJarInfo.localPath, targetJar);
            }

            await dbRun('UPDATE servers SET version = ? WHERE id = ?', [version, serverId]);
            console.log(`Server ${serverId} updated to version ${version}`);
            res.json({ message: `Version changed to ${version} successfully.` });
        } finally {
            processManager.releaseLock(serverId);
        }
    } catch (e) {
        console.error(`[serverRoutes] Change version error (Server: ${serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: e.message || 'Failed to change server version' });
    }
});

// ─── Switch server software (e.g. Paper -> Fabric) ──────────────────────────
router.post('/:serverId/switch-software', authenticateToken, checkPermission('server.properties.write'), async (req, res) => {
    const { serverId } = req.params;
    const { software, version, confirm } = req.body;

    if (!software || !version) {
        return res.status(400).json({ error: 'Software and version are required' });
    }

    try {
        const server = await getServer(serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        // CRITICAL: Ensure the server process is fully stopped before modifying files
        if (processManager.getStatus(serverId.toString()) === 'online') {
            return res.status(400).json({ error: 'Stop the server before switching software. Wait for the process to fully exit.' });
        }

        // Double-check: wait for any lingering process exit
        const exited = await processManager.waitForExit(serverId.toString(), 3000);
        if (!exited && processManager.getStatus(serverId.toString()) === 'online') {
            return res.status(400).json({ error: 'Server process is still running. Please wait for it to fully stop.' });
        }

        const oldType = server.software.toLowerCase();
        const newType = software.toLowerCase();

        // Determine engine categories
        const isModded = (t) => ['fabric', 'forge', 'quilt', 'magma'].includes(t);
        const isPluginBased = (t) => ['paper', 'purpur', 'magma'].includes(t);

        // Check compatibility warnings
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

        // Pre-check mode: return warnings without executing
        if (!confirm) {
            return res.json({
                compatible: warnings.length === 0,
                warnings: warnings,
                requiresBackup: true,
                message: "Compatibility pre-check complete."
            });
        }

        if (!processManager.acquireLock(serverId)) {
            return res.status(409).json({ error: 'Another lifecycle action is in progress for this server.' });
        }

        let backupInfo;
        try {
            // 1. Resolve first to ensure it is a valid target build
            const jarInfo = await resolveJar(software, version);
            const serverDir = getServerDir(server);

            // 2. Perform Automatic Backup before switching
            try {
                backupInfo = await createBackup(serverDir, `autoswitch-${oldType}-to-${newType}`);
                console.log(`Automatic rollback backup created: ${backupInfo.filename}`);
            } catch (backupErr) {
                return res.status(500).json({ error: `Automatic backup failed: ${backupErr.message}. Switch aborted.` });
            }

            // 3. Migrate folders/deactivate incompatibilities with retry logic
            if (oldType !== newType) {
                // Deactivate mods if switching away from modded
                if (isModded(oldType) && !isModded(newType)) {
                    const modsPath = path.join(serverDir, 'mods');
                    const disabledMods = path.join(serverDir, 'mods.disabled');
                    if (fs.existsSync(modsPath)) {
                        try {
                            if (fs.existsSync(disabledMods)) await retryDelete(disabledMods);
                            await retryRename(modsPath, disabledMods);
                        } catch (err) {
                            return res.status(500).json({ error: `Failed to deactivate mods folder: ${err.message}. Ensure no files are open.` });
                        }
                    }
                    // Re-enable plugins if they were disabled
                    const disabledPlugins = path.join(serverDir, 'plugins.disabled');
                    const pluginsPath = path.join(serverDir, 'plugins');
                    if (fs.existsSync(disabledPlugins) && !fs.existsSync(pluginsPath)) {
                        try { await retryRename(disabledPlugins, pluginsPath); } catch (_) {}
                    }
                }

                // Deactivate plugins if switching away from plugin-based to pure modded
                if (isPluginBased(oldType) && !isPluginBased(newType) && isModded(newType)) {
                    const pluginsPath = path.join(serverDir, 'plugins');
                    const disabledPlugins = path.join(serverDir, 'plugins.disabled');
                    if (fs.existsSync(pluginsPath)) {
                        try {
                            if (fs.existsSync(disabledPlugins)) await retryDelete(disabledPlugins);
                            await retryRename(pluginsPath, disabledPlugins);
                        } catch (err) {
                            return res.status(500).json({ error: `Failed to deactivate plugins folder: ${err.message}. Ensure no files are open.` });
                        }
                    }
                    // Re-enable mods if they were disabled
                    const disabledMods = path.join(serverDir, 'mods.disabled');
                    const modsPath = path.join(serverDir, 'mods');
                    if (fs.existsSync(disabledMods) && !fs.existsSync(modsPath)) {
                        try { await retryRename(disabledMods, modsPath); } catch (_) {}
                    }
                }
            }

            // 4. Download and overwrite the jar synchronously
            const finalJarInfo = await downloadJar(jarInfo);
            const targetJar = path.join(serverDir, 'server.jar');
            try { await retryUnlink(targetJar); } catch (_) {}

            if (newType === 'forge') {
                await runForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
            } else {
                await retryCopy(finalJarInfo.localPath, targetJar);
            }

            // 5. Update software & version in DB
            await dbRun('UPDATE servers SET software = ?, version = ? WHERE id = ?', [software, version, serverId]);

            console.log(`Server ${serverId} software switched successfully to ${software} ${version}`);

            res.json({
                message: `Software switched to ${software} ${version} successfully.`,
                backupCreated: backupInfo.filename
            });
        } finally {
            processManager.releaseLock(serverId);
        }
    } catch (e) {
        console.error(`[serverRoutes] Switch software error (Server: ${serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: e.message || 'Failed to switch server software' });
    }
});

// ─── Start server ────────────────────────────────────────────────────────────
router.post('/:serverId/start', authenticateToken, checkPermission('server.start'), async (req, res) => {
    const serverId = req.params.serverId;
    try {
        const server = await getServer(serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        const { serverDir, jarFile, customArgs } = getStartInfo(server);

        if (!fs.existsSync(jarFile) && !customArgs) {
            return res.status(400).json({ error: 'Server jar not found. May still be downloading.' });
        }

        if (!processManager.acquireLock(serverId)) {
            return res.status(409).json({ error: 'Another lifecycle action is in progress for this server.' });
        }

        try {
            // Clear console history for a fresh view
            processManager.clearHistory(serverId.toString());

            processManager.start(serverId.toString(), serverDir, [], jarFile, server.ram_mb, customArgs, server.java_path || 'java');
            res.json({ message: 'Server starting' });
        } finally {
            processManager.releaseLock(serverId);
        }
    } catch (e) {
        console.error(`[serverRoutes] Start error (Server: ${serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: e.message || 'Failed to start server' });
    }
});

// ─── Stop server (graceful: sends /stop to stdin) ────────────────────────────
router.post('/:serverId/stop', authenticateToken, checkPermission('server.stop'), async (req, res) => {
    const serverId = req.params.serverId;
    try {
        const server = await getServer(serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        if (!processManager.acquireLock(serverId.toString())) {
            return res.status(409).json({ error: 'Another lifecycle action is in progress for this server.' });
        }

        try {
            const result = await processManager.gracefulStop(serverId.toString(), 15000);

            if (!result.wasRunning) {
                return res.json({ message: 'Server was not running', graceful: true });
            }
            if (result.graceful) {
                // Clear history after stop for clean restart
                processManager.clearHistory(serverId.toString());
                return res.json({ message: 'Server stopped gracefully', graceful: true });
            } else {
                return res.json({
                    message: 'Stop command sent but server has not exited yet. You can use Kill to force terminate.',
                    graceful: false
                });
            }
        } finally {
            processManager.releaseLock(serverId.toString());
        }
    } catch (e) {
        console.error(`[serverRoutes] Stop error (Server: ${serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to stop server' });
    }
});

// ─── Restart server (graceful stop then start) ───────────────────────────────
router.post('/:serverId/restart', authenticateToken, checkPermission('server.restart'), async (req, res) => {
    const serverId = req.params.serverId;
    try {
        const server = await getServer(serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        const { serverDir, jarFile, customArgs } = getStartInfo(server);

        if (!fs.existsSync(jarFile) && !customArgs) {
            return res.status(400).json({ error: 'Server jar not found.' });
        }

        if (!processManager.acquireLock(serverId)) {
            return res.status(409).json({ error: 'Another lifecycle action is in progress for this server.' });
        }

        try {
            // Clear console history for the fresh restart
            processManager.clearHistory(serverId.toString());

            const result = await processManager.restartGraceful(
                serverId.toString(), serverDir, [], jarFile, server.ram_mb, 15000, customArgs, server.java_path || 'java'
            );

            if (!result.graceful) {
                return res.json({
                    message: result.message || 'Server did not stop within timeout. Use Kill to force terminate, then start manually.',
                    graceful: false,
                    started: false
                });
            }

            res.json({
                message: result.started ? 'Server restarted successfully' : `Restart failed: ${result.message}`,
                graceful: true,
                started: result.started
            });
        } finally {
            processManager.releaseLock(serverId);
        }
    } catch (e) {
        console.error(`[serverRoutes] Restart error (Server: ${serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: e.message || 'Failed to restart server' });
    }
});

// ─── Kill server (force terminate specific PID only) ─────────────────────────
router.post('/:serverId/kill', authenticateToken, checkPermission('server.kill'), async (req, res) => {
    const serverId = req.params.serverId;
    try {
        const server = await getServer(serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        if (!processManager.acquireLock(serverId.toString())) {
            return res.status(409).json({ error: 'Another lifecycle action is in progress for this server.' });
        }

        try {
            processManager.kill(serverId.toString());
            processManager.clearHistory(serverId.toString());
            res.json({ message: 'Server process force-killed' });
        } finally {
            processManager.releaseLock(serverId.toString());
        }
    } catch (e) {
        console.error(`[serverRoutes] Kill error (Server: ${serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to force kill server' });
    }
});

// ─── Clear server console history ────────────────────────────────────────────
router.post('/:serverId/clear-console', authenticateToken, checkPermission('server.console.write'), async (req, res) => {
    const serverId = req.params.serverId;
    try {
        const server = await getServer(serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        processManager.clearHistory(serverId.toString());
        res.json({ message: 'Console history cleared' });
    } catch (e) {
        console.error(`[serverRoutes] Clear-console error (Server: ${serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to clear console' });
    }
});

// ─── Get backup config ───────────────────────────────────────────────────────
router.get('/:serverId/backup-config', authenticateToken, checkPermission('server.backups.read'), async (req, res) => {
    try {
        const row = await dbGet('SELECT auto_backup, backup_interval, backup_includes FROM servers WHERE id = ?', [req.params.serverId]);
        if (!row) return res.status(404).json({ error: 'Server not found' });
        res.json(row);
    } catch (e) {
        console.error(`[serverRoutes] GET backup-config error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── Update backup config ────────────────────────────────────────────────────
router.post('/:serverId/backup-config', authenticateToken, checkPermission('server.backups.create'), (req, res) => {
    const { serverId } = req.params;
    const { enabled, interval, includes } = req.body;
    db.run(
        'UPDATE servers SET auto_backup = ?, backup_interval = ?, backup_includes = ? WHERE id = ?', 
        [enabled ? 1 : 0, interval || 24, includes || 'all', serverId], 
        function(err) {
            if (err) {
                console.error(`[serverRoutes] POST backup-config error (Server: ${serverId}, User: ${req.user.id}):`, err);
                return res.status(500).json({ error: 'Database error' });
            }
            if (this.changes === 0) return res.status(404).json({ error: 'Server not found' });
            res.json({ message: 'Backup configuration saved' });
        }
    );
});

// ─── Delete server ───────────────────────────────────────────────────────────
router.delete('/:serverId', authenticateToken, checkPermission('account.manage'), async (req, res) => {
    const { serverId } = req.params;
    try {
        const server = await getServer(serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        if (!processManager.acquireLock(serverId.toString())) {
            return res.status(409).json({ error: 'Cannot delete server while a lifecycle action is in progress.' });
        }

        try {
            // 1. Force stop/kill the process if it's running
            if (processManager.getStatus(serverId.toString()) === 'online') {
                processManager.kill(serverId.toString());
                processManager.clearHistory(serverId.toString());
            }

            // 2. Disconnect Discord bot (if any)
            try {
                const discordManager = require('../core/discord/discordManager');
                await discordManager.disconnect(serverId);
            } catch (_) {}

            // 3. Delete from DB (Ranks, Permissions, Invite Tokens, then Server)
            await dbRun('DELETE FROM user_server_ranks WHERE server_id = ?', [serverId]);
            await dbRun('DELETE FROM user_server_permissions WHERE server_id = ?', [serverId]);
            await dbRun('DELETE FROM account_creation_tokens');
            await dbRun('DELETE FROM servers WHERE id = ?', [serverId]);

            // 3. Delete the physical directory
            const serverDir = getServerDir(server);
            if (fs.existsSync(serverDir)) {
                fs.rmSync(serverDir, { recursive: true, force: true });
            }

            console.log(`Server ${serverId} (${server.name}) has been permanently deleted by user ${req.user.id}`);
            res.json({ message: 'Server deleted successfully' });
        } finally {
            processManager.releaseLock(serverId.toString());
        }
    } catch (e) {
        console.error('Error deleting server:', e);
        res.status(500).json({ error: 'Failed to delete server' });
    }
});


// ─── Import server from zip ──────────────────────────────────────────────────
router.post('/import', authenticateToken, importUpload.single('archive'), async (req, res) => {
    const userId = req.user.id;
    const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
    if (!user || user.role !== 'admin') {
        if (req.file) fsp.unlink(req.file.path).catch(() => {});
        return res.status(403).json({ error: 'Only administrators can import servers' });
    }

    if (!req.file) return res.status(400).json({ error: 'No archive uploaded' });

    const { name, software, version, ram_mb, port, jar_path, root_path } = req.body;
    if (!name || !software || !version || !ram_mb || !port || !jar_path) {
        fsp.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ error: 'Missing required fields: name, software, version, ram_mb, port, jar_path' });
    }

    const ramNum = parseInt(ram_mb, 10);
    const portNum = parseInt(port, 10);
    if (ramNum < 512 || ramNum > 16384) { fsp.unlink(req.file.path).catch(() => {}); return res.status(400).json({ error: 'RAM must be 512–16384 MB' }); }
    if (portNum < 1024 || portNum > 65535) { fsp.unlink(req.file.path).catch(() => {}); return res.status(400).json({ error: 'Port must be 1024–65535' }); }

    // Normalise paths: strip leading slashes, ensure forward slashes
    const normJar  = jar_path.replace(/^[/\\]+/, '').replace(/\\/g, '/');
    const normRoot = (root_path || '').replace(/^[/\\]+/, '').replace(/\\/g, '/').replace(/\/+$/, '');

    const zipPath = req.file.path;
    let serverId = null;
    let serverDir = null;

    try {
        const uuid = require('crypto').randomUUID();
        const dirName = await ensureUniqueDirName(sanitizeDirName(name));
        serverDir = path.join(SERVERS_DIR, dirName);

        // 1. Insert DB record first so we have an ID
        const result = await dbRun(
            'INSERT INTO servers (uuid, name, software, version, ram_mb, port, owner_id, directory_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [uuid, name, software, version, ramNum, portNum, userId, dirName]
        );
        serverId = result.lastID;

        await fsp.mkdir(serverDir, { recursive: true });
        processManager.acquireLock(serverId);

        try {
            // 2. Extract zip, respecting root_path prefix filter
            const zip = new StreamZip(zipPath);
            const entries = zip.getEntries(); // synchronous

            // Determine the prefix we must strip (normRoot + '/')
            const prefix = normRoot ? normRoot + '/' : '';

            // Collect entries that belong under the chosen root
            const toExtract = entries.filter(e => {
                if (prefix) {
                    return e.entryName.startsWith(prefix) && e.entryName !== prefix;
                }
                return true;
            });

            if (toExtract.length === 0) {
                throw new Error(`No files found under path "${normRoot}" inside the zip. Check the Server Root Path.`);
            }

            // Extract each entry, stripping the prefix from its name
            for (const entry of toExtract) {
                const relativeName = prefix ? entry.entryName.slice(prefix.length) : entry.entryName;
                if (!relativeName) continue;

                const destPath = path.join(serverDir, relativeName.replace(/\//g, path.sep));

                if (entry.isDirectory) {
                    await fsp.mkdir(destPath, { recursive: true });
                } else {
                    await fsp.mkdir(path.dirname(destPath), { recursive: true });
                    const data = zip.readFile(entry); // returns Buffer
                    if (data) await fsp.writeFile(destPath, data);
                }
            }
            zip.close ? zip.close() : undefined;

            // 3. Verify the declared jar exists
            const jarAbsPath = path.join(serverDir, normJar.replace(/\//g, path.sep));
            try {
                await fsp.access(jarAbsPath);
            } catch {
                throw new Error(`Jar not found at "${normJar}" inside the extracted archive. Check the Executable Path.`);
            }

            // 4. Symlink/copy jar to server.jar only if it isn't already named server.jar
            const stdJar = path.join(serverDir, 'server.jar');
            if (path.resolve(jarAbsPath) !== path.resolve(stdJar)) {
                // Write a tiny launcher shim: a server.jar is expected by the start logic.
                // Instead we store the custom jar path in a metadata file and adjust start logic.
                // Simplest compatible approach: copy the jar as server.jar.
                await retryCopy(jarAbsPath, stdJar);
            }

            // 5. Ensure eula.txt
            const eulaPath = path.join(serverDir, 'eula.txt');
            try { await fsp.access(eulaPath); } catch {
                await fsp.writeFile(eulaPath, 'eula=true\n');
            }

            // 6. Ensure server.properties has at least the right port
            const propsPath = path.join(serverDir, 'server.properties');
            try {
                await fsp.access(propsPath);
                // File exists — patch port in-place
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

            console.log(`Server import complete: ${serverId} (${dirName})`);
            res.json({ message: 'Server imported successfully', id: serverId, uuid, directory_name: dirName });

        } finally {
            processManager.releaseLock(serverId);
            // Always clean up temp zip
            fsp.unlink(zipPath).catch(() => {});
        }

    } catch (e) {
        // Roll back DB record and directory on failure
        if (serverId) {
            try { await dbRun('DELETE FROM servers WHERE id = ?', [serverId]); } catch (_) {}
        }
        if (serverDir) {
            try { if (fs.existsSync(serverDir)) fs.rmSync(serverDir, { recursive: true, force: true }); } catch (_) {}
        }
        fsp.unlink(zipPath).catch(() => {});

        console.error('[serverRoutes] Import error:', e);
        if (e.code === 'SQLITE_CONSTRAINT') {
            if (e.message.includes('servers.name'))  return res.status(400).json({ error: 'A server with this name already exists.' });
            if (e.message.includes('servers.port'))  return res.status(400).json({ error: 'This port is already in use.' });
        }
        res.status(500).json({ error: e.message || 'Import failed' });
    }
});


// ═════════════════════════════════════════════════════════════════════════════

/**
 * Run the Forge installer jar in --installServer mode.
 * Handles both modern (1.17+) and legacy Forge formats.
 * After install, locates the correct server jar and copies/symlinks it as server.jar.
 */
async function runForgeInstaller(installerPath, serverDir, serverId) {
    const { spawn } = require('child_process');
    const logFile = path.join(serverDir, 'install.log');

    console.log(`[Forge] Running installer for server ${serverId} in ${serverDir}`);
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] Starting Forge installation...\n`);

    try {
        // Copy installer to server directory
        const installerDest = path.join(serverDir, 'forge-installer.jar');
        fs.copyFileSync(installerPath, installerDest);

        // Run the installer
        await new Promise((resolvePromise, rejectPromise) => {
            const child = spawn('java', ['-jar', 'forge-installer.jar', '--installServer'], {
                cwd: serverDir
            });

            const logStream = fs.createWriteStream(logFile, { flags: 'a' });
            child.stdout.pipe(logStream);
            child.stderr.pipe(logStream);

            const timeoutId = setTimeout(() => {
                child.kill('SIGKILL');
                rejectPromise(new Error('Forge installation timed out after 120 seconds'));
            }, 120000);

            child.on('close', (code) => {
                clearTimeout(timeoutId);
                logStream.end();
                if (code !== 0) {
                    rejectPromise(new Error(`Forge installer exited with non-zero code: ${code}`));
                } else {
                    resolvePromise();
                }
            });

            child.on('error', (err) => {
                clearTimeout(timeoutId);
                logStream.end();
                rejectPromise(err);
            });
        });

        console.log(`[Forge] Installer completed successfully for server ${serverId}`);

        // Locate the actual server jar. Modern Forge generates different files:
        // - Modern (1.17+): Creates a run.sh/run.bat that uses @libraries/net/minecraftforge/forge/... 
        //   and might create a 'libraries' folder. The actual launch uses a special args file.
        // - Legacy (1.12-1.16): Creates forge-{version}-{forgeversion}.jar directly.

        // Strategy: Look for the generated Forge jar or the run scripts
        const serverJarTarget = path.join(serverDir, 'server.jar');
        const files = fs.readdirSync(serverDir);

        // Check for modern Forge (1.17+): look for run.bat/run.sh or @user_jvm_args.txt
        const hasRunScript = files.some(f => f === 'run.bat' || f === 'run.sh');
        const hasArgsFile = files.some(f => f.startsWith('user_jvm_args') || f.startsWith('unix_args'));

        if (hasRunScript || hasArgsFile) {
            // Modern Forge: create a wrapper. The actual command is in run.bat.
            // We need to parse it and extract the forge jar path.
            let forgeJar = null;

            // Try to find the forge jar in the libraries directory
            const libDir = path.join(serverDir, 'libraries');
            if (fs.existsSync(libDir)) {
                forgeJar = findForgeJarRecursive(libDir);
            }

            // Also check for a direct forge jar in the root
            if (!forgeJar) {
                const directForge = files.find(f => f.match(/^forge-.*\.jar$/) && !f.includes('installer'));
                if (directForge) forgeJar = path.join(serverDir, directForge);
            }

            // If we found a forge jar, use it; otherwise check if run.bat specifies one
            if (forgeJar) {
                fs.copyFileSync(forgeJar, serverJarTarget);
                fs.appendFileSync(logFile, `[${new Date().toISOString()}] Found Forge server jar: ${forgeJar}\n`);
            } else {
                // Parse run.bat for the jar path
                const runBat = path.join(serverDir, process.platform === 'win32' ? 'run.bat' : 'run.sh');
                if (fs.existsSync(runBat)) {
                    const runContent = fs.readFileSync(runBat, 'utf8');
                    // Look for @libraries/... or forge-*.jar references
                    const jarMatch = runContent.match(/@(libraries[\\/][^\s]+\.jar)/);
                    if (jarMatch) {
                        const libJarPath = path.join(serverDir, jarMatch[1].replace(/\//g, path.sep));
                        if (fs.existsSync(libJarPath)) {
                            fs.copyFileSync(libJarPath, serverJarTarget);
                            fs.appendFileSync(logFile, `[${new Date().toISOString()}] Found Forge jar from run script: ${libJarPath}\n`);
                        }
                    }
                }
            }
        } else {
            // Legacy Forge: look for forge-*.jar (not installer)
            const forgeJar = files.find(f => f.match(/^forge-.*\.jar$/) && !f.includes('installer'));
            if (forgeJar) {
                const forgeJarPath = path.join(serverDir, forgeJar);
                fs.copyFileSync(forgeJarPath, serverJarTarget);
                fs.appendFileSync(logFile, `[${new Date().toISOString()}] Found legacy Forge jar: ${forgeJar}\n`);
            }
        }

        // Verify server.jar exists
        if (!fs.existsSync(serverJarTarget)) {
            const errMsg = 'Forge installation completed but no server jar was found. Check install.log for details.';
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] ERROR: ${errMsg}\n`);
            console.error(`[Forge] ${errMsg}`);
            // List what files exist for debugging
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] Files in server dir: ${files.join(', ')}\n`);
        } else {
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] Forge installation successful. server.jar ready.\n`);
        }

        // Clean up installer
        try { await retryUnlink(installerDest); } catch (_) {}
        // Clean up installer log
        const installerLog = path.join(serverDir, 'forge-installer.jar.log');
        try { if (fs.existsSync(installerLog)) await retryUnlink(installerLog); } catch (_) {}

    } catch (err) {
        const errMsg = `Forge installer failed: ${err.message}`;
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ERROR: ${errMsg}\n`);
        if (err.stdout) fs.appendFileSync(logFile, `STDOUT: ${err.stdout}\n`);
        if (err.stderr) fs.appendFileSync(logFile, `STDERR: ${err.stderr}\n`);
        console.error(`[Forge] ${errMsg}`);
        throw new Error(errMsg);
    }
}

/**
 * Recursively search for a forge server jar inside the libraries directory.
 */
function findForgeJarRecursive(dir) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const found = findForgeJarRecursive(fullPath);
                if (found) return found;
            } else if (entry.name.match(/^forge-.*-server\.jar$/) || entry.name.match(/^forge-.*-universal\.jar$/)) {
                return fullPath;
            }
        }
    } catch (_) {}
    return null;
}

// ── FTP Per-Server Routes ──────────────────────────────────────────────────────

// GET FTP config for a server (requires server.ftp.access)
router.get('/:serverId/ftp', authenticateToken, checkPermission('server.ftp.access'), async (req, res) => {
    try {
        const sv = await dbGet('SELECT id, ftp_enabled, ftp_port, ftp_username, ftp_password_plain FROM servers WHERE id = ?', [req.params.serverId]);
        if (!sv) return res.status(404).json({ error: 'Server not found' });
        res.json({
            enabled: !!sv.ftp_enabled,
            port: sv.ftp_port || null,
            username: sv.ftp_username || null,
            password: sv.ftp_password_plain || null,
            running: isServerFtpRunning(sv.id)
        });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST FTP config (requires server.ftp.manage)
router.post('/:serverId/ftp/config', authenticateToken, checkPermission('server.ftp.manage'), async (req, res) => {
    try {
        const { username, password, port } = req.body;
        if (!username || !port) return res.status(400).json({ error: 'username and port are required' });
        if (port < 1024 || port > 65535) return res.status(400).json({ error: 'Port must be between 1024-65535' });

        // Check port not used by another server
        const conflict = await dbGet('SELECT id FROM servers WHERE ftp_port = ? AND id != ?', [port, req.params.serverId]);
        if (conflict) return res.status(400).json({ error: `Port ${port} already used by another server` });

        let updateSql, updateParams;
        if (password) {
            const hashed = await bcrypt.hash(password, 10);
            updateSql = 'UPDATE servers SET ftp_username=?, ftp_password=?, ftp_password_plain=?, ftp_port=? WHERE id=?';
            updateParams = [username, hashed, password, port, req.params.serverId];
        } else {
            updateSql = 'UPDATE servers SET ftp_username=?, ftp_port=? WHERE id=?';
            updateParams = [username, port, req.params.serverId];
        }
        await dbRun(updateSql, updateParams);

        // Restart FTP if it was running
        const sv = await dbGet('SELECT * FROM servers WHERE id = ?', [req.params.serverId]);
        if (sv.ftp_enabled) {
            await stopServerFtp(req.params.serverId);
            await startServerFtp(req.params.serverId);
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST toggle FTP enabled/disabled
router.post('/:serverId/ftp/toggle', authenticateToken, checkPermission('server.ftp.manage'), async (req, res) => {
    try {
        const sv = await dbGet('SELECT * FROM servers WHERE id = ?', [req.params.serverId]);
        if (!sv) return res.status(404).json({ error: 'Server not found' });

        const newEnabled = sv.ftp_enabled ? 0 : 1;
        await dbRun('UPDATE servers SET ftp_enabled=? WHERE id=?', [newEnabled, req.params.serverId]);

        if (newEnabled) {
            if (!sv.ftp_port || !sv.ftp_username || !sv.ftp_password) {
                return res.status(400).json({ error: 'Configure FTP credentials and port first' });
            }
            await startServerFtp(req.params.serverId);
        } else {
            await stopServerFtp(req.params.serverId);
        }
        res.json({ enabled: !!newEnabled, running: isServerFtpRunning(req.params.serverId) });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST update advanced server settings (requires server.properties.write)
router.post('/:serverId/settings', authenticateToken, checkPermission('server.properties.write'), async (req, res) => {
    const { serverId } = req.params;
    const { name, port, ram_mb, java_path, log_retention_days, backup_retention_days } = req.body;

    try {
        const server = await getServer(serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        // 1. Validation
        if (!name) return res.status(400).json({ error: 'Server name is required' });
        const portNum = parseInt(port, 10);
        if (isNaN(portNum) || portNum < 1024 || portNum > 65535) {
            return res.status(400).json({ error: 'Port must be between 1024 and 65535' });
        }
        const ramNum = parseInt(ram_mb, 10);
        if (isNaN(ramNum) || ramNum < 512 || ramNum > 16384) {
            return res.status(400).json({ error: 'RAM must be between 512 and 16384 MB' });
        }
        const logRet = parseInt(log_retention_days, 10);
        if (isNaN(logRet) || logRet < 0) {
            return res.status(400).json({ error: 'Log retention must be a non-negative number' });
        }
        const backupRet = parseInt(backup_retention_days, 10);
        if (isNaN(backupRet) || backupRet < 0) {
            return res.status(400).json({ error: 'Backup retention must be a non-negative number' });
        }
        const javaPathStr = (java_path || 'java').trim();
        if (!javaPathStr) {
            return res.status(400).json({ error: 'Java path cannot be empty' });
        }

        // 2. Check if the server is online and any process-impacting settings are changed
        const isOnline = processManager.getStatus(serverId.toString()) === 'online';
        const isRamChanged = Number(server.ram_mb) !== ramNum;
        const isPortChanged = Number(server.port) !== portNum;
        const isJavaChanged = server.java_path !== javaPathStr;

        if (isOnline && (isRamChanged || isPortChanged || isJavaChanged)) {
            return res.status(400).json({
                error: 'Stop the server before changing memory (RAM), port, or Java executable path.'
            });
        }

        // 3. Check if the new port is already in use by another server
        if (isPortChanged) {
            const conflict = await dbGet('SELECT id FROM servers WHERE port = ? AND id != ?', [portNum, serverId]);
            if (conflict) {
                return res.status(400).json({ error: `Port ${portNum} is already in use by another server.` });
            }
        }

        // 4. Update the DB
        await dbRun(
            `UPDATE servers SET 
                name = ?, 
                port = ?, 
                ram_mb = ?, 
                java_path = ?, 
                log_retention_days = ?, 
                backup_retention_days = ? 
             WHERE id = ?`,
            [name, portNum, ramNum, javaPathStr, logRet, backupRet, serverId]
        );

        // 5. Update server.properties port if it was changed
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
                    console.log(`[Settings] Updated server-port in server.properties to ${portNum} for server ${serverId}`);
                }
            } catch (err) {
                console.error(`[Settings] Failed to update server.properties for server ${serverId}:`, err.message);
            }
        }

        // Trigger auto-reprovision on Discord in background if integration exists
        try {
            const discordManager = require('../core/discord/discordManager');
            discordManager.getStatusForServer(serverId).then((status) => {
                if (status && status.connected) {
                    discordManager.reprovision(serverId).catch((err) => {
                        console.error(`[Settings] Failed to reprovision Discord in background for server ${serverId}:`, err.message);
                    });
                }
            }).catch(() => {});
        } catch (err) {
            console.error(`[Settings] Discord manager error during settings save:`, err.message);
        }

        res.json({ message: 'Settings saved successfully' });
    } catch (e) {
        console.error(`[serverRoutes] Update settings error (Server: ${serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: e.message || 'Failed to save advanced settings' });
    }
});

module.exports = router;
