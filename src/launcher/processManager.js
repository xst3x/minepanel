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
exports.pmEvents = void 0;
exports.getChildProcess = getChildProcess;
exports.startBackend = startBackend;
exports.stopBackend = stopBackend;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const logger = __importStar(require("./logger"));
const events_1 = require("events");
exports.pmEvents = new events_1.EventEmitter();
let child = null;
let isShuttingDown = false;
function getChildProcess() {
    return child;
}
function startBackend(port, token) {
    isShuttingDown = false;
    return new Promise((resolve) => {
        const backendScript = path.resolve(__dirname, '../minepanel.js');
        logger.info('ProcessManager', `Starting backend child process...`);
        // Spawn with IPC channel enabled
        child = (0, child_process_1.spawn)(process.execPath, [backendScript], {
            stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
            env: {
                ...process.env,
                MINEPANEL_SERVER: 'true',
                MINEPANEL_MANAGED_BY_LAUNCHER: 'true',
                LAUNCHER_PORT: String(port),
                LAUNCHER_TOKEN: token
            }
        });
        child.on('message', (message) => {
            if (message && typeof message === 'object') {
                if (message.type === 'restart') {
                    logger.info('ProcessManager', 'Received restart request from backend IPC');
                    exports.pmEvents.emit('restart-requested');
                }
                else if (message.type === 'shutdown') {
                    logger.info('ProcessManager', 'Received shutdown request from backend IPC');
                    exports.pmEvents.emit('shutdown-requested');
                }
                else if (message.type === 'reload-settings') {
                    logger.info('ProcessManager', 'Received reload-settings request from backend IPC');
                    exports.pmEvents.emit('reload-settings-requested');
                }
                else if (message.type === 'ready') {
                    logger.info('ProcessManager', 'Backend reported readiness');
                    exports.pmEvents.emit('backend-ready');
                }
            }
        });
        child.on('exit', (code, signal) => {
            logger.info('ProcessManager', `Backend exited with code ${code}, signal ${signal}`);
            child = null;
            if (!isShuttingDown) {
                exports.pmEvents.emit('backend-crashed', { code, signal });
            }
        });
        resolve();
    });
}
async function stopBackend(gracefulTimeoutMs) {
    if (!child)
        return;
    isShuttingDown = true;
    logger.info('ProcessManager', 'Stopping backend gracefully...');
    child.kill('SIGTERM');
    return new Promise((resolve) => {
        let exited = false;
        const timeout = setTimeout(() => {
            if (exited)
                return;
            if (child) {
                logger.warn('ProcessManager', `Backend did not exit in ${gracefulTimeoutMs}ms. Sending SIGKILL.`);
                child.kill('SIGKILL');
            }
        }, gracefulTimeoutMs);
        const checkInterval = setInterval(() => {
            if (!child) {
                exited = true;
                clearTimeout(timeout);
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);
    });
}
//# sourceMappingURL=processManager.js.map