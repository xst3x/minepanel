require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

// --- Launcher Process Logic (must be the absolute first thing) ---
if (process.env.MINEPANEL_SERVER !== 'true' && process.env.NODE_ENV !== 'test') {
    const { spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');
    const { updateEnvPort } = require('./core/utils/envHelper');

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
                // Port change initiated!
                lastKnownGoodPort = currentPort;
                console.log('[Launcher] Re-launching server on new port...');
                startServer();
            } else if (code === 101) {
                // Port bind failure during startup! Revert and restart.
                console.error(`[Launcher] Server failed to bind to port. Rolling back to last known good port ${lastKnownGoodPort}...`);
                try {
                    updateEnvPort(lastKnownGoodPort);
                } catch (err) {
                    console.error('[Launcher] Failed to update rollback port in .env:', err.message);
                }
                startServer();
            } else {
                // Standard termination (PM2 stop, SIGINT, or crash)
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
const backupRoutes = require('./routes/backupRoutes');
const propertiesRoutes = require('./routes/propertiesRoutes');
const logRoutes = require('./routes/logRoutes');
const discordRoutes = require('./routes/discordRoutes');
const discordBotsRoutes = require('./routes/discordBotsRoutes');
const userRoutes = require('./routes/userRoutes');
const rankRoutes = require('./routes/rankRoutes');
const processManager = require('./core/processManager');
const { initFtpServer } = require('./core/ftpServer');
const { authenticateToken } = require('./core/auth');
const SECRET_KEY = process.env.JWT_SECRET;
const { hasPermission } = require('./core/permissions');
const { migrateServerDirectories } = require('./core/serverHelper');
const CONFIG = require('./config');
const jwt = require('jsonwebtoken');
const logger = require('./core/utils/logger');

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
        console.error(`  Key:  ${keyPath}`);
        console.error(`  Cert: ${certPath}`);
        console.error(`  Run this command to generate self-signed certs for local dev:`);
        console.error(`  mkdir certs && openssl req -x509 -newkey rsa:4096 -keyout certs/key.pem -out certs/cert.pem -days 365 -nodes -subj "/CN=localhost"`);
        process.exit(1);
    }
    const sslOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
    };
    
    // Create the secure HTTPS server running the main Express app
    secureServer = https.createServer(sslOptions, app);
    console.log('[HTTPS] Running in HTTPS mode');
    
    // Create the redirecting HTTP server
    redirectServer = http.createServer((req, res) => {
        res.writeHead(301, { "Location": `https://${req.headers.host}${req.url}` });
        res.end();
    });
    
    secureServer.on('error', (err) => console.error('[Secure Server Error]', err));
    redirectServer.on('error', (err) => console.error('[Redirect Server Error]', err));
    
    const activeSockets = new Set();
    global.activeSockets = activeSockets;
    
    // Create a TCP server (net) to sniff incoming connections on the same port
    server = net.createServer((socket) => {
        activeSockets.add(socket);
        socket.on('close', () => activeSockets.delete(socket));
        
        socket.once('data', (buffer) => {
            // Pause socket to avoid data loss while switching handlers
            socket.pause();
            
            // Check the first byte: 22 (0x16) is the handshake byte for TLS/SSL (HTTPS)
            if (buffer[0] === 22) {
                secureServer.emit('connection', socket);
            } else {
                redirectServer.emit('connection', socket);
            }
            
            // Push the buffer back and resume
            socket.unshift(buffer);
            process.nextTick(() => socket.resume());
        });
        
        socket.on('error', (err) => {
            // Suppress noise like ECONNRESET from socket aborts
            if (err.code !== 'ECONNRESET') {
                console.error('[Sniffer Socket Error]', err.message);
            }
        });
    });
} else {
    server = http.createServer(app);
    console.log('[HTTP] Running in HTTP mode (use Nginx + Let\'s Encrypt for production HTTPS)');
    
    const activeSockets = new Set();
    global.activeSockets = activeSockets;
    server.on('connection', (socket) => {
        activeSockets.add(socket);
        socket.on('close', () => activeSockets.delete(socket));
    });
}
// ----------------------------------

const wss = new WebSocket.Server({ server: CONFIG.HTTPS_ENABLED ? secureServer : server, path: '/ws' });

const allowedOrigins = CONFIG.ALLOWED_ORIGINS;
if (allowedOrigins.length === 0) {
    console.warn('[CORS] No allowed origins configured. All requests will be denied.');
}
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no Origin header (e.g., same‑origin) or when wildcard is configured
        if (!origin) {
            return callback(null, true);
        }
        // If config contains '*', allow any origin; otherwise check whitelist
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
}));
// --- Security Headers ---
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' ws: wss: https:; frame-ancestors 'none'");
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    next();
});
app.use(express.json({ limit: '10mb' }));

let cachedSettings = null;
let lastCacheTime = 0;

const getSettings = () => {
    const now = Date.now();
    if (cachedSettings && (now - lastCacheTime < 30000)) {
        return cachedSettings;
    }
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

// Global Rate Limiter (exempt large upload endpoints)
const globalRateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: CONFIG.RATE_LIMIT,
    message: { error: 'Too many requests from this IP, please try again later.' }
});

app.use('/api/', (req, res, next) => {
    if (req.path === '/servers/import') return next(); // no rate limit on imports
    return globalRateLimiter(req, res, next);
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        version: require('../package.json').version,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

// Serve static assets from root directory
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/servers/:serverId/files', fileRoutes);
// Global one-time token download (no auth — token is the credential, set by fileRoutes)
app.use('/api/files', fileRoutes);
app.use('/api/servers/:serverId/players', playerRoutes);
app.use('/api/servers/:serverId/plugins', pluginRoutes);
app.use('/api/servers/:serverId/backups', backupRoutes);
app.use('/api/servers/:serverId/properties', propertiesRoutes);
app.use('/api/servers/:serverId/logs', logRoutes);
app.use('/api/users', userRoutes);
app.use('/api/ranks', rankRoutes);
app.use('/api/servers/:serverId/discord', discordRoutes);
app.use('/api/discord/bots', discordBotsRoutes);

// Global Error Handler (prevents HTML error pages)
app.use((err, req, res, next) => {
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: 'Origin not allowed by CORS' });
    }
    // AppError instances have a structured toResponse()
    if (err.code && err.status && typeof err.toResponse === 'function') {
        return res.status(err.status).json(err.toResponse());
    }
    logger.error('[Global Error]', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// WebSocket connections
wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const serverId = url.searchParams.get('serverId');

    if (!serverId) {
        ws.close(4000, 'Missing serverId');
        return;
    }

    let authenticated = false;
    let canWrite = false;
    let authTimeout = setTimeout(() => {
        if (!authenticated) {
            ws.close(4002, 'Authentication timeout');
        }
    }, 5000);

    let statsInterval = null;
    let consoleListener = null;
    let statusListener = null;
    let clearConsoleListener = null;

    ws.on('message', async (message) => {
        try {
            const parsed = JSON.parse(message);

            if (!authenticated) {
                if (parsed.type === 'auth' && parsed.token) {
                    jwt.verify(parsed.token, SECRET_KEY, async (err, user) => {
                        if (err) {
                            ws.close(4001, 'Invalid token');
                            return;
                        }
                        try {
                            const canRead = await hasPermission(user.id, serverId, 'server.console.read');
                            canWrite = await hasPermission(user.id, serverId, 'server.console.write');

                            if (!canRead) {
                                ws.close(4003, 'Forbidden');
                                return;
                            }

                            authenticated = true;
                            clearTimeout(authTimeout);

                            const history = processManager.getHistory(serverId);
                            if (history.length > 0) ws.send(JSON.stringify({ type: 'history', data: history }));
                            ws.send(JSON.stringify({ type: 'status', data: processManager.getStatus(serverId) }));

                            consoleListener = (emittedServerId, output) => {
                                if (emittedServerId === serverId) ws.send(JSON.stringify({ type: 'console', data: output }));
                            };
                            statusListener = (emittedServerId, status) => {
                                if (emittedServerId === serverId) ws.send(JSON.stringify({ type: 'status', data: status }));
                            };
                            clearConsoleListener = (emittedServerId) => {
                                if (emittedServerId === serverId) ws.send(JSON.stringify({ type: 'clear_console' }));
                            };

                            processManager.on('console', consoleListener);
                            processManager.on('status', statusListener);
                            processManager.on('clear_console', clearConsoleListener);

                            statsInterval = setInterval(async () => {
                                if (ws.readyState === 1) {
                                    try {
                                        const stats = await processManager.getStats(serverId);
                                        ws.send(JSON.stringify({ type: 'stats', data: stats }));
                                    } catch (_) {}
                                }
                            }, 2000);
                        } catch (e) {
                            ws.close(5000, 'Internal Server Error');
                        }
                    });
                } else {
                    ws.close(4004, 'Authentication required');
                }
                return;
            }

            if (parsed.type === 'command') {
                if (!canWrite) {
                    ws.send(JSON.stringify({ type: 'console', data: '\n[System] Access denied: Missing server.console.write\n' }));
                    return;
                }
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
    });
});

const PORT = CONFIG.PORT;

initDb().then(async () => {
    logger.info('Database initialized successfully.');

    // Initialize version manager
    const versionManager = require('./core/versionManager');
    versionManager.init();

    // Start hourly cleanup for expired invite tokens
    const { dbRun } = require('./db/database');
    setInterval(async () => {
        try {
            await dbRun('DELETE FROM account_creation_tokens WHERE expires_at < ?', [new Date().toISOString()]);
        } catch (err) {
            logger.error('[Cleanup Error] Failed to delete expired tokens:', err);
        }
    }, 60 * 60 * 1000);
    
    // Migrate server directories from numeric to named
    try {
        await migrateServerDirectories();
        logger.info('Server directory migration complete.');
    } catch (e) {
        logger.warn('Directory migration warning: ' + e.message);
    }

    // Start FTP Server
    const settings = getSettings();
    if (settings.ftpEnabled === true) {
        try {
            await initFtpServer(settings.ftpPort || 2121);
        } catch (ftpErr) {
            logger.error('Failed to start FTP service: ' + ftpErr.message);
        }
    } else {
        logger.info('FTP service is disabled in settings.');
    }

    // Start Discord bots for all enabled integrations
    const discordManager = require('./core/discord/discordManager');
    try {
        await discordManager.startAll();
    } catch (e) {
        logger.warn('[Discord] Init warning: ' + e.message);
    }

    // Global port switch and restart trigger
    global.changePortAndRestart = async (newPort) => {
        try {
            logger.info(`[Server] Re-routing server port to ${newPort} and triggering restart...`);

            // 1. Destroy all active connections immediately
            if (global.activeSockets) {
                for (const socket of global.activeSockets) {
                    socket.destroy();
                }
                global.activeSockets.clear();
            }

            // 2. Gracefully clean up active Discord bots
            try {
                const discordManager = require('./core/discord/discordManager');
                await discordManager.destroyAll();
                logger.info('[Server] Discord bots disconnected.');
            } catch (e) {
                logger.error('[Server] Discord bots cleanup error: ' + e.message);
            }

            // 3. Gracefully stop active FTP server
            try {
                const { stopFtpServer } = require('./core/ftpServer');
                stopFtpServer();
                logger.info('[Server] FTP service stopped.');
            } catch (e) {
                logger.error('[Server] FTP cleanup error: ' + e.message);
            }

            // 4. Close the server listener and exit with code 100
            server.close(() => {
                logger.info('[Server] Core listeners closed. Exiting process with code 100 for port switch.');
                process.exit(100);
            });

            // Fail-safe: force exit after 2 seconds if socket close hangs
            setTimeout(() => {
                logger.warn('[Server] Force exiting process with code 100.');
                process.exit(100);
            }, 2000);
        } catch (err) {
            logger.error('[Server] Error in changePortAndRestart:', err);
            // Still try to exit with 100 so the launcher can restart
            process.exit(100);
        }
    };

    // Attach server socket bind error handlers to catch EADDRINUSE / EACCES
    server.on('error', (err) => {
        logger.error('[Server Bind Error]', err);
        if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
            logger.error(`[Server] Failed to bind to port ${PORT}. Exiting with code 101 for self-healing rollback.`);
            process.exit(101);
        }
    });

    if (process.env.NODE_ENV !== 'test') {
        server.listen(PORT, () => {
            logger.info(`MinePanel is running on port ${PORT}`);
            if (CONFIG.HTTPS_ENABLED) {
                secureServer.timeout = 0;
                secureServer.keepAliveTimeout = 0;
                secureServer.headersTimeout = 0;
                redirectServer.timeout = 0;
                redirectServer.keepAliveTimeout = 0;
                redirectServer.headersTimeout = 0;
            } else {
                server.timeout = 0;
                server.keepAliveTimeout = 0;
                server.headersTimeout = 0;
            }
        });
    }
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});

module.exports = { app, server };

// Graceful shutdown — destroy all Discord bots
const gracefulShutdown = async (signal) => {
    logger.info(`[${signal}] Shutting down...`);
    try {
        const dm = require('./core/discord/discordManager');
        await dm.destroyAll();
    } catch (_) {}
    process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}
