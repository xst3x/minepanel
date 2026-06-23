/**
 * Real Process Manager — manages actual server child processes.
 * Used in worker and test environments.
 * Extracted from processManager.js — single responsibility.
 */
const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const pidusage = require('pidusage');
const { parseBedrockOutput } = require('../adapters/bedrock');
const { parsePocketMineOutput } = require('../adapters/pocketmine');
const { saveRunningServers, loadRunningServers } = require('./process-persistence');
const { parseServerStderr } = require('./process-output-parser');

class RealProcessManager extends EventEmitter {
    constructor() {
        super();
        /** @type {Map<string, import('child_process').ChildProcess>} */
        this.processes = new Map();
        /** @type {Map<string, string[]>} */
        this.histories = new Map();
        /** @type {Set<string>} */
        this.locks = new Set();
        /** @type {Map<string, NodeJS.Timeout>} */
        this.lockTimers = new Map();
        /** @type {Set<string>} */
        this._stopIntents = new Set();
        /** @type {Map<string, NodeJS.Timeout>} */
        this._crashRestartTimers = new Map();
        /** @type {Set<string>} */
        this._bedrockServers = new Set();
        /** @type {Set<string>} */
        this._pocketmineServers = new Set();
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

        const spawnOptions = {
            cwd: serverDir,
            stdio: ['pipe', 'pipe', 'pipe']
        };
        if (spawnEnv) {
            spawnOptions.env = spawnEnv;
        }

        const child = spawn(javaPath, args, spawnOptions);
        child.startInfo = { serverDir, javaArgs, jarFile, maxMemoryMb, customArgs, javaPath, spawnEnv, mode };

        this.processes.set(serverId, child);
        saveRunningServers(this.processes);

        child.stdin.on('error', (err) => {
            console.error(`[ProcessManager] Server ${serverId} stdin error:`, err.message);
        });

        child.stdout.on('data', (data) => {
            const raw = data.toString();
            let output = raw;
            if (this._bedrockServers.has(serverId)) output = parseBedrockOutput(raw);
            else if (this._pocketmineServers.has(serverId)) output = parsePocketMineOutput(raw);
            this.appendHistory(serverId, output);
            this.emit('console', serverId, output);
        });

        child.stderr.on('data', (data) => {
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
        return new Promise((resolve) => {
            const child = this.processes.get(serverId);
            if (!child) {
                return resolve({ graceful: true, wasRunning: false });
            }

            let resolved = false;
            const onStatus = (emittedId, status) => {
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

            const timer = setTimeout(() => {
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
        saveRunningServers(this.processes);
        this.emit('status', serverId, 'offline');
    }

    waitForExit(serverId, timeoutMs = 10000) {
        return new Promise((resolve) => {
            if (!this.processes.has(serverId)) return resolve(true);

            let resolved = false;
            const onStatus = (emittedId, status) => {
                if (emittedId === serverId && status === 'offline' && !resolved) {
                    resolved = true;
                    clearTimeout(timer);
                    this.removeListener('status', onStatus);
                    resolve(true);
                }
            };
            this.on('status', onStatus);

            const timer = setTimeout(() => {
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
        if (!child) return { cpu: 0, ram: 0 };
        try {
            const stats = await pidusage(child.pid);
            const numCores = require('os').cpus().length;
            const cpuNormalized = Math.min(100, stats.cpu / numCores);
            return {
                cpu: Math.round(cpuNormalized * 10) / 10,
                ram: stats.memory
            };
        } catch (e) {
            return { cpu: 0, ram: 0 };
        }
    }

    getStatus(serverId) {
        return this.processes.has(serverId) ? 'online' : 'offline';
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

module.exports = RealProcessManager;
