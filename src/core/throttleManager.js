// src/core/throttleManager.js
// Monitors RAM and CPU temperature for each server.
// When temperature is high, applies REAL CPU throttle on the Java process
// (progressive: light / medium / heavy based on how far above threshold).
// When RAM is high, warns or stops the server.

const os       = require('os');
const fs       = require('fs');
const path     = require('path');
const { exec, spawn } = require('child_process');
const pidusage = require('pidusage');
const { dbAll, dbGet } = require('../db/database');
const processManager = require('./processManager');
const logger   = require('./utils/logger');

const CHECK_INTERVAL_MS = 10 * 1000; // check every 10 seconds
const IS_WINDOWS        = process.platform === 'win32';

// ── CPU Throttle levels ───────────────────────────────────────────────────────
// deltaAbove: degrees above threshold that trigger this level
// cpuLimitPct: max CPU% the Java process is allowed to use
const THROTTLE_LEVELS = [
    { deltaAbove: 0,  cpuLimitPct: 80, label: 'light'  },
    { deltaAbove: 5,  cpuLimitPct: 50, label: 'medium' },
    { deltaAbove: 10, cpuLimitPct: 25, label: 'heavy'  },
];

// ── Active throttle state per server ─────────────────────────────────────────
const throttleState = new Map(); // serverId -> { level: null|string }
function getState(sid) {
    if (!throttleState.has(sid)) throttleState.set(sid, { level: null });
    return throttleState.get(sid);
}

// ── Cooldowns ─────────────────────────────────────────────────────────────────
const cooldowns = new Map();
const WARN_COOLDOWN_MS = 60 * 1000;
function getCooldown(sid) {
    if (!cooldowns.has(sid)) cooldowns.set(sid, {});
    return cooldowns.get(sid);
}

// ── System helpers ────────────────────────────────────────────────────────────

/**
 * Get RAM used by a specific PID in bytes.
 * Returns null if PID is unavailable.
 */
async function getProcessRamBytes(pid) {
    try {
        const stats = await pidusage(pid);
        return stats.memory; // bytes
    } catch (_) {
        return null;
    }
}

function getCpuTemperature() {
    // Linux: thermal zones
    try {
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
            for (const zone of zones) {
                const tempPath = path.join(base, zone, 'temp');
                if (fs.existsSync(tempPath)) {
                    const raw = parseInt(fs.readFileSync(tempPath, 'utf8').trim(), 10);
                    if (!isNaN(raw) && raw > 1000) return raw / 1000;
                }
            }
        }
    } catch (_) {}

    // Windows: optional cpu_temp.txt written by external helper
    try {
        const f = path.join(__dirname, '../../data/cpu_temp.txt');
        if (fs.existsSync(f)) {
            const val = parseFloat(fs.readFileSync(f, 'utf8').trim());
            if (!isNaN(val)) return val;
        }
    } catch (_) {}

    return null;
}

function parseConfig(raw) {
    const defaults = {
        enabled: false,
        ramEnabled: false,
        ramThresholdMb: 0,        // 0 = use ramThresholdPercent of server's ram_mb
        ramThresholdPercent: 85,  // % of server's allocated ram_mb (e.g. -Xmx)
        ramAction: 'warn',
        tempEnabled: false, tempThresholdCelsius: 80, tempAction: 'warn',
        tempThrottleEnabled: false,
    };
    if (!raw) return defaults;
    try {
        return { ...defaults, ...(typeof raw === 'string' ? JSON.parse(raw) : raw) };
    } catch (_) { return defaults; }
}

// ── Windows CPU throttle: suspend/resume duty cycle ──────────────────────────
// Achieves e.g. 50% CPU by suspending all threads for half of each 200ms cycle.

const suspendJobs = new Map(); // serverId -> intervalId

function startWindowsThrottle(sid, pid, cpuLimitPct) {
    stopWindowsThrottle(sid);

    const cycleLenMs = 200;
    const runMs      = Math.round(cycleLenMs * (cpuLimitPct / 100));
    const suspendMs  = cycleLenMs - runMs;
    if (suspendMs <= 0) return;

    // PowerShell snippets to suspend/resume all threads of a process by PID
    const psSuspend = `$h=Add-Type -Name K -Namespace W -PassThru -MemberDefinition '[DllImport(\"kernel32.dll\")]public static extern IntPtr OpenThread(int a,bool b,int c);[DllImport(\"kernel32.dll\")]public static extern int SuspendThread(IntPtr h);';(Get-Process -Id ${pid} -EA 0).Threads|%{$t=$h::OpenThread(2,0,$_.Id);if($t-ne-1){$h::SuspendThread($t)|Out-Null}}`;
    const psResume  = `$h=Add-Type -Name K -Namespace W -PassThru -MemberDefinition '[DllImport(\"kernel32.dll\")]public static extern IntPtr OpenThread(int a,bool b,int c);[DllImport(\"kernel32.dll\")]public static extern int ResumeThread(IntPtr h);';(Get-Process -Id ${pid} -EA 0).Threads|%{$t=$h::OpenThread(2,0,$_.Id);if($t-ne-1){$h::ResumeThread($t)|Out-Null}}`;

    let suspended = false;

    const iv = setInterval(() => {
        if (!suspended) {
            setTimeout(() => {
                if (!suspendJobs.has(sid)) return;
                exec(`powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "${psSuspend}"`, () => {});
                suspended = true;
            }, runMs);
        } else {
            exec(`powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "${psResume}"`, () => {});
            suspended = false;
        }
    }, cycleLenMs);

    suspendJobs.set(sid, iv);
    logger.info(`[ThrottleManager] Windows CPU throttle ON — server ${sid} PID ${pid} @ ${cpuLimitPct}%`);
}

function stopWindowsThrottle(sid) {
    const iv = suspendJobs.get(sid);
    if (!iv) return;
    clearInterval(iv);
    suspendJobs.delete(sid);
}

function resumeWindowsProcess(pid) {
    if (!pid) return;
    const psResume = `$h=Add-Type -Name K -Namespace W -PassThru -MemberDefinition '[DllImport(\"kernel32.dll\")]public static extern IntPtr OpenThread(int a,bool b,int c);[DllImport(\"kernel32.dll\")]public static extern int ResumeThread(IntPtr h);';(Get-Process -Id ${pid} -EA 0).Threads|%{$t=$h::OpenThread(2,0,$_.Id);if($t-ne-1){$h::ResumeThread($t)|Out-Null}}`;
    exec(`powershell -NoProfile -NonInteractive -WindowStyle Hidden -Command "${psResume}"`, () => {});
}

// ── Linux CPU throttle: cpulimit or renice fallback ───────────────────────────

const cpulimitProcs = new Map(); // serverId -> ChildProcess

function startLinuxThrottle(sid, pid, cpuLimitPct) {
    stopLinuxThrottle(sid);

    const child = spawn('cpulimit', ['-p', String(pid), '-l', String(cpuLimitPct), '-z'], {
        stdio: 'ignore', detached: false
    });

    child.on('error', () => {
        // cpulimit not installed — use renice as fallback
        const niceVal = cpuLimitPct >= 75 ? 0 : cpuLimitPct >= 40 ? 10 : 19;
        exec(`renice -n ${niceVal} -p ${pid}`, (err) => {
            if (!err) logger.info(`[ThrottleManager] renice ${niceVal} applied to PID ${pid} (server ${sid})`);
        });
    });

    child.on('exit', () => cpulimitProcs.delete(sid));
    cpulimitProcs.set(sid, child);
    logger.info(`[ThrottleManager] Linux CPU throttle ON — server ${sid} PID ${pid} @ ${cpuLimitPct}%`);
}

function stopLinuxThrottle(sid) {
    const proc = cpulimitProcs.get(sid);
    if (!proc) return;
    try { proc.kill('SIGTERM'); } catch (_) {}
    cpulimitProcs.delete(sid);
}

// ── Apply / remove throttle ───────────────────────────────────────────────────

function applyThrottle(sid, levelLabel, cpuLimitPct) {
    const state = getState(sid);
    if (state.level === levelLabel) return; // already at this level, no change

    const child = processManager.processes.get(sid);
    if (!child || !child.pid) return;

    state.level = levelLabel;

    if (IS_WINDOWS) {
        startWindowsThrottle(sid, child.pid, cpuLimitPct);
    } else {
        startLinuxThrottle(sid, child.pid, cpuLimitPct);
    }
}

function removeThrottle(sid) {
    const state = getState(sid);
    if (!state.level) return;

    state.level = null;

    if (IS_WINDOWS) {
        stopWindowsThrottle(sid);
        const child = processManager.processes.get(sid);
        resumeWindowsProcess(child && child.pid);
    } else {
        stopLinuxThrottle(sid);
        const child = processManager.processes.get(sid);
        if (child && child.pid) exec(`renice -n 0 -p ${child.pid}`, () => {});
    }

    logger.info(`[ThrottleManager] CPU throttle removed for server ${sid}`);
}

// ── Main check cycle ──────────────────────────────────────────────────────────

async function checkThrottles() {
    let servers;
    try { servers = await dbAll('SELECT id, name, ram_mb, throttle_config FROM servers'); }
    catch (err) { logger.error('[ThrottleManager] DB error:', err); return; }

    const cpuTemp = getCpuTemperature();
    const now     = Date.now();

    for (const server of servers) {
        const sid    = server.id.toString();
        const status = processManager.getStatus(sid);
        const cfg    = parseConfig(server.throttle_config);

        // Server offline or throttle disabled — clean up
        if (status !== 'online' || !cfg.enabled) {
            removeThrottle(sid);
            continue;
        }

        const cd = getCooldown(sid);

        // ── RAM check (per-process) ────────────────────────────────────────
        if (cfg.ramEnabled) {
            const child = processManager.processes.get(sid);
            if (child && child.pid) {
                getProcessRamBytes(child.pid).then(memBytes => {
                    if (memBytes === null) {
                        // Unable to get process memory, skip RAM check for this cycle
                        return;
                    }
                    const serverRamMb = server.ram_mb; // MB
                    const procMemMb   = memBytes / (1024 * 1024);
                    const ramPct      = (procMemMb / serverRamMb) * 100;

                    if (ramPct >= cfg.ramThresholdPercent) {
                        if (cfg.ramAction === 'stop' && !cd.ramStopping) {
                            cd.ramStopping = true;
                            processManager.emit('console', sid,
                                `\n[MinePanel] ⚠ THROTTLE: Process RAM ${ramPct.toFixed(1)}% ≥ ${cfg.ramThresholdPercent}% — stopping server in 10s.\n`);
                            try { processManager.sendCommand(sid, `say [MinePanel] High RAM usage! Server shutting down in 10 seconds.`); } catch (_) {}
                            setTimeout(() => { try { processManager.gracefulStop(sid, 15000); } catch (_) {} }, 10000);
                        } else if (cfg.ramAction === 'warn' && (!cd.lastRamWarn || now - cd.lastRamWarn > WARN_COOLDOWN_MS)) {
                            processManager.emit('console', sid,
                                `\n[MinePanel] ⚠ RAM WARNING: Process RAM at ${ramPct.toFixed(1)}% (limit: ${cfg.ramThresholdPercent}%).\n`);
                            try { processManager.sendCommand(sid, `say [MinePanel] Warning: High process RAM (${ramPct.toFixed(1)}%)!`); } catch (_) {}
                            cd.lastRamWarn = now;
                        }
                    } else {
                        cd.ramStopping = false;
                        cd.lastRamWarn = null;
                    }
                }).catch(err => {
                    logger.error(`[ThrottleManager] PID usage error for server ${sid}:`, err);
                });
            }
        }

        // ── CPU Temperature — real throttle ──────────────────────────────────
        if (cfg.tempEnabled && cpuTemp !== null) {
            const delta = cpuTemp - cfg.tempThresholdCelsius;

            if (delta >= 0) {
                // Find which throttle level applies
                let chosen = THROTTLE_LEVELS[0];
                for (const lvl of THROTTLE_LEVELS) {
                    if (delta >= lvl.deltaAbove) chosen = lvl;
                }

                // Apply real CPU throttle if enabled
                if (cfg.tempThrottleEnabled) {
                    applyThrottle(sid, chosen.label, chosen.cpuLimitPct);
                }

                // Console + in-game warning (with cooldown)
                if (!cd.lastTempWarn || now - cd.lastTempWarn > WARN_COOLDOWN_MS) {
                    const throttleInfo = cfg.tempThrottleEnabled
                        ? ` CPU throttled to ${chosen.cpuLimitPct}% [${chosen.label}].`
                        : '';
                    processManager.emit('console', sid,
                        `\n[MinePanel] 🌡 TEMP: ${cpuTemp.toFixed(1)}°C (limit: ${cfg.tempThresholdCelsius}°C).${throttleInfo}\n`);
                    try { processManager.sendCommand(sid, `say [MinePanel] CPU temp ${cpuTemp.toFixed(1)}°C!${throttleInfo}`); } catch (_) {}
                    cd.lastTempWarn = now;
                }

                // Hard stop at heavy level if action = stop
                if (cfg.tempAction === 'stop' && chosen.label === 'heavy' && !cd.tempStopping) {
                    cd.tempStopping = true;
                    processManager.emit('console', sid,
                        `\n[MinePanel] 🌡 CRITICAL: ${cpuTemp.toFixed(1)}°C — stopping server to protect hardware.\n`);
                    try { processManager.sendCommand(sid, `say [MinePanel] CRITICAL temperature! Server shutting down now!`); } catch (_) {}
                    setTimeout(() => { try { processManager.gracefulStop(sid, 15000); } catch (_) {} }, 5000);
                }

            } else {
                // Below threshold — lift throttle
                removeThrottle(sid);
                cd.lastTempWarn = null;
                cd.tempStopping = false;
            }
        } else if (!cfg.tempEnabled) {
            removeThrottle(sid);
        }
    }
}

// ── Public API ────────────────────────────────────────────────────────────

let timer = null;

function start() {
    if (timer) return;
    logger.info('[ThrottleManager] Starting — CPU throttle check every 10s.');
    checkThrottles();
    timer = setInterval(checkThrottles, CHECK_INTERVAL_MS);
}

function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    for (const sid of throttleState.keys()) removeThrottle(sid);
    logger.info('[ThrottleManager] Stopped.');
}

function getSystemStats() {
    // This function is kept for compatibility with the UI, but now returns process RAM% and CPU temp
    // However, note: the UI expects system RAM% and CPU temp? We changed to per-process.
    // We'll return the process RAM% for the first online server? Or we can return a placeholder.
    // Actually, the UI uses this to show live stats in the throttle settings tab.
    // We'll return the process RAM% and CPU temp for the first server? But the UI is per server.
    // We'll change the UI to use the new endpoint `:serverId/throttle-system-stats` which we will create.
    // For now, we return null for both to avoid errors.
    return { ramPercent: null, cpuTemp: getCpuTemperature() };
}

module.exports = { start, stop, getSystemStats, parseConfig };