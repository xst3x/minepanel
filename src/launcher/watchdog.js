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
exports.DEFAULT_SETTINGS = void 0;
exports.getWatchdogSettings = getWatchdogSettings;
exports.initWatchdog = initWatchdog;
exports.reloadWatchdogSettings = reloadWatchdogSettings;
exports.stopWatchdogTimer = stopWatchdogTimer;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const logger = __importStar(require("./logger"));
exports.DEFAULT_SETTINGS = {
    watchdogEnabled: true,
    watchdogInterval: 5000,
    watchdogTimeout: 3000,
    watchdogConsecutiveFailures: 3,
    watchdogGracefulTimeout: 10000,
    watchdogMaxRestarts: 5,
    watchdogRestartWindow: 10,
    watchdogCooldown: 5
};
let activeSettings = { ...exports.DEFAULT_SETTINGS };
let timer = null;
let failedCount = 0;
let pendingCheck = false;
let httpAgent = null;
let httpsAgent = null;
let backendPort = 8082;
let isHttps = false;
let onWatchdogFailure = null;
function getWatchdogSettings() {
    const settingsPath = process.env.DATA_DIR
        ? path.join(process.env.DATA_DIR, 'settings.json')
        : path.resolve(__dirname, '../../settings.json');
    try {
        if (fs.existsSync(settingsPath)) {
            const raw = fs.readFileSync(settingsPath, 'utf8');
            const data = JSON.parse(raw);
            return {
                watchdogEnabled: data.watchdogEnabled ?? exports.DEFAULT_SETTINGS.watchdogEnabled,
                watchdogInterval: data.watchdogInterval ?? exports.DEFAULT_SETTINGS.watchdogInterval,
                watchdogTimeout: data.watchdogTimeout ?? exports.DEFAULT_SETTINGS.watchdogTimeout,
                watchdogConsecutiveFailures: data.watchdogConsecutiveFailures ?? exports.DEFAULT_SETTINGS.watchdogConsecutiveFailures,
                watchdogGracefulTimeout: data.watchdogGracefulTimeout ?? exports.DEFAULT_SETTINGS.watchdogGracefulTimeout,
                watchdogMaxRestarts: data.watchdogMaxRestarts ?? exports.DEFAULT_SETTINGS.watchdogMaxRestarts,
                watchdogRestartWindow: data.watchdogRestartWindow ?? exports.DEFAULT_SETTINGS.watchdogRestartWindow,
                watchdogCooldown: data.watchdogCooldown ?? exports.DEFAULT_SETTINGS.watchdogCooldown,
            };
        }
    }
    catch (_) { }
    return exports.DEFAULT_SETTINGS;
}
function initWatchdog(port, httpsEnabled, onFailure) {
    backendPort = port;
    isHttps = httpsEnabled;
    onWatchdogFailure = onFailure;
    httpAgent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 1, rejectUnauthorized: false });
    reloadWatchdogSettings();
}
function reloadWatchdogSettings() {
    const newSettings = getWatchdogSettings();
    activeSettings = { ...newSettings };
    logger.info('Watchdog', `Watchdog settings loaded: enabled=${activeSettings.watchdogEnabled}, interval=${activeSettings.watchdogInterval}ms, timeout=${activeSettings.watchdogTimeout}ms`);
    stopWatchdogTimer();
    failedCount = 0;
    if (activeSettings.watchdogEnabled) {
        startWatchdogTimer();
    }
}
function startWatchdogTimer() {
    if (timer)
        return;
    timer = setInterval(performHealthCheck, activeSettings.watchdogInterval);
}
function stopWatchdogTimer() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    pendingCheck = false;
}
function performHealthCheck() {
    if (pendingCheck) {
        logger.warn('Watchdog', 'Previous health check still pending, skipping this tick');
        return;
    }
    pendingCheck = true;
    const protocol = isHttps ? 'https' : 'http';
    const agent = isHttps ? httpsAgent : httpAgent;
    const url = `${protocol}://127.0.0.1:${backendPort}/health`;
    const reqLib = isHttps ? https : http;
    const options = {
        agent: agent || undefined,
        timeout: activeSettings.watchdogTimeout,
        headers: { 'User-Agent': 'MinePanel-Watchdog/1.0' }
    };
    let resolved = false;
    const req = reqLib.get(url, options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            if (resolved)
                return;
            resolved = true;
            pendingCheck = false;
            if (res.statusCode === 200) {
                try {
                    const parsed = JSON.parse(body);
                    if (parsed && parsed.status === 'ok') {
                        if (failedCount > 0) {
                            logger.info('Watchdog', `Backend healthy again. Uptime: ${parsed.uptime}s`);
                        }
                        failedCount = 0;
                        return;
                    }
                }
                catch (_) { }
            }
            handleFailure(`HTTP status ${res.statusCode} or invalid body`);
        });
    });
    req.on('timeout', () => {
        if (resolved)
            return;
        resolved = true;
        pendingCheck = false;
        req.destroy();
        handleFailure('Timeout');
    });
    req.on('error', (err) => {
        if (resolved)
            return;
        resolved = true;
        pendingCheck = false;
        handleFailure(err.message);
    });
}
function handleFailure(reason) {
    failedCount++;
    logger.warn('Watchdog', `Backend health check failed (${failedCount}/${activeSettings.watchdogConsecutiveFailures}): ${reason}`);
    if (failedCount >= activeSettings.watchdogConsecutiveFailures) {
        logger.error('Watchdog', `Backend failed consecutive checks. Triggering recovery...`);
        failedCount = 0;
        stopWatchdogTimer();
        if (onWatchdogFailure) {
            onWatchdogFailure();
        }
    }
}
//# sourceMappingURL=watchdog.js.map