require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
require('./core/utils/envHelper').sanitizeSecrets();

// --- Launcher Process Logic (must be the absolute first thing) ---
if (process.env.MINEPANEL_SERVER !== 'true' && process.env.NODE_ENV !== 'test') {
    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const { updateEnvPort } = require('./core/utils/envHelper');

    // ── Clear terminal ────────────────────────────────────────────────────────
    process.stdout.write(process.platform === 'win32' ? '\x1Bc' : '\x1B[2J\x1B[3J\x1B[H');
    // ─────────────────────────────────────────────────────────────────────────

    function getPortFromEnv() {
        const envPath = path.resolve(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            const match = content.match(/^PORT=(\d+)/m);
            if (match) return parseInt(match[1], 10);
        }
        return 8082;
    }

    let lastKnownGoodPort = getPortFromEnv();

    function startServer() {
        const currentPort = getPortFromEnv();
        console.log(`[Launcher] Starting MinePanel server on port ${currentPort}...`);
        
        const child = spawn(process.execPath, [__filename], {
            stdio: 'inherit',
            env: { ...process.env, MINEPANEL_SERVER: 'true' }
        });
        
        child.on('exit', (code) => {
            console.log(`[Launcher] Server child process exited with code ${code}`);
            if (code === 100) {
                lastKnownGoodPort = currentPort;
                console.log('[Launcher] Re-launching server on new port...');
                startServer();
            } else if (code === 101) {
                console.error(`[Launcher] Server failed to bind to port. Rolling back to last known good port ${lastKnownGoodPort}...`);
                try {
                    updateEnvPort(lastKnownGoodPort);
                } catch (err) {
                    console.error('[Launcher] Failed to update rollback port in .env:', err.message);
                }
                startServer();
            } else {
                process.exit(code || 0);
            }
        });
    }

    startServer();
} else {
// -----------------------------------------------------------------

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./db/database');
const authRoutes = require('./routes/authRoutes');
const serverRoutes = require('./routes/serverRoutes');
const fileRoutes = require('./routes/fileRoutes');
const systemRoutes = require('./routes/systemRoutes');
const playerRoutes = require('./routes/playerRoutes');
const pluginRoutes = require('./routes/pluginRoutes');
const modpackRoutes = require('./routes/modpackRoutes');
const pocketmineRoutes = require('./routes/pocketmineRoutes');
const backupRoutes = require('./routes/backupRoutes');
const propertiesRoutes = require('./routes/propertiesRoutes');
const logRoutes = require('./routes/logRoutes');
const discordRoutes = require('./routes/discordRoutes');
const discordBotsRoutes = require('./routes/discordBotsRoutes');
const userRoutes = require('./routes/userRoutes');
const rankRoutes = require('./routes/rankRoutes');
const { statsRouter, statsConfigRouter } = require('./routes/statsRoutes');
const docsRoutes = require('./routes/docsRoutes');
const automationRoutes = require('./routes/automationRoutes');
const automationEngine = require('./core/automationEngine');
const statsCollector = require('./core/statsCollector');
const processManager = require('./core/processManager');
const { initFtpServer } = require('./core/ftpServer');
const { authenticateToken } = require('./core/auth');
const requestLogger = require('./middleware/requestLogger');
const SECRET_KEY = process.env.JWT_SECRET;
const { hasPermission } = require('./core/permissions');
const { migrateServerDirectories } = require('./core/serverHelper');
const CONFIG = require('./config');
const jwt = require('jsonwebtoken');
const logger = require('./core/utils/logger');
const executionManager = require('./core/executionManager');

const app = express();

// --- HTTPS / HTTP server setup ---
let server;
let secureServer;
let redirectServer;

if (CONFIG.HTTPS_ENABLED) {
    const https = require('https');
    const fs = require('fs');
    const path = require('path');
    const net = require('net');
    
    const keyPath = require('path').resolve(__dirname, '..', CONFIG.HTTPS_KEY);
    const certPath = require('path').resolve(__dirname, '..', CONFIG.HTTPS_CERT);
    if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
        console.error(`[HTTPS] Certificate files not found!`);
        process.exit(1);
    }
    const sslOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
    };
    
    secureServer = https.createServer(sslOptions, app);
    console.log('[HTTPS] Running in HTTPS mode');
    
    redirectServer = http.createServer((req, res) => {
        res.writeHead(301, { "Location": `https://${req.headers.host}${req.url}` });
        res.end();
    });
    
    secureServer.on('error', (err) => console.error('[Secure Server Error]', err));
    redirectServer.on('error', (err) => console.error('[Redirect Server Error]', err));
    
    const activeSockets = new Set();
    global.activeSockets = activeSockets;
    
    const net2 = require('net');
    server = net2.createServer((socket) => {
        activeSockets.add(socket);
        socket.on('close', () => activeSockets.delete(socket));
        socket.once('data', (buffer) => {
            socket.pause();
            if (buffer[0] === 22) {
                secureServer.emit('connection', socket);
            } else {
                redirectServer.emit('connection', socket);
            }
            socket.unshift(buffer);
            process.nextTick(() => socket.resume());
        });
        socket.on('error', (err) => {
            if (err.code !== 'ECONNRESET') console.error('[Sniffer Socket Error]', err.message);
        });
    });
} else {
    server = http.createServer(app);
    logger.info('[HTTP] Running in HTTP mode (use Nginx + Let\'s Encrypt for production HTTPS)');
    const activeSockets = new Set();
    global.activeSockets = activeSockets;
    server.on('connection', (socket) => {
        activeSockets.add(socket);
        socket.on('close', () => activeSockets.delete(socket));
    });
}

const wss = new WebSocket.Server({ server: CONFIG.HTTPS_ENABLED ? secureServer : server, path: '/ws' });

const allowedOrigins = CONFIG.ALLOWED_ORIGINS;
if (allowedOrigins.length === 0) console.warn('[CORS] No allowed origins configured.');
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
}));

app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (CONFIG.HTTPS_ENABLED) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: https:; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
});
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

let cachedSettings = null;
let lastCacheTime = 0;
const getSettings = () => {
    const now = Date.now();
    if (cachedSettings && (now - lastCacheTime < 30000)) return cachedSettings;
    try {
        const settingsPath = path.resolve(__dirname, '../settings.json');
        if (fs.existsSync(settingsPath)) {
            cachedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            lastCacheTime = now;
            return cachedSettings;
        }
    } catch (_) {}
    cachedSettings = {};
    lastCacheTime = now;
    return cachedSettings;
};

const globalRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: CONFIG.RATE_LIMIT,
    message: { error: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', (req, res, next) => {
    if (req.path === '/servers/import') return next();
    return globalRateLimiter(req, res, next);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: require('../package.json').version, uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
});

app.use('/avatars', express.static(
    process.env.DATA_DIR
        ? require('path').join(process.env.DATA_DIR, 'avatars')
        : path.join(__dirname, '../data/avatars')
));

app.get('/metrics', (req, res) => {
    const metricsAuthDisabled = process.env.METRICS_AUTH === 'false';
    if (!metricsAuthDisabled) {
        const token = (req.headers['authorization'] || '').split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });
        try { jwt.verify(token, SECRET_KEY); } catch (_) { return res.status(401).json({ error: 'Unauthorized' }); }
    }
    const uptime = Math.floor(process.uptime());
    const mem = process.memoryUsage();
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send([
        `# HELP minepanel_uptime_seconds Total uptime`,
        `# TYPE minepanel_uptime_seconds gauge`,
        `minepanel_uptime_seconds ${uptime}`,
        `# HELP minepanel_memory_heap_used_bytes Heap memory used`,
        `# TYPE minepanel_memory_heap_used_bytes gauge`,
        `minepanel_memory_heap_used_bytes ${mem.heapUsed}`,
        `# HELP minepanel_memory_rss_bytes RSS memory`,
        `# TYPE minepanel_memory_rss_bytes gauge`,
        `minepanel_memory_rss_bytes ${mem.rss}`,
    ].join('\n') + '\n');
});

app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/servers/:serverId/files', fileRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/servers/:serverId/players', playerRoutes);
app.use('/api/servers/:serverId/plugins', pluginRoutes);
app.use('/api/modpacks', modpackRoutes);
app.use('/api/servers/:serverId/pocketmine', pocketmineRoutes);
app.use('/api/servers/:serverId/backups', backupRoutes);
app.use('/api/servers/:serverId/properties', propertiesRoutes);
app.use('/api/servers/:serverId/logs', logRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ranks', rankRoutes);
app.use('/api/servers/:serverId/discord', discordRoutes);
app.use('/api/discord/bots', discordBotsRoutes);
app.use('/api/servers/:serverId/stats', statsRouter);
app.use('/api/stats/config', statsConfigRouter);
app.use('/api/docs', docsRoutes);
app.use('/api/servers/:serverId/automation', automationRoutes);

// SPA catch-all — trimite index.html pentru orice rută non-API (React Router)
app.get(/^(?!\/api\/).*$/, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
    if (err.message === 'Not allowed by CORS') return res.status(403).json({ error: 'Origin not allowed by CORS' });
    if (err.code && err.status && typeof err.toResponse === 'function') return res.status(err.status).json(err.toResponse());
    logger.error('[Global Error]', err);
    const { AppError, E } = require('./core/errors');
    return res.status(500).json(new AppError(E.INTERNAL_ERROR, 500).toResponse());
});

wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const serverId = url.searchParams.get('serverId');
    if (!serverId) { ws.close(4000, 'Missing serverId'); return; }

    let authenticated = false;
    let canWrite = false;
    let authTimeout = setTimeout(() => { if (!authenticated) ws.close(4002, 'Authentication timeout'); }, 5000);
    let statsInterval = null;
    let consoleListener = null, statusListener = null, clearConsoleListener = null, automationLogListener = null;

    ws.on('message', async (message) => {
        try {
            const parsed = JSON.parse(message);
            if (!authenticated) {
                if (parsed.type === 'auth' && parsed.token) {
                    jwt.verify(parsed.token, SECRET_KEY, async (err, user) => {
                        if (err) { ws.close(4001, 'Invalid token'); return; }
                        try {
                            const canRead = await hasPermission(user.id, serverId, 'server.console.read');
                            canWrite = await hasPermission(user.id, serverId, 'server.console.write');
                            if (!canRead) { ws.close(4003, 'Forbidden'); return; }
                            authenticated = true;
                            clearTimeout(authTimeout);
                            const history = processManager.getHistory(serverId);
                            if (history.length > 0) ws.send(JSON.stringify({ type: 'history', data: history }));
                            const initStatus = await executionManager.getStatus(serverId);
                            ws.send(JSON.stringify({ type: 'status', data: initStatus }));
                            consoleListener = (sid, output) => { if (sid === serverId) ws.send(JSON.stringify({ type: 'console', data: output })); };
                            statusListener = (sid, status) => { if (sid === serverId) ws.send(JSON.stringify({ type: 'status', data: status })); };
                            clearConsoleListener = (sid) => { if (sid === serverId) ws.send(JSON.stringify({ type: 'clear_console' })); };
                            automationLogListener = (sid, logLine) => {
                                if (sid.toString() === serverId.toString()) {
                                    ws.send(JSON.stringify({ type: 'automation_log', data: logLine }));
                                }
                            };
                            
                            processManager.on('console', consoleListener);
                            processManager.on('status', statusListener);
                            processManager.on('clear_console', clearConsoleListener);
                            automationEngine.on('log', automationLogListener);

                            statsInterval = setInterval(async () => {
                                if (ws.readyState !== 1) return;
                                try {
                                    ws.send(JSON.stringify({ type: 'stats', data: await executionManager.getStats(serverId) }));
                                } catch (_) {}
                            }, 2000);

                        } catch (e) { ws.close(5000, 'Internal Server Error'); }
                    });
                } else { ws.close(4004, 'Authentication required'); }
                return;
            }
            if (parsed.type === 'command') {
                if (!canWrite) { ws.send(JSON.stringify({ type: 'console', data: '\n[System] Access denied: Missing server.console.write\n' })); return; }
                    processManager.sendCommand(serverId, parsed.data);
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        clearTimeout(authTimeout);
        if (statsInterval) clearInterval(statsInterval);
        if (consoleListener) processManager.removeListener('console', consoleListener);
        if (statusListener) processManager.removeListener('status', statusListener);
        if (clearConsoleListener) processManager.removeListener('clear_console', clearConsoleListener);
        if (automationLogListener) automationEngine.removeListener('log', automationLogListener);
    });
});

const PORT = CONFIG.PORT;

initDb().then(async () => {
    logger.info('Database initialized successfully.');
    statsCollector.start();
    const versionManager = require('./core/versionManager');
    if (typeof versionManager.init === 'function') versionManager.init();

    const { dbRun } = require('./db/database');
    setInterval(async () => {
        try { await dbRun('DELETE FROM account_creation_tokens WHERE expires_at < ?', [new Date().toISOString()]); } catch (err) { logger.error('[Cleanup Error]', err); }
    }, 60 * 60 * 1000);

    try { await migrateServerDirectories(); logger.info('Server directory migration complete.'); } catch (e) { logger.warn('Directory migration warning: ' + e.message); }

    const settings = getSettings();
    if (settings.ftpEnabled === true) {
        try { await initFtpServer(settings.ftpPort || 2121); } catch (ftpErr) { logger.error('Failed to start FTP service: ' + ftpErr.message); }
    } else { logger.info('FTP service is disabled in settings.'); }

    const discordManager = require('./core/discord/discordManager');
    try { await discordManager.startAll(); } catch (e) { logger.warn('[Discord] Init warning: ' + e.message); }

    // ── Auto-Update Scheduler ─────────────────────────────────────────────────
    const UpdateScheduler = require('./core/update/UpdateScheduler');
    try { UpdateScheduler.start(); } catch (e) { logger.warn('[UpdateScheduler] Failed to start: ' + e.message); }

    const { dbAll: dbAllForAutostart } = require('./db/database');
    try {
        const autostartServers = await dbAllForAutostart(`SELECT * FROM servers WHERE autostart = 1`);
        if (autostartServers.length > 0) {
            logger.info(`[Autostart] Found ${autostartServers.length} server(s) to auto-start...`);
            setTimeout(async () => {
                for (const srv of autostartServers) {
                    try {
                        const { getServerDir } = require('./core/serverHelper');
                        const bedrockAdapter = require('./adapters/bedrock');
                        const pocketmineAdapter = require('./adapters/pocketmine');
                        const srvId = srv.id.toString();
                        const serverDir = getServerDir(srv);
                        if (processManager.getStatus(srvId) === 'offline') {
                            logger.info(`[Autostart] Starting server: ${srv.name} (id=${srvId})`);
                            if (bedrockAdapter.isBedrock(srv.software)) {
                                const desc = bedrockAdapter.getBedrockLaunchDescriptor(srv, serverDir);
                                processManager.start(srvId, serverDir, [], desc.executable, srv.ram_mb, [], desc.executable, desc.env, 'bedrock');
                            } else if (pocketmineAdapter.isPocketMine(srv.software)) {
                                const desc = pocketmineAdapter.getPocketMineLaunchDescriptor(srv, serverDir);
                                processManager.start(srvId, serverDir, [], desc.jarFile, srv.ram_mb, desc.customArgs, desc.executable, desc.env, 'pocketmine');
                            } else {
                                const jarFile = require('path').join(serverDir, 'server.jar');
                                const javaManager = require('./core/javaManager');
                                const javaPath = await javaManager.getJavaPath(srv.java_path);
                                processManager.start(srvId, serverDir, [], jarFile, srv.ram_mb, null, javaPath);
                            }
                        }
                    } catch (e) { logger.error(`[Autostart] Failed to start server ${srv.id}: ${e.message}`); }
                }
            }, 3000);
        }
    } catch (e) { logger.warn('[Autostart] Could not load autostart servers: ' + e.message); }

    processManager.on('crash', async (serverId, info) => {
        try {
            const { dbGet: dbGetCrash } = require('./db/database');
            const srv = await dbGetCrash('SELECT * FROM servers WHERE id = ?', [serverId]);
            if (!srv || !srv.autostart_on_crash) return;
            logger.warn(`[CrashRestart] Server ${serverId} crashed. Restarting in 5s...`);
            const { getServerDir } = require('./core/serverHelper');
            const bedrockAdapter = require('./adapters/bedrock');
            const pocketmineAdapter = require('./adapters/pocketmine');
            const serverDir = getServerDir(srv);
            const crashMsg = `\n[MinePanel] Server crashed (exit code ${info.code}). Auto-restarting in 5 seconds...\n`;
            processManager.appendHistory(serverId.toString(), crashMsg);
            processManager.emit('console', serverId.toString(), crashMsg);
            setTimeout(async () => {
                try {
                    if (processManager.getStatus(serverId.toString()) === 'offline') {
                        if (bedrockAdapter.isBedrock(srv.software)) {
                            const desc = bedrockAdapter.getBedrockLaunchDescriptor(srv, serverDir);
                            processManager.start(serverId.toString(), serverDir, [], desc.executable, srv.ram_mb, [], desc.executable, desc.env, 'bedrock');
                        } else if (pocketmineAdapter.isPocketMine(srv.software)) {
                            const desc = pocketmineAdapter.getPocketMineLaunchDescriptor(srv, serverDir);
                            processManager.start(serverId.toString(), serverDir, [], desc.jarFile, srv.ram_mb, desc.customArgs, desc.executable, desc.env, 'pocketmine');
                        } else {
                            const jarFile = require('path').join(serverDir, 'server.jar');
                            const javaManager = require('./core/javaManager');
                            const javaPath = await javaManager.getJavaPath(srv.java_path);
                            processManager.start(serverId.toString(), serverDir, [], jarFile, srv.ram_mb, null, javaPath);
                        }
                    }
                } catch (e) { logger.error(`[CrashRestart] Failed to restart server ${serverId}: ${e.message}`); }
            }, 5000);
        } catch (e) { logger.error(`[CrashRestart] Error handling crash for server ${serverId}: ${e.message}`); }
    });

    global.changePortAndRestart = async (newPort) => {
        try {
            logger.info(`[Server] Changing port to ${newPort} and restarting...`);
            if (global.activeSockets) { for (const s of global.activeSockets) s.destroy(); global.activeSockets.clear(); }
            try { await require('./core/discord/discordManager').destroyAll(); } catch (e) {}
            try { require('./core/ftpServer').stopFtpServer(); } catch (e) {}
            statsCollector.stop();
            server.close(() => { process.exit(100); });
            setTimeout(() => process.exit(100), 2000);
        } catch (err) { logger.error('[Server] Error in changePortAndRestart:', err); process.exit(100); }
    };

    server.on('error', (err) => {
        logger.error('[Server Bind Error]', err);
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') { process.exit(101); }
    });

    if (process.env.NODE_ENV !== 'test') {
        server.listen(PORT, () => {
            logger.info(`MinePanel is running on port ${PORT}`);
            server.timeout = 0;
            server.keepAliveTimeout = 0;
            server.headersTimeout = 0;
            automationEngine.start(PORT, CONFIG.HTTPS_ENABLED);
        });
    }
}).catch(err => { console.error('Failed to initialize database:', err); process.exit(1); });

module.exports = { app, server };

const gracefulShutdown = async (signal) => {
    logger.info(`[${signal}] Shutting down...`);
    statsCollector.stop();
    automationEngine.stop();
    try { require('./core/update/UpdateScheduler').stop(); } catch (_) {}
    try { await require('./core/discord/discordManager').destroyAll(); } catch (_) {}
    process.exit(0);
};
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}
