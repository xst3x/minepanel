import * as http from 'http';
import { EventEmitter } from 'events';
import * as logger from './logger';

export const protocolEvents = new EventEmitter();

let server: http.Server | null = null;
let launcherPort: number = 0;
let launcherToken: string = '';
let recoveryStatus: { active: boolean; reason?: string; attempts?: number } = { active: false };

export function setRecoveryStatus(active: boolean, reason?: string, attempts?: number) {
    recoveryStatus = { active, reason, attempts };
}

export function startProtocolServer(token: string, portOverride?: number): Promise<number> {
    launcherToken = token;
    return new Promise((resolve, reject) => {
        server = http.createServer((req, res) => {
            // Check auth header
            const authHeader = req.headers['authorization'];
            if (!authHeader || authHeader !== `Bearer ${launcherToken}`) {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Unauthorized' }));
                return;
            }

            const url = new URL(req.url || '', `http://${req.headers.host}`);

            if (req.method === 'GET' && url.pathname === '/internal/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                const body = {
                    status: recoveryStatus.active ? 'recovery' : 'ok',
                    uptime: Math.floor(process.uptime()),
                    version: '1.0.0',
                    timestamp: Date.now(),
                    ...(recoveryStatus.active ? {
                        reason: recoveryStatus.reason || 'crashes',
                        restartAttempts: recoveryStatus.attempts || 0
                    } : {})
                };
                res.end(JSON.stringify(body));
                return;
            }

            if (req.method === 'GET' && url.pathname === '/internal/version') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ version: '1.0.0' }));
                return;
            }

            if (req.method === 'POST' && url.pathname === '/internal/shutdown') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'shutting_down' }));
                protocolEvents.emit('shutdown');
                return;
            }

            if (req.method === 'POST' && url.pathname === '/internal/restart-request') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'restarting' }));
                protocolEvents.emit('restart');
                return;
            }

            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        });

        // Listen on loopback interface
        const port = portOverride !== undefined ? portOverride : 0;
        server.listen(port, '127.0.0.1', () => {
            const addr = server!.address();
            launcherPort = typeof addr === 'object' && addr ? addr.port : 0;
            logger.info('Protocol', `Internal HTTP server running on 127.0.0.1:${launcherPort}`);
            resolve(launcherPort);
        });

        server.on('error', (err) => {
            logger.error('Protocol', `Failed to start protocol server: ${err.message}`);
            reject(err);
        });
    });
}

export function stopProtocolServer(): Promise<void> {
    return new Promise((resolve) => {
        if (server) {
            server.close(() => {
                logger.info('Protocol', 'Internal HTTP server stopped');
                resolve();
            });
        } else {
            resolve();
        }
    });
}
