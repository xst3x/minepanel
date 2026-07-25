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
const crypto = __importStar(require("crypto"));
const logger = __importStar(require("./logger"));
const pm = __importStar(require("./processManager"));
const watchdog = __importStar(require("./watchdog"));
const protocol = __importStar(require("./protocol"));
let launcherToken = '';
let launcherPort = 0;
let watchdogEnabled = false;
const restartTimestamps = [];
let inRecoveryMode = false;
let recoveryTimer = null;
async function bootstrap() {
    logger.info('Supervisor', 'Initializing MinePanel Launcher...');
    launcherToken = crypto.randomBytes(24).toString('hex');
    const portOverride = process.env.LAUNCHER_PORT ? parseInt(process.env.LAUNCHER_PORT, 10) : undefined;
    try {
        launcherPort = await protocol.startProtocolServer(launcherToken, portOverride);
    }
    catch (err) {
        logger.error('Supervisor', `Fatal: Failed to start protocol server: ${err.message}`);
        process.exit(1);
    }
    registerEvents();
    await startBackendWithMonitoring();
}
function registerEvents() {
    protocol.protocolEvents.on('shutdown', () => handleShutdown());
    protocol.protocolEvents.on('restart', () => handleRestart('API request'));
    pm.pmEvents.on('shutdown-requested', () => handleShutdown());
    pm.pmEvents.on('restart-requested', () => handleRestart('Backend request'));
    pm.pmEvents.on('reload-settings-requested', () => {
        logger.info('Supervisor', 'Reloading watchdog settings...');
        watchdog.reloadWatchdogSettings();
    });
    pm.pmEvents.on('backend-ready', () => {
        const settings = watchdog.getWatchdogSettings();
        if (settings.watchdogEnabled) {
            logger.info('Supervisor', 'Backend is ready, activating watchdog...');
            watchdog.initWatchdog(getBackendPort(), isBackendHttps(), () => {
                handleRestart('Watchdog health check failure');
            });
            watchdogEnabled = true;
        }
        else {
            logger.info('Supervisor', 'Backend is ready, watchdog is disabled');
        }
    });
    pm.pmEvents.on('backend-crashed', (info) => {
        logger.warn('Supervisor', `Backend process exited unexpectedly (code: ${info.code}, signal: ${info.signal})`);
        watchdog.stopWatchdogTimer();
        handleBackendCrash();
    });
}
function getBackendPort() {
    return process.env.PORT ? parseInt(process.env.PORT, 10) : 8082;
}
function isBackendHttps() {
    const settingsPath = process.env.DATA_DIR
        ? require('path').join(process.env.DATA_DIR, 'settings.json')
        : require('path').resolve(__dirname, '../../settings.json');
    try {
        if (require('fs').existsSync(settingsPath)) {
            const raw = require('fs').readFileSync(settingsPath, 'utf8');
            const data = JSON.parse(raw);
            return data.https === true;
        }
    }
    catch (_) { }
    return process.env.HTTPS === 'true';
}
async function startBackendWithMonitoring() {
    inRecoveryMode = false;
    protocol.setRecoveryStatus(false);
    if (recoveryTimer) {
        clearTimeout(recoveryTimer);
        recoveryTimer = null;
    }
    await pm.startBackend(launcherPort, launcherToken);
}
async function handleShutdown() {
    logger.info('Supervisor', 'Received shutdown command. Terminating backend...');
    watchdog.stopWatchdogTimer();
    const settings = watchdog.getWatchdogSettings();
    await pm.stopBackend(settings.watchdogGracefulTimeout);
    await protocol.stopProtocolServer();
    logger.info('Supervisor', 'Graceful shutdown completed. Exiting launcher.');
    process.exit(0);
}
async function handleRestart(reason) {
    logger.info('Supervisor', `Executing restart (Reason: ${reason})`);
    watchdog.stopWatchdogTimer();
    const settings = watchdog.getWatchdogSettings();
    await pm.stopBackend(settings.watchdogGracefulTimeout);
    restartTimestamps.push(Date.now());
    await startBackendWithMonitoring();
}
async function handleBackendCrash() {
    if (inRecoveryMode)
        return;
    const settings = watchdog.getWatchdogSettings();
    const now = Date.now();
    const windowMs = settings.watchdogRestartWindow * 60 * 1000;
    const recentCrashes = restartTimestamps.filter(t => (now - t) < windowMs);
    logger.info('Supervisor', `Crashes in current window: ${recentCrashes.length + 1}/${settings.watchdogMaxRestarts}`);
    if (recentCrashes.length >= settings.watchdogMaxRestarts) {
        enterRecoveryMode(`Excessive crashes (${recentCrashes.length + 1}) within ${settings.watchdogRestartWindow} minutes.`);
        return;
    }
    restartTimestamps.push(now);
    logger.info('Supervisor', 'Restarting backend child process...');
    await startBackendWithMonitoring();
}
function enterRecoveryMode(reason) {
    inRecoveryMode = true;
    logger.error('Supervisor', `WATCHDOG ALARM: Entering Recovery Mode. Reason: ${reason}`);
    const settings = watchdog.getWatchdogSettings();
    protocol.setRecoveryStatus(true, reason, restartTimestamps.length);
    const cooldownMs = settings.watchdogCooldown * 60 * 1000;
    logger.info('Supervisor', `Recovery mode active. Auto-retry cooldown scheduled in ${settings.watchdogCooldown} minutes.`);
    recoveryTimer = setTimeout(() => {
        logger.info('Supervisor', 'Recovery cooldown elapsed. Attempting auto-recovery...');
        restartTimestamps.length = 0;
        startBackendWithMonitoring().catch(err => {
            logger.error('Supervisor', `Auto-recovery startup failed: ${err.message}`);
        });
    }, cooldownMs);
}
process.on('SIGINT', () => handleShutdown());
process.on('SIGTERM', () => handleShutdown());
bootstrap().catch(err => {
    logger.error('Supervisor', `Failed to start launcher: ${err.message}`);
    process.exit(1);
});
//# sourceMappingURL=index.js.map