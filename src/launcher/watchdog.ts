import * as http from 'http';
import * as https from 'https';
import * as path from 'path';
import * as fs from 'fs';
import * as logger from './logger';

export interface WatchdogSettings {
    watchdogEnabled: boolean;
    watchdogInterval: number;
    watchdogTimeout: number;
    watchdogConsecutiveFailures: number;
    watchdogGracefulTimeout: number;
    watchdogMaxRestarts: number;
    watchdogRestartWindow: number; // minutes
    watchdogCooldown: number;      // minutes
}

export const DEFAULT_SETTINGS: WatchdogSettings = {
    watchdogEnabled: true,
    watchdogInterval: 5000,
    watchdogTimeout: 3000,
    watchdogConsecutiveFailures: 3,
    watchdogGracefulTimeout: 10000,
    watchdogMaxRestarts: 5,
    watchdogRestartWindow: 10,
    watchdogCooldown: 5
};

let activeSettings = { ...DEFAULT_SETTINGS };
let timer: NodeJS.Timeout | null = null;
let failedCount = 0;
let pendingCheck = false;
let httpAgent: http.Agent | null = null;
let httpsAgent: https.Agent | null = null;
let backendPort = 8082;
let isHttps = false;

let onWatchdogFailure: (() => void) | null = null;

export function getWatchdogSettings(): WatchdogSettings {
    const settingsPath = process.env.DATA_DIR
        ? path.join(process.env.DATA_DIR, 'settings.json')
        : path.resolve(__dirname, '../../settings.json');
    try {
        if (fs.existsSync(settingsPath)) {
            const raw = fs.readFileSync(settingsPath, 'utf8');
            const data = JSON.parse(raw);
            return {
                watchdogEnabled: data.watchdogEnabled ?? DEFAULT_SETTINGS.watchdogEnabled,
                watchdogInterval: data.watchdogInterval ?? DEFAULT_SETTINGS.watchdogInterval,
                watchdogTimeout: data.watchdogTimeout ?? DEFAULT_SETTINGS.watchdogTimeout,
                watchdogConsecutiveFailures: data.watchdogConsecutiveFailures ?? DEFAULT_SETTINGS.watchdogConsecutiveFailures,
                watchdogGracefulTimeout: data.watchdogGracefulTimeout ?? DEFAULT_SETTINGS.watchdogGracefulTimeout,
                watchdogMaxRestarts: data.watchdogMaxRestarts ?? DEFAULT_SETTINGS.watchdogMaxRestarts,
                watchdogRestartWindow: data.watchdogRestartWindow ?? DEFAULT_SETTINGS.watchdogRestartWindow,
                watchdogCooldown: data.watchdogCooldown ?? DEFAULT_SETTINGS.watchdogCooldown,
            };
        }
    } catch (_) {}
    return DEFAULT_SETTINGS;
}

export function initWatchdog(port: number, httpsEnabled: boolean, onFailure: () => void) {
    backendPort = port;
    isHttps = httpsEnabled;
    onWatchdogFailure = onFailure;
    
    httpAgent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 1, rejectUnauthorized: false });

    reloadWatchdogSettings();
}

export function reloadWatchdogSettings() {
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
    if (timer) return;
    timer = setInterval(performHealthCheck, activeSettings.watchdogInterval);
}

export function stopWatchdogTimer() {
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
    const options: http.RequestOptions = {
        agent: agent || undefined,
        timeout: activeSettings.watchdogTimeout,
        headers: { 'User-Agent': 'MinePanel-Watchdog/1.0' }
    };

    let resolved = false;

    const req = reqLib.get(url, options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            if (resolved) return;
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
                } catch (_) {}
            }
            handleFailure(`HTTP status ${res.statusCode} or invalid body`);
        });
    });

    req.on('timeout', () => {
        if (resolved) return;
        resolved = true;
        pendingCheck = false;
        req.destroy();
        handleFailure('Timeout');
    });

    req.on('error', (err) => {
        if (resolved) return;
        resolved = true;
        pendingCheck = false;
        handleFailure(err.message);
    });
}

function handleFailure(reason: string) {
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
