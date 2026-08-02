/**
 * Real Process Manager — manages actual server child processes.
 * Used in worker and test environments.
 * Extracted from processManager.js — single responsibility.
 */
import { spawn } from 'child_process'
import EventEmitter = require('events')
import path = require('path')
import pidusage = require('pidusage')
import os = require('os')
import bedrockAdapter = require('../adapters/bedrock')
const { parseBedrockOutput } = bedrockAdapter;
import pocketmineAdapter = require('../adapters/pocketmine')
const { parsePocketMineOutput } = pocketmineAdapter;
import processPersistence = require('./process-persistence')
const { saveRunningServers, loadRunningServers } = processPersistence;
import processOutputParser = require('./process-output-parser')
const { parseServerStderr } = processOutputParser;
import consoleStatsParser = require('./utils/consoleStatsParser')
const { parseTpsFromHistoryText, parsePlayersFromHistoryText, parseTpsFromLine, isTpsConsoleNoise, isTpsUnknownCommand, isTpsCommandException, isStacktraceLine, isTpsErrorTrailer } = consoleStatsParser;
import fs = require('fs')
import { execFileSync } from 'child_process'

// ── Privilege drop for Minecraft server processes ──────────────────────────
// If MinePanel itself runs as root (common on quick VPS setups), spawned
// Java/Bedrock/PocketMine processes inherit that by default — a plugin/mod
// RCE would then mean full root on the box. When MC_RUN_AS_USER is set and
// the panel is root, we resolve that user's uid/gid once, chown the server
// directory to it, and drop privileges via spawn({ uid, gid }) — the same
// mechanism sudo/su use under the hood.
const RUN_AS_USER = (process.env.MC_RUN_AS_USER || '').trim();
let _runAsIds: { uid: number; gid: number } | null | undefined = undefined;

function resolveRunAsIds(): { uid: number; gid: number } | null {
    if (_runAsIds !== undefined) return _runAsIds;
    _runAsIds = null;
    if (process.platform === 'win32') return _runAsIds; // no POSIX uid/gid concept
    if (typeof process.getuid !== 'function' || process.getuid() !== 0) return _runAsIds; // panel isn't root — nothing to drop
    if (!RUN_AS_USER) {
        console.warn('[ProcessManager] MinePanel is running as root and MC_RUN_AS_USER is not set — server processes will run as ROOT. Set MC_RUN_AS_USER in .env (see docs/configuration.md).');
        return _runAsIds;
    }
    try {
        const uid = parseInt(execFileSync('id', ['-u', RUN_AS_USER]).toString().trim(), 10);
        const gid = parseInt(execFileSync('id', ['-g', RUN_AS_USER]).toString().trim(), 10);
        if (!Number.isNaN(uid) && !Number.isNaN(gid) && uid !== 0) {
            _runAsIds = { uid, gid };
            console.log(`[ProcessManager] Server processes will be de-escalated to user "${RUN_AS_USER}" (uid=${uid}, gid=${gid}).`);
        } else {
            console.error(`[ProcessManager] MC_RUN_AS_USER="${RUN_AS_USER}" resolved to uid ${uid} — refusing to use it (must be a non-root user).`);
        }
    } catch (e) {
        console.error(`[ProcessManager] MC_RUN_AS_USER="${RUN_AS_USER}" was not found on this system. Create it first, e.g.: useradd -r -M -s /usr/sbin/nologin ${RUN_AS_USER}`);
    }
    return _runAsIds;
}

function ensureOwnership(dir: string, uid: number, gid: number) {
    try {
        const st = fs.statSync(dir);
        if ((st as any).uid === uid && (st as any).gid === gid) return; // already correct — skip the recursive chown
        execFileSync('chown', ['-R', `${uid}:${gid}`, dir]);
    } catch (e: any) {
        console.error(`[ProcessManager] Failed to chown "${dir}" to ${uid}:${gid} — server may fail to write files:`, e.message);
    }
}

/**
 * System-wide CPU sampler — diffs os.cpus() tick counters every second to
 * report the host's total CPU usage across all cores (the same technique the
 * `systeminformation` module uses internally, kept dependency-free here).
 */
class SystemCpuSampler {
    private _last: { idle: number; total: number } | null = null;
    private _value = 0;
    private _timer: NodeJS.Timeout | null = null;

    start(intervalMs = 1000): this {
        if (this._timer) return this;
        this._sample();
        this._timer = setInterval(() => this._sample(), intervalMs);
        if (typeof this._timer.unref === 'function') this._timer.unref();
        return this;
    }

    get value() {
        return this._value;
    }

    private _sample() {
        try {
            const cpus = os.cpus();
            let idle = 0;
            let total = 0;
            for (const core of cpus) {
                idle += core.times.idle;
                total += core.times.idle + core.times.user + core.times.nice + core.times.sys + core.times.irq;
            }
            if (this._last && total > this._last.total) {
                const dIdle = idle - this._last.idle;
                const dTotal = total - this._last.total;
                const pct = 100 * (1 - dIdle / dTotal);
                this._value = Math.min(100, Math.max(0, pct));
            }
            this._last = { idle, total };
        } catch (_) { }
    }
}

class RealProcessManager extends EventEmitter {
    private processes: Map<string, any> = new Map();
    private histories: Map<string, string[]> = new Map();
    private locks: Set<string> = new Set();
    private lockTimers: Map<string, NodeJS.Timeout> = new Map();
    private _stopIntents: Set<string> = new Set();
    private _crashRestartTimers: Map<string, NodeJS.Timeout> = new Map();
    private _bedrockServers: Set<string> = new Set();
    private _pocketmineServers: Set<string> = new Set();
    private _startedAt: Map<string, number> = new Map();
    private _cachedTps: Map<string, number | null> = new Map();
    private _cachedPlayers: Map<string, number> = new Map();
    private _lastStatsParse: Map<string, number> = new Map();
    private _tpsPollAt: Map<string, number> = new Map();
    private _tpsErrorDump: Map<string, number> = new Map();
    private _readyServers: Set<string> = new Set();
    private _tpsTimer: NodeJS.Timeout | null = null;
    private _systemCpu = new SystemCpuSampler().start();

    private static readonly TPS_POLL_INTERVAL_MS = 5000;
    private static readonly TPS_POLL_WINDOW_MS = 8000;

    constructor() {
        super();
    }

    // ─── Recovery ────────────────────────────────────────────────────────

    recoverRunningServers() {
        const isWorker = process.env.MINEPANEL_PROCESS === 'worker';
        if (!isWorker) return;

        console.log('[ProcessManager] Re-syncing running servers on boot...');
        const running = loadRunningServers();
        for (const entry of running) {
            const { serverId, pid, startInfo } = entry;
            try {
                process.kill(pid, 0);

                console.log(`[ProcessManager] Recovered running server ${serverId} on PID ${pid}`);

                const placeholder = {
                    pid,
                    recovered: true,
                    startInfo,
                    stdin: {
                        write: () => {
                            console.warn(`[ProcessManager] Cannot write commands directly to recovered server ${serverId}`);
                        }
                    },
                    kill: (signal) => {
                        try {
                            if (process.platform === 'win32') {
                                require('child_process').execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
                            } else {
                                process.kill(pid, signal || 'SIGKILL');
                            }
                        } catch (e) { }
                    }
                };

                this.processes.set(serverId, placeholder);
                this._startedAt.set(serverId, Date.now());

                const checkTimer = setInterval(() => {
                    try {
                        process.kill(pid, 0);
                    } catch (e) {
                        clearInterval(checkTimer);
                        console.log(`[ProcessManager] Recovered server ${serverId} exited.`);
                        this.processes.delete(serverId);
                        this.emit('status', serverId, 'offline');
                        const msg = `\n[MinePanel] Recovered server process exited.\n`;
                        this.appendHistory(serverId, msg);
                        this.emit('console', serverId, msg);
                        saveRunningServers(this.processes);
                    }
                }, 3000);

                setTimeout(() => {
                    this.emit('status', serverId, 'online');
                }, 100);

            } catch (err) {
                console.log(`[ProcessManager] Server ${serverId} (PID ${pid}) was not running on boot. Skipping.`);
            }
        }
        saveRunningServers(this.processes);
    }

    // ─── Locking ─────────────────────────────────────────────────────────

    acquireLock(serverId, timeoutMs = 60000) {
        const idStr = serverId.toString();
        if (this.locks.has(idStr)) return false;
        this.locks.add(idStr);

        if (this.lockTimers.has(idStr)) {
            clearTimeout(this.lockTimers.get(idStr));
        }

        const timer = setTimeout(() => {
            if (this.locks.has(idStr)) {
                console.warn(`[ProcessManager] Lock for server ${idStr} auto-released after ${timeoutMs}ms timeout`);
                this.locks.delete(idStr);
                this.lockTimers.delete(idStr);
            }
        }, timeoutMs);
        this.lockTimers.set(idStr, timer);
        return true;
    }

    acquireLockForce(serverId) {
        const idStr = serverId.toString();
        this.locks.add(idStr);
        if (this.lockTimers.has(idStr)) {
            clearTimeout(this.lockTimers.get(idStr));
        }
        const timer = setTimeout(() => {
            this.locks.delete(idStr);
            this.lockTimers.delete(idStr);
        }, 60000);
        this.lockTimers.set(idStr, timer);
        return true;
    }

    releaseLock(serverId) {
        const idStr = serverId.toString();
        this.locks.delete(idStr);
        if (this.lockTimers.has(idStr)) {
            clearTimeout(this.lockTimers.get(idStr));
            this.lockTimers.delete(idStr);
        }
    }

    isLocked(serverId) {
        return this.locks.has(serverId.toString());
    }

    // ─── Lifecycle ──────────────────────────────────────────────────────

    start(serverId, serverDir, javaArgs, jarFile, maxMemoryMb, customArgs = null, javaPath = 'java', spawnEnv = null, mode = 'java') {
        if (this.processes.has(serverId)) {
            throw new Error('Server is already running');
        }

        if (this._crashRestartTimers.has(serverId)) {
            clearTimeout(this._crashRestartTimers.get(serverId));
            this._crashRestartTimers.delete(serverId);
        }
        this._stopIntents.delete(serverId);

        const isBedrock = mode === 'bedrock';
        const isPocketMine = mode === 'pocketmine';

        if (isBedrock) this._bedrockServers.add(serverId);
        else this._bedrockServers.delete(serverId);

        if (isPocketMine) this._pocketmineServers.add(serverId);
        else this._pocketmineServers.delete(serverId);

        let args;
        if (isBedrock) {
            args = [];
        } else if (isPocketMine) {
            args = customArgs || [];
        } else if (customArgs && customArgs.length > 0) {
            args = [
                `-Xms${maxMemoryMb}M`,
                `-Xmx${maxMemoryMb}M`,
                ...javaArgs,
                ...customArgs
            ];
        } else {
            args = [
                `-Xms${maxMemoryMb}M`,
                `-Xmx${maxMemoryMb}M`,
                ...javaArgs,
                '-jar',
                jarFile,
                'nogui'
            ];
        }

        console.log(`Starting server ${serverId} with args:`, args);

        const spawnOptions: any = {
            cwd: serverDir,
            stdio: ['pipe', 'pipe', 'pipe']
        };
        if (spawnEnv) {
            spawnOptions.env = spawnEnv;
        }

        // De-escalate: never let a Minecraft server process run as root.
        const runAs = resolveRunAsIds();
        if (runAs) {
            ensureOwnership(serverDir, runAs.uid, runAs.gid);
            spawnOptions.uid = runAs.uid;
            spawnOptions.gid = runAs.gid;
            // Root's env (HOME=/root etc.) isn't readable by the dropped-to user —
            // give the child a HOME it can actually write to.
            spawnOptions.env = { ...(spawnOptions.env || process.env), HOME: serverDir, USER: RUN_AS_USER, LOGNAME: RUN_AS_USER };
        }

        const child: any = spawn(javaPath, args, spawnOptions);
        child.startInfo = { serverDir, javaArgs, jarFile, maxMemoryMb, customArgs, javaPath, spawnEnv, mode };

        this.processes.set(serverId, child);
        this._startedAt.set(serverId, Date.now());
        this._lastStatsParse.delete(serverId);
        this._tpsPollAt.delete(serverId);
        this._tpsErrorDump.delete(serverId);
        this._readyServers.delete(serverId);
        this._cachedTps.delete(serverId);
        this._cachedPlayers.delete(serverId);
        saveRunningServers(this.processes);
        this._ensureTpsPolling();

        child.stdin?.on('error', (err) => {
            console.error(`[ProcessManager] Server ${serverId} stdin error:`, err.message);
        });

        child.stdout?.on('data', (data) => {
            const raw = data.toString();
            let output = raw;
            if (this._bedrockServers.has(serverId)) output = parseBedrockOutput(raw);
            else if (this._pocketmineServers.has(serverId)) output = parsePocketMineOutput(raw);
            // Gate TPS polling until the world has actually finished loading —
            // querying /tps before that throws a console NPE on Paper/Spigot
            // ("Cannot invoke CommandSourceStack.getLevel()... is null").
            if (!this._readyServers.has(serverId) && /Done \([\d.]+s\)! For help/i.test(raw)) {
                this._readyServers.add(serverId);
            }
            // No-plugin TPS polling: swallow /tps responses and command echo so the
            // dashboard console and history stay clean.
            if (this._handleTpsPollOutput(serverId, output)) return;
            this.appendHistory(serverId, output);
            this.emit('console', serverId, output);
        });

        child.stderr?.on('data', (data) => {
            const raw = data.toString();
            let output = raw;
            if (this._bedrockServers.has(serverId)) output = parseBedrockOutput(raw);
            else if (this._pocketmineServers.has(serverId)) output = parsePocketMineOutput(raw);

            output = parseServerStderr(serverId, output);

            this.appendHistory(serverId, output);
            this.emit('console', serverId, output);
        });

        child.on('close', (code) => {
            console.log(`Server ${serverId} exited with code ${code}`);
            const msg = `\n[MinePanel] Server process exited with code ${code}\n`;
            this.appendHistory(serverId, msg);
            this.emit('console', serverId, msg);
            this.processes.delete(serverId);
            this._bedrockServers.delete(serverId);
            this._pocketmineServers.delete(serverId);
            this._startedAt.delete(serverId);
            this._tpsPollAt.delete(serverId);
            this._tpsErrorDump.delete(serverId);
            this._readyServers.delete(serverId);
            this._cachedTps.delete(serverId);
            this._cachedPlayers.delete(serverId);
            this._lastStatsParse.delete(serverId);
            saveRunningServers(this.processes);
            this.emit('status', serverId, 'offline');

            const wasIntentional = this._stopIntents.has(serverId);
            this._stopIntents.delete(serverId);

            const isCrash = !wasIntentional && code !== 0 && code !== null;
            if (isCrash) {
                this.emit('crash', serverId, { code, serverDir, javaArgs, jarFile, maxMemoryMb, customArgs, javaPath, spawnEnv });
            }
        });

        child.on('error', (err) => {
            console.error(`Server ${serverId} process error:`, err.message);
            let errMsg = err.message;
            if (err.code === 'ENOENT') {
                if (this._pocketmineServers.has(serverId)) {
                    errMsg = 'PHP executable not found. PocketMine-MP requires PHP 8.x — install it from https://windows.php.net/download/ and add it to PATH.';
                } else if (!this._bedrockServers.has(serverId)) {
                    errMsg = 'Java executable not found. Make sure Java is installed and in your system PATH.';
                } else {
                    errMsg = `Server binary not found at: ${javaPath}`;
                }
            }
            const msg = `\n[MinePanel] Server process failed to start: ${errMsg}\n`;
            this.appendHistory(serverId, msg);
            this.emit('console', serverId, msg);
            this.processes.delete(serverId);
            this._startedAt.delete(serverId);
            this._tpsPollAt.delete(serverId);
            this._tpsErrorDump.delete(serverId);
            this._readyServers.delete(serverId);
            this._cachedTps.delete(serverId);
            this._cachedPlayers.delete(serverId);
            this._lastStatsParse.delete(serverId);
            saveRunningServers(this.processes);
            this.emit('status', serverId, 'offline');
        });

        this.emit('status', serverId, 'online');
    }

    stop(serverId) {
        this._stopIntents.add(serverId);
        this.sendCommand(serverId, 'stop');
    }

    gracefulStop(serverId, timeoutMs = 15000) {
        return new Promise<any>((resolve) => {
            const child = this.processes.get(serverId);
            if (!child) {
                return resolve({ graceful: true, wasRunning: false });
            }

            let resolved = false;
            let timer: any;
            const onStatus = (emittedId: any, status: any) => {
                if (emittedId === serverId && status === 'offline' && !resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    this.removeListener('status', onStatus);
                    resolve({ graceful: true, wasRunning: true });
                }
            };

            this.on('status', onStatus);

            try {
                this.sendCommand(serverId, 'stop');
            } catch (e) {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    this.removeListener('status', onStatus);
                    resolve({ graceful: true, wasRunning: false });
                }
                return;
            }

            timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this.removeListener('status', onStatus);
                    resolve({ graceful: false, wasRunning: true });
                }
            }, timeoutMs);
        });
    }

    async restartGraceful(serverId, serverDir, javaArgs, jarFile, maxMemoryMb, timeoutMs = 15000, customArgs = null, javaPath = 'java', spawnEnv = null, mode = 'java') {
        const stopResult = await this.gracefulStop(serverId, timeoutMs);
        if (!stopResult.graceful) {
            return { graceful: false, started: false, message: 'Server did not stop within timeout. Use Kill to force terminate.' };
        }
        await new Promise(r => setTimeout(r, 1500));
        try {
            this.start(serverId, serverDir, javaArgs, jarFile, maxMemoryMb, customArgs, javaPath, spawnEnv, mode);
            return { graceful: true, started: true };
        } catch (e) {
            return { graceful: true, started: false, message: e.message };
        }
    }

    kill(serverId) {
        this._stopIntents.add(serverId);
        const child = this.processes.get(serverId);
        if (!child) throw new Error('Server is not running');

        const pid = child.pid;
        console.warn(`[ProcessManager] Force-killing server ${serverId} (PID: ${pid})`);

        try {
            if (process.platform === 'win32') {
                require('child_process').execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
            } else {
                process.kill(pid, 'SIGKILL');
            }
        } catch (e) {
            console.error(`[ProcessManager] Kill failed for PID ${pid}:`, e.message);
        }

        this.processes.delete(serverId);
        this._startedAt.delete(serverId);
        this._tpsPollAt.delete(serverId);
        this._tpsErrorDump.delete(serverId);
        this._readyServers.delete(serverId);
        this._cachedTps.delete(serverId);
        this._cachedPlayers.delete(serverId);
        this._lastStatsParse.delete(serverId);
        saveRunningServers(this.processes);
        this.emit('status', serverId, 'offline');
    }

    waitForExit(serverId, timeoutMs = 10000) {
        return new Promise<any>((resolve) => {
            if (!this.processes.has(serverId)) return resolve(true);

            let resolved = false;
            let timer: any;
            const onStatus = (emittedId: any, status: any) => {
                if (emittedId === serverId && status === 'offline' && !resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    this.removeListener('status', onStatus);
                    resolve(true);
                }
            };
            this.on('status', onStatus);

            timer = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    this.removeListener('status', onStatus);
                    resolve(false);
                }
            }, timeoutMs);
        });
    }

    sendCommand(serverId, command) {
        const child = this.processes.get(serverId);
        if (child) {
            if (child.recovered) {
                console.warn(`[ProcessManager] Stdin not available for recovered server ${serverId}. Please restart it.`);
                return;
            }
            child.stdin.write(command + '\n');
        } else {
            throw new Error('Server is not running');
        }
    }

    // ─── Stats & Status ──────────────────────────────────────────────────

    async getStats(serverId) {
        const child = this.processes.get(serverId);
        const startedAt = this._startedAt.get(serverId) || null;
        if (!child) return { cpu: 0, ram: 0, tps: null, players: 0, startedAt, uptime: 0 };
        try {
            const stats = await pidusage(child.pid);

            // Refresh player parsing from console history at most every 5s. TPS
            // now comes from the background /tps poll (no plugin required) and is
            // only overwritten by a *successful* history parse, so a null history
            // scan can never clobber a fresh polled value.
            const now = Date.now();
            const lastParse = this._lastStatsParse.get(serverId) || 0;
            if (now - lastParse > 5000) {
                const historyText = (this.histories.get(serverId) || []).join('');
                const tpsFromHistory = parseTpsFromHistoryText(historyText);
                if (tpsFromHistory != null) this._cachedTps.set(serverId, tpsFromHistory);
                const players = parsePlayersFromHistoryText(historyText);
                this._cachedPlayers.set(serverId, players === null ? 0 : players);
                this._lastStatsParse.set(serverId, now);
            }

            return {
                cpu: Math.round(this._systemCpu.value * 10) / 10,
                ram: stats.memory,
                tps: this._cachedTps.get(serverId) ?? null,
                players: this._cachedPlayers.get(serverId) ?? 0,
                startedAt,
                uptime: startedAt ? Math.floor((now - startedAt) / 1000) : 0
            };
        } catch (e) {
            return { cpu: 0, ram: 0, tps: null, players: 0, startedAt, uptime: 0 };
        }
    }

    getStatus(serverId) {
        return this.processes.has(serverId) ? 'online' : 'offline';
    }

    // ─── No-plugin TPS polling ──────────────────────────────────────────────

    /**
     * Filters /tps output while a background poll is in flight:
     * - the TPS response line is parsed and cached (never shown in the console);
     * - the command echo ("... issued server command: /tps") is dropped;
     * - "Unknown command" replies (vanilla servers without a /tps command)
     *   are dropped so they don't clutter logs;
     * - when a /tps poll throws ("Command exception: /tps", seen on some Paper
     *   setups), the whole error dump — exception line, stacktrace and the
     *   "An unexpected error occurred..." trailer — is swallowed too.
     */
    private _handleTpsPollOutput(serverId, output) {
        // 1. A /tps poll failed and its stacktrace dump is in progress.
        if (this._tpsErrorDump.has(serverId)) {
            const count = this._tpsErrorDump.get(serverId);
            if (count > 60) {
                // Safety cap — never swallow indefinitely.
                this._tpsErrorDump.delete(serverId);
            } else if (isTpsErrorTrailer(output)) {
                // Paper prints this right after a failed command — end of the dump.
                this._tpsErrorDump.delete(serverId);
                return true;
            } else if (/^\[[^\]]*\]:/.test(String(output).trimStart())) {
                // A normal timestamped log line → the dump is over, process it normally.
                this._tpsErrorDump.delete(serverId);
            } else if (isStacktraceLine(output)) {
                this._tpsErrorDump.set(serverId, count + 1);
                return true;
            } else {
                // Unexpected content mid-dump — stop swallowing to be safe.
                this._tpsErrorDump.delete(serverId);
            }
        }

        // 2. Suppression window opened by a /tps poll.
        const pollAt = this._tpsPollAt.get(serverId);
        if (pollAt == null) return false;
        if (Date.now() - pollAt >= RealProcessManager.TPS_POLL_WINDOW_MS) {
            this._tpsPollAt.delete(serverId);
            return false;
        }

        const tps = parseTpsFromLine(output);
        if (tps != null) {
            this._cachedTps.set(serverId, tps);
            this._tpsPollAt.delete(serverId);
            return true;
        }
        if (isTpsUnknownCommand(output)) {
            // Vanilla server with no /tps command: the poll is complete, so close
            // the suppression window immediately instead of letting it linger.
            this._tpsPollAt.delete(serverId);
            return true;
        }
        if (isTpsCommandException(output)) {
            // The /tps command itself failed — swallow the exception line and start
            // swallowing its stacktrace dump.
            this._tpsPollAt.delete(serverId);
            this._tpsErrorDump.set(serverId, 1);
            return true;
        }
        return isTpsConsoleNoise(output);
    }

    private _ensureTpsPolling() {
        if (this._tpsTimer) return;
        this._tpsTimer = setInterval(() => this._pollAllTps(), RealProcessManager.TPS_POLL_INTERVAL_MS);
        if (typeof (this._tpsTimer as any).unref === 'function') (this._tpsTimer as any).unref();
    }

    private _pollAllTps() {
        for (const serverId of this.processes.keys()) {
            if (this._bedrockServers.has(serverId) || this._pocketmineServers.has(serverId)) continue;
            if (!this._readyServers.has(serverId)) continue; // world not fully loaded yet — /tps would NPE
            this._pollTps(serverId);
        }
        // Only tear down the timer once nothing is running at all — a starting
        // server that isn't "ready" yet still needs the timer alive so its
        // first poll can fire once it finishes loading.
        if (this.processes.size === 0 && this._tpsTimer) {
            clearInterval(this._tpsTimer);
            this._tpsTimer = null;
        }
    }

    private _pollTps(serverId): boolean {
        try {
            const child = this.processes.get(serverId);
            if (!child || child.recovered || !child.stdin || !child.stdin.writable) return false;
            this._tpsPollAt.set(serverId, Date.now());
            child.stdin.write('tps\n');
            return true;
        } catch (_) {
            return false;
        }
    }

    // ─── History ─────────────────────────────────────────────────────────

    clearHistory(serverId) {
        this.histories.set(serverId, []);
        this.emit('clear_console', serverId);
    }

    appendHistory(serverId, data) {
        if (!this.histories.has(serverId)) {
            this.histories.set(serverId, []);
        }
        const history = this.histories.get(serverId);
        history.push(data);

        let totalBytes = 0;
        for (const chunk of history) {
            totalBytes += Buffer.byteLength(chunk, 'utf8');
        }

        while (totalBytes > 524288 && history.length > 0) {
            const removed = history.shift();
            totalBytes -= Buffer.byteLength(removed, 'utf8');
        }
    }

    getHistory(serverId) {
        return this.histories.get(serverId) || [];
    }
}

export = RealProcessManager;
