const FtpSrv = require('ftp-srv');
const { dbGet } = require('../db/database');
const { getServerDir } = require('./serverHelper');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const os = require('os');

// Map of running FTP servers: serverId -> { ftpSrv, port }
const runningServers = new Map();

// Get the best local IP to advertise for passive mode
function getLocalIp() {
    const ifaces = os.networkInterfaces();
    for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

async function startServerFtp(serverId) {
    const serverRow = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
    if (!serverRow) throw new Error('Server not found');
    if (!serverRow.ftp_enabled) throw new Error('FTP not enabled for this server');
    if (!serverRow.ftp_port) throw new Error('FTP port not configured');
    if (!serverRow.ftp_username || !serverRow.ftp_password) throw new Error('FTP credentials not configured');

    // Stop existing if running
    await stopServerFtp(serverId);

    const port = serverRow.ftp_port;
    const pasvIp = getLocalIp();

    // Passive port range: base port + 1000 offset, 50 ports per server slot
    // Each server gets its own slice so ports don't collide
    const pasvMin = 50000 + (Number(serverId) % 100) * 50;
    const pasvMax = pasvMin + 49;

    const ftpSrv = new FtpSrv({
        url: `ftp://0.0.0.0:${port}`,
        anonymous: false,
        blacklist: ['SITE'],
        pasv_url: pasvIp,
        pasv_min: pasvMin,
        pasv_max: pasvMax,
    });

    ftpSrv.on('login', async ({ connection, username, password }, resolve, reject) => {
        try {
            const sv = await dbGet('SELECT * FROM servers WHERE id = ?', [serverId]);
            if (!sv || !sv.ftp_enabled) return reject(new Error('FTP disabled'));

            if (username !== sv.ftp_username) return reject(new Error('Invalid credentials'));

            const isMatch = await bcrypt.compare(password, sv.ftp_password);
            if (!isMatch) return reject(new Error('Invalid credentials'));

            const rootDir = getServerDir(sv);
            if (!fs.existsSync(rootDir)) fs.mkdirSync(rootDir, { recursive: true });

            console.log(`[FTP] Server ${serverId}: Login OK for user ${username}, root: ${rootDir}, pasv: ${pasvIp}:${pasvMin}-${pasvMax}`);
            resolve({ root: rootDir });
        } catch (e) {
            console.error(`[FTP] Server ${serverId}: Auth Error:`, e.message);
            reject(e);
        }
    });

    await ftpSrv.listen();
    runningServers.set(String(serverId), { ftpSrv, port });
    console.log(`[FTP] Server ${serverId} FTP started on port ${port}`);
}

async function stopServerFtp(serverId) {
    const key = String(serverId);
    if (runningServers.has(key)) {
        try { runningServers.get(key).ftpSrv.close(); } catch (_) {}
        runningServers.delete(key);
        console.log(`[FTP] Server ${serverId} FTP stopped`);
    }
}

function isServerFtpRunning(serverId) {
    return runningServers.has(String(serverId));
}

// Legacy global FTP (kept for backwards compat, disabled)
async function initFtpServer(port = 2121) {
    console.log('[FTP] Global FTP disabled — use per-server FTP instead');
}

function stopFtpServer() {}
function isFtpRunning() { return false; }

module.exports = { initFtpServer, stopFtpServer, isFtpRunning, startServerFtp, stopServerFtp, isServerFtpRunning };
