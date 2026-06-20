const express = require('express');
const { db, dbRun, dbGet, dbAll } = require('../db/database');
const { authenticateToken } = require('../core/auth');
const { checkPermission, getEffectivePermissions } = require('../core/permissions');
const { E, sendError } = require('../core/errors');
const { validate } = require('../middleware/validation');
const V = require('../middleware/validators');
const { resolveJar, downloadJar } = require('../core/resolvers');
const processManager = require('../core/processManager');
const executionManager = require('../core/executionManager'); // native-only wrapper
const { SERVERS_DIR, sanitizeDirName, ensureUniqueDirName, getServer, getServerDir, createBackup, findAvailablePort } = require('../core/serverHelper');
const bedrockAdapter = require('../adapters/bedrock');
const pocketmineAdapter = require('../adapters/pocketmine');
const { retryRename, retryDelete, retryUnlink, retryCopy } = require('../core/utils/fsRetry');
const { startServerFtp, stopServerFtp, isServerFtpRunning, storePasswordCache, getPasswordCache } = require('../core/ftpServer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const multer = require('multer');
const os = require('os');
const StreamZip = require('adm-zip');
const logger = require('../core/utils/logger');
const javaManager = require('../core/javaManager');

// Multer  store uploaded zip in OS temp dir
const importUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, os.tmpdir()),
        filename: (_req, file, cb) => {
            const rand = require('crypto').randomBytes(8).toString('hex');
            cb(null, `minepanel-import-${rand}.zip`);
        }
    }),
    limits: { fileSize: 50 * 1024 * 1024 * 1024 }, // 50 GB max
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

    //  Bedrock: native binary, no JVM needed 
    if (bedrockAdapter.isBedrock(server.software)) {
        return bedrockAdapter.getBedrockLaunchDescriptor(server, serverDir);
    }

    //  PocketMine-MP: PHP PHAR, no JVM needed 
    if (pocketmineAdapter.isPocketMine(server.software)) {
        return pocketmineAdapter.getPocketMineLaunchDescriptor(server, serverDir);
    }

    //  Java servers (all other software types) 
    const jarFile = path.join(serverDir, 'server.jar');

    // JVM flags incompatible with older JVMs (require JDK 24+ Lilliput project).
    // Strip these wherever they appear  run.bat inline, user_jvm_args.txt, or
    // any @libraries/.../*.txt arg-file that Forge generates.
    const STRIP_FLAGS = [
        '-XX:+UseCompactObjectHeaders',
        '-XX:-UseCompactObjectHeaders',
    ];

    function filterJvmArgs(args) {
        return args.filter(arg => !STRIP_FLAGS.includes(arg.trim()));
    }

    // Read and filter a Forge @arg-file (e.g. win_args.txt / unix_args.txt).
    // Returns the expanded tokens with incompatible flags removed, or the
    // original @token if the file cannot be read.
    function expandArgFile(token, baseDir) {
        // token looks like "@libraries/net/minecraftforge/forge/.../win_args.txt"
        const relPath = token.startsWith('@') ? token.slice(1) : token;
        const fullPath = path.join(baseDir, relPath);
        try {
            if (!fs.existsSync(fullPath)) return [token]; // keep token as-is
            const content = fs.readFileSync(fullPath, 'utf8');
            // Forge arg-files are a single line of space-separated arguments
            const tokens = content.trim().split(/\s+/).filter(t => t.length > 0);
            return filterJvmArgs(tokens);
        } catch (_) {
            return [token]; // fallback: keep original token
        }
    }

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
                        let argsStr = line.trim().substring(5);
                        argsStr = argsStr.replace(/%\*/g, '').replace(/"\$@"/g, '').replace(/\$@/g, '').trim();
                        if (argsStr.includes('@user_jvm_args.txt') || argsStr.includes('libraries/')) {
                            let parsedArgs = argsStr.split(/\s+/).filter(a => a.length > 0);

                            // Expand @user_jvm_args.txt token
                            const userJvmArgsFile = path.join(serverDir, 'user_jvm_args.txt');
                            const userJvmIdx = parsedArgs.indexOf('@user_jvm_args.txt');
                            if (userJvmIdx !== -1) {
                                let userJvmFlags = [];
                                if (fs.existsSync(userJvmArgsFile)) {
                                    const userJvmContent = fs.readFileSync(userJvmArgsFile, 'utf8');
                                    userJvmFlags = userJvmContent
                                        .split('\n')
                                        .map(l => l.trim())
                                        .filter(l => l.length > 0 && !l.startsWith('#'));
                                    userJvmFlags = filterJvmArgs(userJvmFlags);
                                }
                                parsedArgs.splice(userJvmIdx, 1, ...userJvmFlags);
                            }

                            // Expand any remaining @libraries/... arg-file tokens and filter
                            // incompatible flags that live inside them (e.g. win_args.txt / unix_args.txt)
                            const expandedArgs = [];
                            for (const arg of parsedArgs) {
                                if (arg.startsWith('@') && arg.includes('libraries/')) {
                                    // Expand the file and strip bad flags from its contents
                                    expandedArgs.push(...expandArgFile(arg, serverDir));
                                } else {
                                    // Still filter any bare flags that may appear inline
                                    if (!STRIP_FLAGS.includes(arg.trim())) {
                                        expandedArgs.push(arg);
                                    }
                                }
                            }

                            customArgs = expandedArgs;
                            break;
                        }
                    }
                }
            }
        }
    } catch (_) {}

    return { serverDir, jarFile, customArgs };
}

//  List all servers 
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

//  Get next available port for a software type
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

//  Get single server details 
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

//  Get current user's permissions for a server 
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


//  Get next available port for a software type
//  Create a server (admin only) 
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

        // Lock during installation to avoid any lifecycle interference
        processManager.acquireLock(serverId);

        try {
            const finalJarInfo = await downloadJar(jarInfo);
            const softwareLower = software.toLowerCase();

            if (softwareLower === 'bedrock' || softwareLower === 'bedrock-preview') {
                // Bedrock (stable or preview): extract the ZIP and write default configs
                await bedrockAdapter.installBedrock(finalJarInfo.localPath, serverDir, port);
                logger.info(`Bedrock server ${serverId} (${dirName}) setup complete.`);
            } else if (softwareLower === 'pocketmine') {
                // PocketMine-MP: copy PHAR, write server.properties
                await pocketmineAdapter.installPocketMine(finalJarInfo.localPath, serverDir, port);
                logger.info(`PocketMine-MP server ${serverId} (${dirName}) setup complete.`);
            } else if (softwareLower === 'forge') {
                const targetJar = path.join(serverDir, 'server.jar');
                await runForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
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

//  Change server version 
router.post('/:serverId/change-version', authenticateToken, checkPermission('server.properties.write'), validate(V.changeVersion), async (req, res) => {
    const { serverId } = req.params;
    const { version } = req.body;
    if (!version) return sendError(res, E.BAD_REQUEST, 400, 'Version required');

    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

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

//  Switch server software (e.g. Paper -> Fabric) 
router.post('/:serverId/switch-software', authenticateToken, checkPermission('server.properties.write'), validate(V.switchSoftware), async (req, res) => {
    const { serverId } = req.params;
    const { software, version, confirm } = req.body;

    if (!software || !version) {
        return sendError(res, E.BAD_REQUEST, 400, 'Software and version are required');
    }

    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        if (processManager.getStatus(serverId.toString()) === 'online') {
            return sendError(res, E.SERVER_MUST_BE_STOPPED, 400);
        }

        const exited = await processManager.waitForExit(serverId.toString(), 3000);
        if (!exited && processManager.getStatus(serverId.toString()) === 'online') {
            return sendError(res, E.SERVER_MUST_BE_STOPPED, 400);
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
            return sendError(res, E.SERVER_LOCKED, 409);
        }

        let backupInfo;
        try {
            // 1. Resolve first to ensure it is a valid target build
            const jarInfo = await resolveJar(software, version);
            const serverDir = getServerDir(server);

            // 2. Perform Automatic Backup before switching
            try {
                backupInfo = await createBackup(serverDir, `autoswitch-${oldType}-to-${newType}`);
                logger.info(`Automatic rollback backup created: ${backupInfo.filename}`);
            } catch (backupErr) {
                return sendError(res, E.BACKUP_FAILED, 500, `Automatic backup failed: ${backupErr.message}. Switch aborted.`);
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
                            return sendError(res, E.INTERNAL_ERROR, 500, `Failed to deactivate mods folder: ${err.message}. Ensure no files are open.`);
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
                            return sendError(res, E.INTERNAL_ERROR, 500, `Failed to deactivate plugins folder: ${err.message}. Ensure no files are open.`);
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

            if (newType === 'bedrock' || newType === 'bedrock-preview') {
                await bedrockAdapter.installBedrock(finalJarInfo.localPath, serverDir, server.port);
            } else if (newType === 'pocketmine') {
                await pocketmineAdapter.installPocketMine(finalJarInfo.localPath, serverDir, server.port);
            } else {
                const targetJar = path.join(serverDir, 'server.jar');
                try { await retryUnlink(targetJar); } catch (_) {}

                if (newType === 'forge') {
                    await runForgeInstaller(finalJarInfo.localPath, serverDir, serverId);
                } else {
                    await retryCopy(finalJarInfo.localPath, targetJar);
                }
            }

            // 5. Update software & version in DB
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

//  Start server 
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
            // Clear console history for a fresh view
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

//  Stop server (graceful: sends /stop to stdin) 
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

//  Restart server (graceful stop then start) 
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

//  Kill server (force terminate specific PID only) 
router.post('/:serverId/kill', authenticateToken, checkPermission('server.kill'), async (req, res) => {
    const serverId = req.params.serverId;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        // Kill must never be blocked  force-acquire the lock
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

//  Clear server console history 
router.post('/:serverId/clear-console', authenticateToken, checkPermission('server.console.write'), async (req, res) => {
    const serverId = req.params.serverId;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        processManager.clearHistory(serverId.toString());
        res.json({ message: 'Console history cleared' });
    } catch (e) {
        logger.error(`[serverRoutes] Clear-console error (Server: ${serverId}, User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

//  Get backup config 
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

//  Update backup config 
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

//  Delete server 
router.delete('/:serverId', authenticateToken, checkPermission('account.manage'), async (req, res) => {
    const { serverId } = req.params;
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        if (!processManager.acquireLock(serverId.toString())) {
            return sendError(res, E.SERVER_LOCKED, 409);
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
            await dbRun('DELETE FROM servers WHERE id = ?', [serverId]);

            // 3. Delete the physical directory
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


//  Import server from zip 
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
                // File exists  patch port in-place
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

        logger.error('[serverRoutes] Import error:', e);
        if (e.code === 'SQLITE_CONSTRAINT') {
            if (e.message.includes('servers.name')) return sendError(res, E.SERVER_NAME_TAKEN, 409);
            if (e.message.includes('servers.port')) return sendError(res, E.SERVER_PORT_TAKEN, 409);
        }
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});


// 

/**
 * Run the Forge installer jar in --installServer mode.
 * Handles both modern (1.17+) and legacy Forge formats.
 * After install, locates the correct server jar and copies/symlinks it as server.jar.
 */
async function runForgeInstaller(installerPath, serverDir, serverId) {
    const { spawn } = require('child_process');
    const logFile = path.join(serverDir, 'install.log');

    logger.info(`[Forge] Running installer for server ${serverId} in ${serverDir}`);
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

        logger.info(`[Forge] Installer completed successfully for server ${serverId}`);

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
            logger.error(`[Forge] ${errMsg}`);
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
        logger.error(`[Forge] ${errMsg}`);
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

//  FTP Per-Server Routes 

// GET FTP config for a server (requires server.ftp.access)
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

// POST FTP config - FIXED VERSION
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

// POST toggle FTP enabled/disabled
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

// GET plaintext password - FIXED VERSION
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

// POST update advanced server settings (requires server.properties.write)
router.post('/:serverId/settings', authenticateToken, checkPermission('server.properties.write'), validate(V.serverSettings), async (req, res) => {
    const { serverId } = req.params;
    const { name, port, ram_mb, java_path, log_retention_days, backup_retention_days, autostart, autostart_on_crash } = req.body;

    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        // 1. Validation
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

        // 2. Check if the server is online and any process-impacting settings are changed
        const isOnline = processManager.getStatus(serverId.toString()) === 'online';
        const isRamChanged = Number(server.ram_mb) !== ramNum;
        const isPortChanged = Number(server.port) !== portNum;
        const isJavaChanged = server.java_path !== javaPathStr;

        if (isOnline && (isRamChanged || isPortChanged || isJavaChanged)) {
            return sendError(res, E.SERVER_MUST_BE_STOPPED, 400);
        }

        // 3. Check if the new port is already in use by another server
        if (isPortChanged) {
            const conflict = await dbGet('SELECT id FROM servers WHERE port = ? AND id != ?', [portNum, serverId]);
            if (conflict) {
                return sendError(res, E.SERVER_PORT_TAKEN, 409);
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
                backup_retention_days = ?,
                autostart = ?,
                autostart_on_crash = ?
             WHERE id = ?`,
            [name, portNum, ramNum, javaPathStr, logRet, backupRet,
             autostart ? 1 : 0, autostart_on_crash ? 1 : 0, serverId]
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
                    logger.info(`[Settings] Updated server-port in server.properties to ${portNum} for server ${serverId}`);
                }
            } catch (err) {
                logger.error(`[Settings] Failed to update server.properties for server ${serverId}:`, err.message);
            }
        }

        // Trigger auto-reprovision on Discord in background if integration exists
        try {
            const discordManager = require('../core/discord/discordManager');
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

// ─── Auto-Update routes ───────────────────────────────────────────────────────
const UpdateManager = require('../core/update/UpdateManager');

// GET /:serverId/update/settings  — read current update config + live state
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

        // Parse ignored_plugins JSON safely — stored as TEXT '[]' in SQLite
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

// PATCH /:serverId/update/settings  — persist update config
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
            // Always treat as array — defensive guard in case Joi coercion produces a non-array
            const raw = Array.isArray(req.body.ignored_plugins) ? req.body.ignored_plugins : [];
            // Normalize: lowercase, trim, deduplicate
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

        // Separate try/catch so the real DB error (e.g. missing column) is surfaced
        try {
            await dbRun(`UPDATE servers SET ${fields.join(', ')} WHERE id = ?`, values);
        } catch (dbErr) {
            logger.error(`[serverRoutes] PATCH update/settings DB error (Server: ${serverId}): ${dbErr.message}`);
            // Missing column means migration v15 was never applied — give an actionable message
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

// POST /:serverId/update/check  — manual check for a newer version
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

// POST /:serverId/update/run  — manually trigger update now
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
        // Expose the message — it's user-actionable (compat check, backup fail, etc.)
        return sendError(res, E.BAD_REQUEST, 400, e.message || null);
    }
});

// POST /:serverId/update/rollback  — roll back to last pre-update backup
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

