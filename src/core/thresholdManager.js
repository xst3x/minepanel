// src/core/thresholdManager.js
// Multi-threshold escalation system for MinePanel.
// Replaces the single-value tempThresholdCelsius with a full escalation ladder.
// Each server has a list of thresholds: [{ value, metric, action, label, enabled }]
// Supported metrics: cpu_temperature, ram_percent
// Supported actions: log, notify, alert, throttle, restart, stop

'use strict';

const os        = require('os');
const fs        = require('fs');
const path      = require('path');
const { exec }  = require('child_process');
const pidusage  = require('pidusage');
const { dbAll } = require('../db/database');
const processManager = require('./processManager');
const logger    = require('./utils/logger');

// ── Constants ─────────────────────────────────────────────────────────────────
const CHECK_INTERVAL_MS = 10_000;
const COOLDOWN_MS       = 60_000;
const IS_WINDOWS        = process.platform === 'win32';

// Action severity order — used to enforce ordering validation
const ACTION_SEVERITY = {
    log:      0,
    notify:   1,
    alert:    2,
    throttle: 3,
    restart:  4,
    stop:     5,
};

// Valid metrics and their allowed ranges
const METRIC_CONFIG = {
    cpu_temperature: { min: 0,  max: 150, unit: '°C' },
    ram_percent:     { min: 0,  max: 100, unit: '%'  },
};

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validates a threshold rule array and returns { valid, errors }.
 * @param {string} metric
 * @param {Array}  thresholds
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateThresholds(metric, thresholds) {
    const errors = [];
    const metaCfg = METRIC_CONFIG[metric];

    if (!metaCfg) {
        errors.push(`Unknown metric "${metric}". Allowed: ${Object.keys(METRIC_CONFIG).join(', ')}`);
        return { valid: false, errors };
    }

    if (!Array.isArray(thresholds)) {
        errors.push('Thresholds must be an array.');
        return { valid: false, errors };
    }

    if (thresholds.length > 20) {
        errors.push('Maximum of 20 thresholds allowed per metric.');
    }

    const values = [];
    const actions = [];

    thresholds.forEach((t, i) => {
        const idx = `Threshold #${i + 1}`;

        // value
        const val = Number(t.value);
        if (isNaN(val)) {
            errors.push(`${idx}: value must be a number.`);
        } else if (val < metaCfg.min || val > metaCfg.max) {
            errors.push(`${idx}: value ${val} is outside the allowed range (${metaCfg.min}–${metaCfg.max}${metaCfg.unit}).`);
        } else {
            if (values.includes(val)) {
                errors.push(`${idx}: duplicate threshold value ${val}${metaCfg.unit}.`);
            } else {
                values.push(val);
            }
        }

        // action
        if (!t.action || !(t.action in ACTION_SEVERITY)) {
            errors.push(`${idx}: invalid action "${t.action}". Allowed: ${Object.keys(ACTION_SEVERITY).join(', ')}`);
        } else {
            actions.push({ idx: i, val: isNaN(val) ? null : val, action: t.action });
        }
    });

    // Sort by value and check severity ordering
    const sorted = [...actions]
        .filter(a => a.val !== null)
        .sort((a, b) => a.val - b.val);

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        if (ACTION_SEVERITY[curr.action] < ACTION_SEVERITY[prev.action]) {
            errors.push(
                `Action "${curr.action}" at ${curr.val}${metaCfg.unit} has lower severity than ` +
                `"${prev.action}" at ${prev.val}${metaCfg.unit}. ` +
                `Higher values must have equal or greater severity.`
            );
        }
    }

    return { valid: errors.length === 0, errors };
}

// ── Schema helpers ────────────────────────────────────────────────────────────

/**
 * Default threshold rules schema for a new server.
 */
function defaultRules() {
    return {
        cpu_temperature: {
            enabled: false,
            thresholds: [
                { id: 'thr_1', value: 70, action: 'alert',    label: 'High Temp',     enabled: true },
                { id: 'thr_2', value: 80, action: 'throttle', label: 'Critical Temp', enabled: true },
                { id: 'thr_3', value: 90, action: 'stop',     label: 'Emergency',     enabled: true },
            ]
        },
        ram_percent: {
            enabled: false,
            thresholds: [
                { id: 'thr_4', value: 80, action: 'alert',  label: 'High RAM',   enabled: true },
                { id: 'thr_5', value: 95, action: 'stop',   label: 'RAM Critical', enabled: true },
            ]
        }
    };
}

/**
 * Parse raw JSON string from DB into a rules object, merging defaults.
 */
function parseRules(raw) {
    const defaults = defaultRules();
    if (!raw) return defaults;
    try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        // Merge per metric
        const result = {};
        for (const metric of Object.keys(defaults)) {
            result[metric] = {
                ...defaults[metric],
                ...(parsed[metric] || {}),
                thresholds: (parsed[metric]?.thresholds || defaults[metric].thresholds)
                    .map(t => ({
                        id:      t.id      || `thr_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
                        value:   Number(t.value),
                        action:  t.action,
                        label:   t.label   || t.action,
                        enabled: t.enabled !== false,
                    }))
                    .sort((a, b) => a.value - b.value),
            };
        }
        return result;
    } catch (_) {
        return defaults;
    }
}

// ── Active state per server ───────────────────────────────────────────────────

// cooldowns[serverId][metric][thrId] = lastFiredTimestamp
const cooldowns = new Map();

function getCooldown(sid, metric, thrId) {
    if (!cooldowns.has(sid)) cooldowns.set(sid, {});
    const sc = cooldowns.get(sid);
    if (!sc[metric]) sc[metric] = {};
    return sc[metric][thrId] || 0;
}
function setCooldown(sid, metric, thrId) {
    if (!cooldowns.has(sid)) cooldowns.set(sid, {});
    const sc = cooldowns.get(sid);
    if (!sc[metric]) sc[metric] = {};
    sc[metric][thrId] = Date.now();
}

// stopping[serverId] = true (prevents double-stop)
const stopping = new Map();

// ── System metric collectors ──────────────────────────────────────────────────

function getCpuTemperature() {
    const platform = os.platform();
    try {
        if (platform === 'linux') {
            const base = '/sys/class/thermal';
            if (fs.existsSync(base)) {
                const zones = fs.readdirSync(base).filter(z => z.startsWith('thermal_zone'));
                for (const zone of zones) {
                    const typePath = path.join(base, zone, 'type');
                    const tempPath = path.join(base, zone, 'temp');
                    if (!fs.existsSync(typePath) || !fs.existsSync(tempPath)) continue;
                    const type = fs.readFileSync(typePath, 'utf8').trim().toLowerCase();
                    if (type.includes('x86_pkg_temp') || type.includes('cpu')) {
                        const raw = parseInt(fs.readFileSync(tempPath, 'utf8').trim(), 10);
                        if (!isNaN(raw)) return raw / 1000;
                    }
                }
            }
        }
        // Windows optional helper file
        const helperFile = path.join(__dirname, '../../data/cpu_temp.txt');
        if (fs.existsSync(helperFile)) {
            const val = parseFloat(fs.readFileSync(helperFile, 'utf8').trim());
            if (!isNaN(val)) return val;
        }
    } catch (_) {}
    return null;
}

async function getRamPercent(pid) {
    try {
        const stats = await pidusage(pid);
        const totalMem = os.totalmem();
        return (stats.memory / totalMem) * 100;
    } catch (_) {
        return null;
    }
}

// ── Throttle helpers (re-use from throttleManager pattern) ───────────────────

const suspendJobs = new Map();

function applyWindowsThrottle(sid, pid, pct) {
    // Clear previous
    const old = suspendJobs.get(sid);
    if (old) { clearInterval(old); suspendJobs.delete(sid); }

    const cycle  = 200;
    const runMs  = Math.round(cycle * (pct / 100));
    const susMs  = cycle - runMs;
    if (susMs <= 0) return;

    const psSuspend = `$h=Add-Type -Name K${sid} -Namespace W -PassThru -MemberDefinition '[DllImport("kernel32.dll")]public static extern IntPtr OpenThread(int a,bool b,int c);[DllImport("kernel32.dll")]public static extern int SuspendThread(IntPtr h);';(Get-Process -Id ${pid} -EA 0).Threads|%{$t=$h::OpenThread(2,0,$_.Id);if($t-ne-1){$h::SuspendThread($t)|Out-Null}}`;
    const psResume  = `$h=Add-Type -Name K${sid} -Namespace W -PassThru -MemberDefinition '[DllImport("kernel32.dll")]public static extern IntPtr OpenThread(int a,bool b,int c);[DllImport("kernel32.dll")]public static extern int ResumeThread(IntPtr h);';(Get-Process -Id ${pid} -EA 0).Threads|%{$t=$h::OpenThread(2,0,$_.Id);if($t-ne-1){$h::ResumeThread($t)|Out-Null}}`;

    let sus = false;
    const iv = setInterval(() => {
        if (!sus) {
            setTimeout(() => {
                if (!suspendJobs.has(sid)) return;
                exec(`powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "${psSuspend}"`, () => {});
                sus = true;
            }, runMs);
        } else {
            exec(`powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "${psResume}"`, () => {});
            sus = false;
        }
    }, cycle);
    suspendJobs.set(sid, iv);
}

function removeWindowsThrottle(sid, pid) {
    const iv = suspendJobs.get(sid);
    if (!iv) return;
    clearInterval(iv);
    suspendJobs.delete(sid);
    if (pid) {
        const psResume = `$h=Add-Type -Name K${sid} -Namespace W -PassThru -MemberDefinition '[DllImport("kernel32.dll")]public static extern IntPtr OpenThread(int a,bool b,int c);[DllImport("kernel32.dll")]public static extern int ResumeThread(IntPtr h);';(Get-Process -Id ${pid} -EA 0).Threads|%{$t=$h::OpenThread(2,0,$_.Id);if($t-ne-1){$h::ResumeThread($t)|Out-Null}}`;
        exec(`powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "${psResume}"`, () => {});
    }
}

const throttleApplied = new Map(); // sid -> pct currently applied

function setThrottle(sid, pid, pct) {
    if (throttleApplied.get(sid) === pct) return;
    throttleApplied.set(sid, pct);
    if (IS_WINDOWS) {
        applyWindowsThrottle(sid, pid, pct);
    } else {
        const { spawn } = require('child_process');
        const child = spawn('cpulimit', ['-p', String(pid), '-l', String(pct), '-z'], { stdio: 'ignore', detached: false });
        child.on('error', () => exec(`renice -n ${pct >= 75 ? 0 : pct >= 40 ? 10 : 19} -p ${pid}`, () => {}));
    }
    logger.info(`[ThresholdManager] Throttle server ${sid} PID ${pid} @ ${pct}%`);
}

function clearThrottle(sid) {
    if (!throttleApplied.has(sid)) return;
    const pct = throttleApplied.get(sid);
    throttleApplied.delete(sid);
    const child = processManager.processes.get(sid);
    const pid = child && child.pid;
    if (IS_WINDOWS) {
        removeWindowsThrottle(sid, pid);
    } else if (pid) {
        exec(`renice -n 0 -p ${pid}`, () => {});
    }
    logger.info(`[ThresholdManager] Throttle cleared for server ${sid} (was ${pct}%)`);
}

// ── Action dispatcher ─────────────────────────────────────────────────────────

async function fireAction(sid, metric, threshold, currentValue) {
    const metaCfg = METRIC_CONFIG[metric];
    const unit    = metaCfg?.unit || '';
    const { action, label, value } = threshold;
    const child = processManager.processes.get(sid);
    const pid   = child && child.pid;

    const consoleMsg = `[MinePanel] ⚠ THRESHOLD "${label}": ${metric} = ${currentValue.toFixed(1)}${unit} ≥ ${value}${unit} → Action: ${action.toUpperCase()}`;

    logger.warn(`[ThresholdManager] Server ${sid} — ${consoleMsg}`);
    processManager.emit('console', sid, `\n${consoleMsg}\n`);

    switch (action) {
        case 'log':
            // Already logged above
            break;

        case 'notify':
        case 'alert':
            try {
                processManager.sendCommand(sid, `say [MinePanel] ${label}: ${metric.replace('_', ' ')} at ${currentValue.toFixed(1)}${unit}!`);
            } catch (_) {}
            break;

        case 'throttle': {
            // Progressive: 80% throttle at first throttle threshold, 50% and 25% for subsequent ones
            if (!pid) break;
            const pct = throttleApplied.has(sid)
                ? Math.max(25, (throttleApplied.get(sid) || 80) - 30)
                : 80;
            setThrottle(sid, pid, pct);
            try { processManager.sendCommand(sid, `say [MinePanel] CPU throttled to ${pct}% due to ${label}.`); } catch (_) {}
            break;
        }

        case 'restart':
            if (!stopping.get(sid)) {
                stopping.set(sid, true);
                processManager.emit('console', sid, `\n[MinePanel] 🔄 RESTART triggered by threshold "${label}".\n`);
                try { processManager.sendCommand(sid, `say [MinePanel] Server restarting due to ${label}.`); } catch (_) {}
                setTimeout(async () => {
                    try {
                        await processManager.gracefulStop(sid, 15000);
                        await new Promise(r => setTimeout(r, 3000));
                        // Fetch fresh server data to restart
                        const { dbGet } = require('../db/database');
                        const server = await dbGet('SELECT * FROM servers WHERE id = ?', [sid]);
                        if (server) await processManager.start(server);
                    } catch (_) {}
                    stopping.delete(sid);
                }, 5000);
            }
            break;

        case 'stop':
            if (!stopping.get(sid)) {
                stopping.set(sid, true);
                processManager.emit('console', sid, `\n[MinePanel] 🛑 STOP triggered by threshold "${label}" (${currentValue.toFixed(1)}${unit} ≥ ${value}${unit}).\n`);
                try { processManager.sendCommand(sid, `say [MinePanel] Server stopping due to ${label}!`); } catch (_) {}
                setTimeout(() => {
                    try { processManager.gracefulStop(sid, 15000); } catch (_) {}
                    stopping.delete(sid);
                }, 5000);
            }
            break;
    }
}

// ── Main check cycle ──────────────────────────────────────────────────────────

async function checkThresholds() {
    let servers;
    try { servers = await dbAll('SELECT id, name, ram_mb, threshold_rules FROM servers'); }
    catch (err) { logger.error('[ThresholdManager] DB error:', err); return; }

    const cpuTemp = getCpuTemperature();
    const now     = Date.now();

    for (const server of servers) {
        const sid    = String(server.id);
        const status = processManager.getStatus(sid);
        const rules  = parseRules(server.threshold_rules);

        if (status !== 'online') {
            clearThrottle(sid);
            stopping.delete(sid);
            continue;
        }

        const child = processManager.processes.get(sid);
        const pid   = child && child.pid;

        for (const [metric, cfg] of Object.entries(rules)) {
            if (!cfg.enabled) continue;

            let currentValue = null;
            if (metric === 'cpu_temperature') {
                currentValue = cpuTemp;
            } else if (metric === 'ram_percent' && pid) {
                currentValue = await getRamPercent(pid);
            }

            if (currentValue === null) continue;

            // Find the highest triggered threshold
            const triggered = cfg.thresholds
                .filter(t => t.enabled && currentValue >= t.value)
                .sort((a, b) => b.value - a.value);

            if (triggered.length === 0) {
                // Below all thresholds — clear throttle if it was from this metric
                if (metric === 'cpu_temperature') clearThrottle(sid);
                continue;
            }

            const highest = triggered[0];
            const cdKey   = highest.id;
            const lastFired = getCooldown(sid, metric, cdKey);

            if (now - lastFired > COOLDOWN_MS) {
                setCooldown(sid, metric, cdKey);
                await fireAction(sid, metric, highest, currentValue);
            }
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

let timer = null;

function start() {
    if (timer) return;
    logger.info('[ThresholdManager] Starting — escalation check every 10s.');
    checkThresholds();
    timer = setInterval(checkThresholds, CHECK_INTERVAL_MS);
}

function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    logger.info('[ThresholdManager] Stopped.');
}

module.exports = {
    start,
    stop,
    parseRules,
    validateThresholds,
    defaultRules,
    ACTION_SEVERITY,
    METRIC_CONFIG,
};
