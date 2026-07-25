"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.protocolEvents = void 0;
exports.setRecoveryStatus = setRecoveryStatus;
exports.startProtocolServer = startProtocolServer;
exports.stopProtocolServer = stopProtocolServer;
const http = __importStar(require("http"));
const events_1 = require("events");
const logger = __importStar(require("./logger"));
exports.protocolEvents = new events_1.EventEmitter();
let server = null;
let launcherPort = 0;
let launcherToken = '';
let recoveryStatus = { active: false };
function setRecoveryStatus(active, reason, attempts) {
    recoveryStatus = { active, reason, attempts };
}
function startProtocolServer(token, portOverride) {
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
                exports.protocolEvents.emit('shutdown');
                return;
            }
            if (req.method === 'POST' && url.pathname === '/internal/restart-request') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'restarting' }));
                exports.protocolEvents.emit('restart');
                return;
            }
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
        });
        // Listen on loopback interface
        const port = portOverride !== undefined ? portOverride : 0;
        server.listen(port, '127.0.0.1', () => {
            const addr = server.address();
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
function stopProtocolServer() {
    return new Promise((resolve) => {
        if (server) {
            server.close(() => {
                logger.info('Protocol', 'Internal HTTP server stopped');
                resolve();
            });
        }
        else {
            resolve();
        }
    });
}
//# sourceMappingURL=protocol.js.map