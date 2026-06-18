const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const pidusage = require('pidusage');
const { parseBedrockOutput } = require('../adapters/bedrock');
const { parsePocketMineOutput } = require('../adapters/pocketmine');

class ProcessManager extends EventEmitter {
    constructor() {
        super();
        this.processes = new Map(); // serverId -> ChildProcess
        this.histories = new Map(); // serverId -> string[]
        this.locks = new Set(); // serverId under lifecycle task (e.g., start, stop, restart, switch)
        this._stopIntents = new Set(); // serverId intentionally stopped (not a crash)
        this._crashRestartTimers = new Map(); // serverId -> timer
        this._bedrockServers = new Set(); // serverId -> is bedrock (for output parsing)
        this._pocketmineServers = new Set(); // serverId -> is pocketmine (for output parsing)
    }

    acquireLock(serverId, timeoutMs = 60000) {
        const idStr = serverId.toString();
        if (this.locks.has(idStr)) {
            return false;
        }
        this.locks.add(idStr);
        // Auto-release after timeoutMs to prevent permanent deadlock
        setTimeout(() => {
            if (this.locks.has(idStr)) {
                console.warn(`[ProcessManager] Lock for server ${idStr} auto-released after ${timeoutMs}ms timeout`);
                this.locks.delete(idStr);
            }
        }, timeoutMs);
        return true;
    }

    // Force-acquire lock  bypasses the existing lock (for kill/emergency stop)
    acquireLockForce(serverId) {
        const idStr = serverId.toString();
        this.locks.add(idStr);
        setTimeout(() => { this.locks.delete(idStr); }, 60000);
        return true;
    }

    releaseLock(serverId) {
        this.locks.delete(serverId.toString());
    }

    isLocked(serverId) {
        return this.locks.has(serverId.toString());
    }

    start(serverId, serverDir, javaArgs, jarFile, maxMemoryMb, customArgs = null, javaPath = 'java', spawnEnv = null, mode = 'java') {
        if (this.processes.has(serverId)) {
            throw new Error('Server is already running');
        }

        // Clear any pending crash-restart timer
        if (this._crashRestartTimers.has(serverId)) {
            clearTimeout(this._crashRestartTimers.get(serverId));
            this._crashRestartTimers.delete(serverId);
        }
        // Clear stop intent  starting fresh
        this._stopIntents.delete(serverId);

        // ── Mode detection ────────────────────────────────────────────────────
        // 'bedrock'    : native BDS binary, no JVM, no args
        // 'pocketmine' : PHP PHAR, executable + customArgs, no JVM
        // 'java'       : standard JVM launch (default)
        const isBedrock    = mode === 'bedrock';
        const isPocketMine = mode === 'pocketmine';

        if (isBedrock) {
            this._bedrockServers.add(serverId);
        } else {
            this._bedrockServers.delete(serverId);
        }
        if (isPocketMine) {
            this._pocketmineServers.add(serverId);
        } else {
            this._pocketmineServers.delete(serverId);
        }

        let args;
        if (isBedrock) {
            // Bedrock Dedicated Server: run the binary with no arguments
            args = [];
        } else if (isPocketMine) {
            // PocketMine-MP: run executable (php or phar) with customArgs
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

        this.processes.set(serverId, child);

        child.stdin.on('error', (err) => {
            console.error(`[ProcessManager] Server ${serverId} stdin error:`, err.message);
        });

        child.stdout.on('data', (data) => {
            const raw = data.toString();
            let output = raw;
            if (this._bedrockServers.has(serverId))    output = parseBedrockOutput(raw);
            else if (this._pocketmineServers.has(serverId)) output = parsePocketMineOutput(raw);
            this.appendHistory(serverId, output);
            this.emit('console', serverId, output);
        });

        child.stderr.on('data', (data) => {
            const raw = data.toString();
            let output = raw;
            if (this._bedrockServers.has(serverId))    output = parseBedrockOutput(raw);
            else if (this._pocketmineServers.has(serverId)) output = parsePocketMineOutput(raw);

            // Detect "Current Java is X but we require at least Y" from Forge bootstrap
            const javaVersionMatch = output.match(/Current Java is (\d+) but we require at least (\d+)/);
            if (javaVersionMatch) {
                const current = javaVersionMatch[1];
                const required = javaVersionMatch[2];
                const hint =
                    `\n[MinePanel] ⚠  Java version mismatch: you have Java ${current} but this Forge version requires Java ${required}.\n` +
                    `[MinePanel]    Fix: go to Server Settings → Advanced Settings → Java Path and set\n` +
                    `[MinePanel]    the full path to a Java ${required}+ executable, e.g.:\n` +
                    `[MinePanel]      Windows: C:\\Program Files\\Java\\jdk-${required}\\bin\\java.exe\n` +
                    `[MinePanel]      Linux:   /usr/lib/jvm/java-${required}-openjdk/bin/java\n` +
                    `[MinePanel]    You can also click "Detect Java" in Advanced Settings to find installed JDKs.\n`;
                output += hint;
            }

            // Detect generic "Unrecognized VM option" errors and hint about incompatible flags
            if (output.includes('Unrecognized VM option')) {
                const optMatch = output.match(/Unrecognized VM option '([^']+)'/);
                const flag = optMatch ? optMatch[1] : 'unknown flag';
                const hint =
                    `\n[MinePanel] ⚠  JVM rejected the option '${flag}'.\n` +
                    `[MinePanel]    This usually means your Java version is too old for this server.\n` +
                    `[MinePanel]    Update your Java Path in Server Settings → Advanced Settings.\n`;
                output += hint;
            }

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
            this.emit('status', serverId, 'offline');

            // Crash detection: if exit was NOT intentional (not /stop or kill)
            const wasIntentional = this._stopIntents.has(serverId);
            this._stopIntents.delete(serverId);

            // Non-zero exit code = crash (code 0 or null = clean exit / /stop)
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
            this.emit('status', serverId, 'offline');
        });

        this.emit('status', serverId, 'online');
    }

    /**
     * Send the "stop" command to the server stdin for graceful shutdown.
     * Does NOT force-kill. The process will terminate on its own via the 'close' event.
     */
    stop(serverId) {
        this._stopIntents.add(serverId); // mark as intentional
        this.sendCommand(serverId, 'stop');
    }

    /**
     * Gracefully stop a server with a timeout.
     * Sends "stop" command, waits for the process to exit.
     * Returns a promise that resolves to { graceful: true } if the server stopped cleanly,
     * or { graceful: false } if the timeout was reached (process is still running).
     */
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

            // Send the stop command via stdin
            try {
                this.sendCommand(serverId, 'stop');
            } catch (e) {
                // Process might have already exited between the check and sendCommand
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

    /**
     * Graceful restart: stop, wait for exit, then start again.
     * Returns { graceful, started } indicating whether shutdown was clean and if restart succeeded.
     */
    async restartGraceful(serverId, serverDir, javaArgs, jarFile, maxMemoryMb, timeoutMs = 15000, customArgs = null, javaPath = 'java', spawnEnv = null, mode = 'java') {
        const stopResult = await this.gracefulStop(serverId, timeoutMs);

        if (!stopResult.graceful) {
            return { graceful: false, started: false, message: 'Server did not stop within timeout. Use Kill to force terminate.' };
        }

        // Small delay to allow OS to release file handles
        await new Promise(r => setTimeout(r, 1500));

        try {
            this.start(serverId, serverDir, javaArgs, jarFile, maxMemoryMb, customArgs, javaPath, spawnEnv, mode);
            return { graceful: true, started: true };
        } catch (e) {
            return { graceful: true, started: false, message: e.message };
        }
    }

    /**
     * Force-kill only this specific server's process by PID.
     * Never kills unrelated Java processes.
     */
    kill(serverId) {
        this._stopIntents.add(serverId); // mark as intentional (not a crash)
        const child = this.processes.get(serverId);
        if (!child) {
            throw new Error('Server is not running');
        }

        const pid = child.pid;
        console.warn(`[ProcessManager] Force-killing server ${serverId} (PID: ${pid})`);

        try {
            // On Windows, child.kill('SIGKILL') doesn't work reliably.
            // Use taskkill to kill the process tree for this specific PID.
            if (process.platform === 'win32') {
                require('child_process').execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
            } else {
                child.kill('SIGKILL');
            }
        } catch (e) {
            console.error(`[ProcessManager] Kill failed for PID ${pid}:`, e.message);
        }

        // Clean up state immediately
        this.processes.delete(serverId);
        this.emit('status', serverId, 'offline');
    }

    /**
     * Wait for a specific server process to fully exit.
     * Resolves true if the process exited, false if timeout.
     */
    waitForExit(serverId, timeoutMs = 10000) {
        return new Promise((resolve) => {
            if (!this.processes.has(serverId)) {
                return resolve(true);
            }

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
            child.stdin.write(command + '\n');
        } else {
            throw new Error('Server is not running');
        }
    }

    async getStats(serverId) {
        const child = this.processes.get(serverId);
        if (!child) return { cpu: 0, ram: 0 };
        
        try {
            const stats = await pidusage(child.pid);
            // pidusage returns cpu as % of one core (can exceed 100% on multi-core).
            // Normalize to percentage of total system CPU capacity.
            const numCores = require('os').cpus().length;
            const cpuNormalized = Math.min(100, stats.cpu / numCores);
            return {
                cpu: Math.round(cpuNormalized * 10) / 10,
                ram: stats.memory  // bytes, capped in frontend per server ram_mb
            };
        } catch (e) {
            return { cpu: 0, ram: 0 };
        }
    }

    getStatus(serverId) {
        return this.processes.has(serverId) ? 'online' : 'offline';
    }

    /**
     * Clear console history for a server.
     * Used when starting/stopping/restarting to give a clean console view.
     */
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

module.exports = new ProcessManager();
