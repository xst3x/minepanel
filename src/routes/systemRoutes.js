const express = require('express');
const os = require('os');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { authenticateToken } = require('../core/auth');
const { dbGet } = require('../db/database');
const { hasPermission } = require('../core/permissions');
const { E, sendError } = require('../core/errors');
const { validate } = require('../middleware/validation');
const V = require('../middleware/validators');
const { initFtpServer, stopFtpServer, isFtpRunning } = require('../core/ftpServer');
const logger = require('../core/utils/logger');

const router = express.Router();
const SETTINGS_FILE = path.resolve(__dirname, '../../settings.json');

const getSettings = async () => {
    const defaults = {
        loginCooldown: 30,
        maxAttempts: 5,
        rateLimit: 100,
        ftpPort: 2121,
        ftpEnabled: true,
        defaultRam: 2048,
        defaultPort: 25565,
        maxRam: 16384,
        requireInviteTokenToCreateAccount: true,
        defaultRankId: null
    };
    try {
        if (await fsp.access(SETTINGS_FILE).then(() => true).catch(() => false)) {
            const data = await fsp.readFile(SETTINGS_FILE, 'utf8');
            return { ...defaults, ...JSON.parse(data) };
        }
    } catch (_) {}
    return defaults;
};

const saveSettings = async (data) => {
    await fsp.writeFile(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
};

let lastCpuUsage = { user: 0, system: 0, idle: 0 };
let cachedCpuPercent = 0;

if (process.env.NODE_ENV !== 'test') {
    setInterval(() => {
        const cpus = os.cpus();
        if (!cpus || cpus.length === 0) return;

        let user = 0, system = 0, idle = 0;
        cpus.forEach(c => {
            user += c.times.user;
            system += c.times.sys;
            idle += c.times.idle;
        });

        const total = user + system + idle;
        const lastTotal = lastCpuUsage.user + lastCpuUsage.system + lastCpuUsage.idle;

        if (lastTotal > 0) {
            const diffTotal = total - lastTotal;
            const diffIdle = idle - lastCpuUsage.idle;
            if (diffTotal > 0) cachedCpuPercent = 100 * (1 - diffIdle / diffTotal);
        }

        lastCpuUsage = { user, system, idle };
    }, 2000);
}

const { exec } = require('child_process');

function getCpuTemperature() {
    return new Promise((resolve) => {
        const platform = os.platform();
        if (platform === 'win32') {
            const cmd = 'wmic /namespace:\\\\root\\wmi PATH MSAcpi_ThermalZoneTemperature get CurrentTemperature';
            exec(cmd, { timeout: 2000 }, (error, stdout) => {
                if (error) return resolve(null);
                const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length > 1) {
                    const tempRaw = parseInt(lines[1], 10);
                    if (!isNaN(tempRaw)) return resolve((tempRaw - 2732) / 10);
                }
                resolve(null);
            });
        } else if (platform === 'linux') {
            fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8', (err, data) => {
                if (err) return resolve(null);
                const tempRaw = parseInt(data.trim(), 10);
                if (!isNaN(tempRaw)) return resolve(tempRaw / 1000);
                resolve(null);
            });
        } else if (platform === 'darwin') {
            exec('sudo powermetrics -n 1 -i 10 --samplers smc', { timeout: 2000 }, (error, stdout) => {
                if (error) return resolve(null);
                const match = stdout.match(/CPU temp: ([\d.]+)/i);
                if (match) {
                    const tempVal = parseFloat(match[1]);
                    if (!isNaN(tempVal)) return resolve(tempVal);
                }
                resolve(null);
            });
        } else {
            resolve(null);
        }
    });
}

router.get('/metrics', authenticateToken, async (req, res) => {
    try {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const cpuPercent = cachedCpuPercent || 0;
        const temp = await getCpuTemperature();
        res.json({
            cpu: { usage: cpuPercent, count: os.cpus().length, temp },
            memory: {
                totalMb: Math.round(totalMem / 1024 / 1024),
                usedMb: Math.round(usedMem / 1024 / 1024),
                freeMb: Math.round(freeMem / 1024 / 1024),
                usedPercentage: Math.round((usedMem / totalMem) * 100)
            },
            uptime: os.uptime()
        });
    } catch (e) {
        logger.error('[systemRoutes] Metrics error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.get('/settings', authenticateToken, async (req, res) => {
    try {
        const isAllowed = await hasPermission(req.user.id, null, 'panel.settings');
        if (!isAllowed) return sendError(res, E.FORBIDDEN, 403);
        const settings = await getSettings();
        res.json(settings);
    } catch (e) {
        logger.error(`[systemRoutes] GET settings error (User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/settings', authenticateToken, validate(V.panelSettings), async (req, res) => {
    const userId = req.user.id;
    try {
        const isAllowed = await hasPermission(userId, null, 'panel.settings');
        if (!isAllowed) return sendError(res, E.FORBIDDEN, 403);
        const payload = req.body;
        const current = await getSettings();
        const updated = {
            loginCooldown: Number(payload.loginCooldown) || current.loginCooldown,
            maxAttempts: Number(payload.maxAttempts) || current.maxAttempts,
            rateLimit: Number(payload.rateLimit) || current.rateLimit,
            ftpPort: Number(payload.ftpPort) || current.ftpPort,
            ftpEnabled: payload.ftpEnabled !== undefined ? !!payload.ftpEnabled : current.ftpEnabled,
            defaultRam: Number(payload.defaultRam) || current.defaultRam,
            defaultPort: Number(payload.defaultPort) || current.defaultPort,
            maxRam: Number(payload.maxRam) || current.maxRam,
            requireInviteTokenToCreateAccount: payload.requireInviteTokenToCreateAccount !== undefined
                ? !!payload.requireInviteTokenToCreateAccount
                : current.requireInviteTokenToCreateAccount,
            defaultRankId: payload.defaultRankId !== undefined
                ? (payload.defaultRankId === null ? null : Number(payload.defaultRankId))
                : current.defaultRankId
        };
        await saveSettings(updated);
        const ftpRunning = isFtpRunning();
        if (updated.ftpEnabled === true) {
            if (!ftpRunning) {
                try { await initFtpServer(updated.ftpPort); } catch (ftpErr) {
                    logger.error('[FTP] Failed to start FTP service:', ftpErr);
                }
            }
        } else {
            if (ftpRunning) stopFtpServer();
        }
        res.json({ message: 'Panel settings updated successfully', settings: updated });
    } catch (e) {
        logger.error(`[systemRoutes] POST settings error (User: ${userId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});

router.get('/versions', authenticateToken, async (req, res) => {
    try {
        const versionManager = require('../core/versionManager');
        if (req.query.refresh === 'true') await versionManager.updateVersions(true);
        res.json(versionManager.getVersions());
    } catch (e) {
        logger.error(`[systemRoutes] GET versions error (User: ${req.user.id}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Lightweight health check (unauthenticated)
router.get('/health', (req, res) => {
    res.json({ status: 'ok', booted: true });
});

/**
 * Detect all Java installations on the host system.
 * Returns an array of { path, version } objects sorted by version descending.
 */
router.get('/detect-java', authenticateToken, async (req, res) => {
    const { execFile } = require('child_process');
    const isWin = os.platform() === 'win32';

    // Candidate paths to probe
    const candidates = new Set();

    // 1. 'java' on PATH
    candidates.add('java');

    if (isWin) {
        // 2. Common Windows JDK locations
        const roots = [
            'C:\\Program Files\\Java',
            'C:\\Program Files\\Eclipse Adoptium',
            'C:\\Program Files\\Microsoft',
            'C:\\Program Files\\BellSoft',
            'C:\\Program Files\\Amazon Corretto',
            'C:\\Program Files\\Azul Systems\\Zulu',
        ];
        for (const root of roots) {
            try {
                if (!fs.existsSync(root)) continue;
                for (const dir of fs.readdirSync(root)) {
                    const javaExe = path.join(root, dir, 'bin', 'java.exe');
                    if (fs.existsSync(javaExe)) candidates.add(javaExe);
                }
            } catch (_) {}
        }
        // 3. Registry via WMIC (best-effort)
        try {
            const { execSync } = require('child_process');
            const out = execSync(
                'wmic product where "Name like \'%Java%\' or Name like \'%JDK%\' or Name like \'%JRE%\'" get InstallLocation /value',
                { timeout: 4000, stdio: ['pipe','pipe','pipe'] }
            ).toString();
            for (const line of out.split('\n')) {
                const m = line.match(/InstallLocation=(.+)/);
                if (m) {
                    const loc = m[1].trim();
                    const javaExe = path.join(loc, 'bin', 'java.exe');
                    if (fs.existsSync(javaExe)) candidates.add(javaExe);
                }
            }
        } catch (_) {}
    } else {
        // Linux / macOS
        const linuxRoots = [
            '/usr/lib/jvm',
            '/usr/java',
            '/opt/java',
            '/opt/jdk',
            '/usr/local/lib/jvm',
        ];
        for (const root of linuxRoots) {
            try {
                if (!fs.existsSync(root)) continue;
                for (const dir of fs.readdirSync(root)) {
                    const javaExe = path.join(root, dir, 'bin', 'java');
                    if (fs.existsSync(javaExe)) candidates.add(javaExe);
                }
            } catch (_) {}
        }
        // macOS /Library/Java
        try {
            const macRoot = '/Library/Java/JavaVirtualMachines';
            if (fs.existsSync(macRoot)) {
                for (const dir of fs.readdirSync(macRoot)) {
                    const javaExe = path.join(macRoot, dir, 'Contents', 'Home', 'bin', 'java');
                    if (fs.existsSync(javaExe)) candidates.add(javaExe);
                }
            }
        } catch (_) {}
        // JAVA_HOME
        if (process.env.JAVA_HOME) {
            const javaExe = path.join(process.env.JAVA_HOME, 'bin', 'java');
            candidates.add(javaExe);
        }
    }

    // Probe each candidate: run `java -version` and parse the output
    const probeJava = (javaPath) => new Promise((resolve) => {
        execFile(javaPath, ['-version'], { timeout: 5000 }, (err, stdout, stderr) => {
            // java -version writes to stderr
            const output = (stderr || stdout || '').trim();
            // Parse: 'openjdk version "21.0.3"' or 'java version "1.8.0_xxx"'
            const m = output.match(/version "([^"]+)"/);
            if (!m) return resolve(null);
            const versionStr = m[1];
            // Normalise: "1.8.0_xxx" → 8, "21.0.3" → 21, "25-ea" → 25
            let major;
            if (versionStr.startsWith('1.')) {
                major = parseInt(versionStr.split('.')[1], 10);
            } else {
                major = parseInt(versionStr.split(/[.\-]/)[0], 10);
            }
            if (isNaN(major)) return resolve(null);
            resolve({ path: javaPath, version: major, versionString: versionStr, fullOutput: output.split('\n')[0] });
        });
    });

    const results = (await Promise.all([...candidates].map(probeJava)))
        .filter(Boolean)
        // Deduplicate by resolved version+path
        .filter((v, i, arr) => arr.findIndex(x => x.path === v.path) === i)
        .sort((a, b) => b.version - a.version);

    res.json({ javas: results });
});

function checkPortFree(port) {
    const net = require('net');
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.once('listening', () => { server.close(() => resolve(true)); });
        server.listen(port);
    });
}

router.post('/change-port', authenticateToken, validate(V.changePort), async (req, res) => {
    const userId = req.user.id;
    try {
        const isAllowed = await hasPermission(userId, null, 'panel.settings');
        if (!isAllowed) return sendError(res, E.FORBIDDEN, 403);

        if (global.isSwitchingPort) {
            return sendError(res, E.SYSTEM_PORT_SWITCH_IN_PROGRESS, 409);
        }

        const newPort = parseInt(req.body.port, 10);
        if (isNaN(newPort) || newPort < 1 || newPort > 65535) {
            return sendError(res, E.SYSTEM_PORT_INVALID, 400);
        }

        const currentPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 8082;
        if (newPort === currentPort) {
            return sendError(res, E.SYSTEM_PORT_SAME, 400);
        }

        const isFree = await checkPortFree(newPort);
        if (!isFree) {
            return sendError(res, E.SYSTEM_PORT_IN_USE, 400);
        }

        global.isSwitchingPort = true;

        const { updateEnvPort } = require('../core/utils/envHelper');
        updateEnvPort(newPort);

        res.json({ success: true, message: 'Server port updated successfully. Restarting...' });

        setTimeout(() => {
            if (global.changePortAndRestart) {
                global.changePortAndRestart(newPort);
            } else {
                logger.error('[systemRoutes] global.changePortAndRestart is not defined. Force exiting.');
                process.exit(100);
            }
        }, 500);
    } catch (e) {
        logger.error(`[systemRoutes] POST change-port error (User: ${userId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || null);
    }
});

module.exports = router;
