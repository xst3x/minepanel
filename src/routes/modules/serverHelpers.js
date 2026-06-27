const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const multer = require('multer');
const { dbRun } = require('../../db/database');
const { SERVERS_DIR, getServerDir, createBackup, retryUnlink, retryCopy, retryRename, retryDelete } = require('../../core/serverHelper');
const bedrockAdapter = require('../../adapters/bedrock');
const pocketmineAdapter = require('../../adapters/pocketmine');
const processManager = require('../../core/processManager');
const logger = require('../../core/utils/logger');

// ── Multer upload config for server import ──────────────────────────────────
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

// ── getStartInfo ────────────────────────────────────────────────────────────
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
    const STRIP_FLAGS = [
        '-XX:+UseCompactObjectHeaders',
        '-XX:-UseCompactObjectHeaders',
    ];

    function filterJvmArgs(args) {
        return args.filter(arg => !STRIP_FLAGS.includes(arg.trim()));
    }

    function expandArgFile(token, baseDir) {
        const relPath = token.startsWith('@') ? token.slice(1) : token;
        const fullPath = path.join(baseDir, relPath);
        try {
            if (!fs.existsSync(fullPath)) return [token];
            const content = fs.readFileSync(fullPath, 'utf8');
            const tokens = content.trim().split(/\s+/).filter(t => t.length > 0);
            return filterJvmArgs(tokens);
        } catch (_) {
            return [token];
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

                            const expandedArgs = [];
                            for (const arg of parsedArgs) {
                                if (arg.startsWith('@') && arg.includes('libraries/')) {
                                    expandedArgs.push(...expandArgFile(arg, serverDir));
                                } else {
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

    // If the admin set a fully custom start command, parse it into args and use it.
    if (server.custom_start_command && server.custom_start_command.trim()) {
        const rawCmd = server.custom_start_command.trim();
        // Split the command into tokens (naive shell-like split — handles quoted strings).
        const tokens = rawCmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
        // Strip leading executable token if it's the java binary (we pass javaPath separately).
        const isJavaCmd = tokens[0] && (tokens[0] === 'java' || tokens[0].toLowerCase().endsWith('java') || tokens[0].toLowerCase().endsWith('java.exe'));
        const customArgs = isJavaCmd ? tokens.slice(1) : tokens;
        return { serverDir, jarFile, customArgs };
    }

    return { serverDir, jarFile, customArgs };
}

/**
 * Build the human-readable default start command string for a Java server.
 * Used by the Settings UI to show the auto-generated command in the text field.
 */
function buildDefaultStartCommand(server, serverDir, javaPath = 'java') {
    const software = (server.software || '').toLowerCase();

    // Forge / NeoForge: try to reconstruct from run script
    if (software === 'forge' || software === 'neoforge') {
        const isWin = process.platform === 'win32';
        const runScript = path.join(serverDir, isWin ? 'run.bat' : 'run.sh');
        if (fs.existsSync(runScript)) {
            const content = fs.readFileSync(runScript, 'utf8');
            for (const line of content.split('\n')) {
                if (line.trim().startsWith('java ')) {
                    return line.trim();
                }
            }
        }
    }

    // Standard Java: simple -Xms/-Xmx -jar server.jar nogui
    const ram = server.ram_mb || 2048;
    return `${javaPath} -Xms${ram}M -Xmx${ram}M -jar server.jar nogui`;
}

// ── Forge installer helpers ─────────────────────────────────────────────────
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

async function runForgeInstaller(installerPath, serverDir, serverId) {
    const { spawn } = require('child_process');
    const logFile = path.join(serverDir, 'install.log');

    logger.info(`[Forge] Running installer for server ${serverId} in ${serverDir}`);
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] Starting Forge installation...\n`);

    try {
        const installerDest = path.join(serverDir, 'forge-installer.jar');
        fs.copyFileSync(installerPath, installerDest);

        await new Promise((resolvePromise, rejectPromise) => {
            const child = spawn('java', ['-jar', 'forge-installer.jar', '--installServer'], { cwd: serverDir });
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
                code !== 0 ? rejectPromise(new Error(`Forge installer exited with non-zero code: ${code}`)) : resolvePromise();
            });
            child.on('error', (err) => { clearTimeout(timeoutId); logStream.end(); rejectPromise(err); });
        });

        logger.info(`[Forge] Installer completed successfully for server ${serverId}`);
        const serverJarTarget = path.join(serverDir, 'server.jar');
        const files = fs.readdirSync(serverDir);
        const hasRunScript = files.some(f => f === 'run.bat' || f === 'run.sh');
        const hasArgsFile = files.some(f => f.startsWith('user_jvm_args') || f.startsWith('unix_args'));

        if (hasRunScript || hasArgsFile) {
            let forgeJar = null;
            const libDir = path.join(serverDir, 'libraries');
            if (fs.existsSync(libDir)) forgeJar = findForgeJarRecursive(libDir);
            if (!forgeJar) {
                const directForge = files.find(f => f.match(/^forge-.*\.jar$/) && !f.includes('installer'));
                if (directForge) forgeJar = path.join(serverDir, directForge);
            }
            if (forgeJar) {
                fs.copyFileSync(forgeJar, serverJarTarget);
                fs.appendFileSync(logFile, `[${new Date().toISOString()}] Found Forge server jar: ${forgeJar}\n`);
            } else {
                const runBat = path.join(serverDir, process.platform === 'win32' ? 'run.bat' : 'run.sh');
                if (fs.existsSync(runBat)) {
                    const runContent = fs.readFileSync(runBat, 'utf8');
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
            const forgeJar = files.find(f => f.match(/^forge-.*\.jar$/) && !f.includes('installer'));
            if (forgeJar) {
                fs.copyFileSync(path.join(serverDir, forgeJar), serverJarTarget);
                fs.appendFileSync(logFile, `[${new Date().toISOString()}] Found legacy Forge jar: ${forgeJar}\n`);
            }
        }

        if (!fs.existsSync(serverJarTarget)) {
            const errMsg = 'Forge installation completed but no server jar was found. Check install.log for details.';
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] ERROR: ${errMsg}\n`);
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] Files in server dir: ${files.join(', ')}\n`);
            logger.error(`[Forge] ${errMsg}`);
        } else {
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] Forge installation successful. server.jar ready.\n`);
        }

        try { await retryUnlink(installerDest); } catch (_) {}
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

// ── NeoForge installer helpers ──────────────────────────────────────────────
function findNeoForgeJarRecursive(dir) {
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                const found = findNeoForgeJarRecursive(fullPath);
                if (found) return found;
            } else if (
                entry.name.match(/^neoforge-.*-server\.jar$/) ||
                entry.name.match(/^neoforge-.*-universal\.jar$/) ||
                (entry.name.match(/^neoforge-.*\.jar$/) && !entry.name.includes('installer'))
            ) {
                return fullPath;
            }
        }
    } catch (_) {}
    return null;
}

async function runNeoForgeInstaller(installerPath, serverDir, serverId) {
    const { spawn } = require('child_process');
    const logFile = path.join(serverDir, 'install.log');

    logger.info(`[NeoForge] Running installer for server ${serverId} in ${serverDir}`);
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] Starting NeoForge installation...\n`);

    try {
        const installerDest = path.join(serverDir, 'neoforge-installer.jar');
        fs.copyFileSync(installerPath, installerDest);

        await new Promise((resolvePromise, rejectPromise) => {
            const child = spawn('java', ['-jar', 'neoforge-installer.jar', '--installServer'], { cwd: serverDir });
            const logStream = fs.createWriteStream(logFile, { flags: 'a' });
            child.stdout.pipe(logStream);
            child.stderr.pipe(logStream);
            const timeoutId = setTimeout(() => {
                child.kill('SIGKILL');
                rejectPromise(new Error('NeoForge installation timed out after 120 seconds'));
            }, 120000);
            child.on('close', (code) => {
                clearTimeout(timeoutId);
                logStream.end();
                code !== 0 ? rejectPromise(new Error(`NeoForge installer exited with non-zero code: ${code}`)) : resolvePromise();
            });
            child.on('error', (err) => { clearTimeout(timeoutId); logStream.end(); rejectPromise(err); });
        });

        logger.info(`[NeoForge] Installer completed successfully for server ${serverId}`);
        const serverJarTarget = path.join(serverDir, 'server.jar');
        const files = fs.readdirSync(serverDir);
        let neoforgeJar = null;

        const libDir = path.join(serverDir, 'libraries');
        if (fs.existsSync(libDir)) neoforgeJar = findNeoForgeJarRecursive(libDir);

        if (!neoforgeJar) {
            const direct = files.find(f => f.match(/^neoforge-.*\.jar$/) && !f.includes('installer'));
            if (direct) neoforgeJar = path.join(serverDir, direct);
        }

        if (!neoforgeJar) {
            const runBat = path.join(serverDir, process.platform === 'win32' ? 'run.bat' : 'run.sh');
            if (fs.existsSync(runBat)) {
                const runContent = fs.readFileSync(runBat, 'utf8');
                const jarMatch = runContent.match(/@(libraries[\\/][^\s]+\.jar)/);
                if (jarMatch) {
                    const libJarPath = path.join(serverDir, jarMatch[1].replace(/\//g, path.sep));
                    if (fs.existsSync(libJarPath)) neoforgeJar = libJarPath;
                }
            }
        }

        if (neoforgeJar) {
            fs.copyFileSync(neoforgeJar, serverJarTarget);
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] Found NeoForge server jar: ${neoforgeJar}\n`);
        } else {
            const errMsg = 'NeoForge installation completed but no server jar was found. Check install.log for details.';
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] ERROR: ${errMsg}\n`);
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] Files in server dir: ${files.join(', ')}\n`);
            logger.error(`[NeoForge] ${errMsg}`);
        }

        fs.appendFileSync(logFile, `[${new Date().toISOString()}] NeoForge installation successful. server.jar ready.\n`);
        try { await retryUnlink(installerDest); } catch (_) {}
    } catch (err) {
        const errMsg = `NeoForge installer failed: ${err.message}`;
        fs.appendFileSync(logFile, `[${new Date().toISOString()}] ERROR: ${errMsg}\n`);
        logger.error(`[NeoForge] ${errMsg}`);
        throw new Error(errMsg);
    }
}

module.exports = {
    importUpload,
    getStartInfo,
    buildDefaultStartCommand,
    runForgeInstaller,
    findForgeJarRecursive,
    runNeoForgeInstaller,
    findNeoForgeJarRecursive,
};
