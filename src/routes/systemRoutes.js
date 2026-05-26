const express = require('express');
const os = require('os');
const fsp = require('fs').promises;
const path = require('path');
const { authenticateToken } = require('../core/auth');
const { dbGet } = require('../db/database');
const { hasPermission } = require('../core/permissions');
const { initFtpServer, stopFtpServer, isFtpRunning } = require('../core/ftpServer');

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
        requireInviteTokenToCreateAccount: true
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
        if (diffTotal > 0) {
            cachedCpuPercent = 100 * (1 - diffIdle / diffTotal);
        }
    }

    lastCpuUsage = { user, system, idle };
}, 2000);

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
                    if (!isNaN(tempRaw)) {
                        const tempC = (tempRaw - 2732) / 10;
                        return resolve(tempC);
                    }
                }
                resolve(null);
            });
        } else if (platform === 'linux') {
            fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8', (err, data) => {
                if (err) return resolve(null);
                const tempRaw = parseInt(data.trim(), 10);
                if (!isNaN(tempRaw)) {
                    return resolve(tempRaw / 1000);
                }
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
            cpu: {
                usage: cpuPercent,
                count: os.cpus().length,
                temp
            },
            memory: {
                totalMb: Math.round(totalMem / 1024 / 1024),
                usedMb: Math.round(usedMem / 1024 / 1024),
                freeMb: Math.round(freeMem / 1024 / 1024),
                usedPercentage: Math.round((usedMem / totalMem) * 100)
            },
            uptime: os.uptime()
        });
    } catch (e) {
        console.error('System metrics error:', e);
        res.status(500).json({ error: 'Failed to retrieve system metrics' });
    }
});

router.get('/settings', authenticateToken, async (req, res) => {
    try {
        const isAllowed = await hasPermission(req.user.id, null, 'panel.settings');
        if (!isAllowed) {
            return res.status(403).json({ error: 'Forbidden: Missing panel.settings permission' });
        }
        const settings = await getSettings();
        res.json(settings);
    } catch (e) {
        console.error(`[systemRoutes] GET settings error (User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Database error' });
    }
});

router.post('/settings', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    try {
        const isAllowed = await hasPermission(userId, null, 'panel.settings');
        if (!isAllowed) {
            return res.status(403).json({ error: 'Forbidden: Missing panel.settings permission' });
        }
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
            maxRam: Number(payload.maxRam) || current.maxRam
        };
        await saveSettings(updated);
        const ftpRunning = isFtpRunning();
        if (updated.ftpEnabled === true) {
            if (!ftpRunning) {
                try {
                    await initFtpServer(updated.ftpPort);
                } catch (ftpErr) {
                    console.error('[FTP] Failed to start FTP service:', ftpErr.message);
                }
            }
        } else {
            if (ftpRunning) {
                stopFtpServer();
            }
        }
        res.json({ message: 'Panel settings updated successfully', settings: updated });
    } catch (e) {
        console.error(`[systemRoutes] POST settings error (User: ${userId}):`, e);
        res.status(500).json({ error: e.message || 'Failed to save settings' });
    }
});

router.get('/versions', authenticateToken, async (req, res) => {
    try {
        const versionManager = require('../core/versionManager');
        if (req.query.refresh === 'true') {
            await versionManager.updateVersions(true);
        }
        res.json(versionManager.getVersions());
    } catch (e) {
        console.error(`[systemRoutes] GET versions error (User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to retrieve version options' });
    }
});

module.exports = router;
