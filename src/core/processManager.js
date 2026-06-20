const { spawn, fork } = require('child_process');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const pidusage = require('pidusage');
const { parseBedrockOutput } = require('../adapters/bedrock');
const { parsePocketMineOutput } = require('../adapters/pocketmine');

const isWorker = process.env.MINEPANEL_PROCESS === 'worker';
const isTest = process.env.NODE_ENV === 'test';

if (isWorker || isTest) {
    // -----------------------------------------------------------------
    // --- REAL PROCESS MANAGER (For Worker & Test Environments) ---
    // -----------------------------------------------------------------
    const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../../data');
    const runningServersFile = path.join(dataDir, 'running_servers.json');

    function saveRunningServers(processes) {
        try {
            const data = [];
            for (const [serverId, child] of processes.entries()) {
                if (child && child.pid) {
                    data.push({
                        serverId,
                        pid: child.pid,
                        startInfo: child.startInfo || null
                    });
                }
            }
            const parentDir = path.dirname(runningServersFile);
            if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
            }
            fs.writeFileSync(runningServersFile, JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            console.error('[ProcessManager] Failed to save running servers:', e);
        }
    }

    function loadRunningServers() {
        try {
            if (fs.existsSync(runningServersFile)) {
                return JSON.parse(fs.readFileSync(runningServersFile, 'utf8'));
            }
        } catch (e) {
            console.error('[ProcessManager] Failed to load running servers:', e);
        }
        return [];
    }

    class RealProcessManager extends EventEmitter {
        constructor() {
            super();
            this.processes = new Map(); // serverId -> ChildProcess
            this.histories = new Map(); // serverId -> string[]
            this.locks = new Set(); // serverId under lifecycle task
            this.lockTimers = new Map(); // serverId -> timer
            this._stopIntents = new Set(); // serverId intentionally stopped (not a crash)
            this._crashRestartTimers = new Map(); // serverId -> timer
            this._bedrockServers = new Set(); // serverId -> is bedrock
            this._pocketmineServers = new Set(); // serverId -> is pocketmine

            // Recover running servers on boot (only in worker process, not in test mode)
            if (isWorker) {
                process.nextTick(() => this.recoverRunningServers());
            }
        }

        recoverRunningServers() {
            console.log('[ProcessManager] Re-syncing running servers on boot...');
            const running = loadRunningServers();
            for (const entry of running) {
                const { serverId, pid, startInfo } = entry;
                try {
                    process.kill(pid, 0); // Check if process is still alive
                    
                    console.log(`[ProcessManager] Recovered running server ${serverId} on PID ${pid}`);
                    
                    const placeholder = {
                        pid,
                        recovered: true,
                        startInfo,
                        stdin: {
                            write: (data) => {
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
                            } catch (e) {}
                        }
                    };

                    this.processes.set(serverId, placeholder);

                    // Periodically verify if process is still alive
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

                    // Notify API process that this server is online
                    setTimeout(() => {
                        this.emit('status', serverId, 'online');
                    }, 100);

                } catch (err) {
                    console.log(`[ProcessManager] Server ${serverId} (PID ${pid}) was not running on boot. Skipping.`);
                }
            }
            saveRunningServers(this.processes);
        }

        acquireLock(serverId, timeoutMs = 60000) {
            const idStr = serverId.toString();
            if (this.locks.has(idStr)) {
                return false;
            }
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

        start(serverId, serverDir, javaArgs, jarFile, maxMemoryMb, customArgs = null, javaPath = 'java', spawnEnv = null, mode = 'java') {
            if (this.processes.has(serverId)) {
                throw new Error('Server is already running');
            }

            if (this._crashRestartTimers.has(serverId)) {
                clearTimeout(this._crashRestartTimers.get(serverId));
                this._crashRestartTimers.delete(serverId);
            }
            this._stopIntents.delete(serverId);

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
            if (!child) {
                throw new Error('Server is not running');
            }

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
                if (child.recovered) {
                    console.warn(`[ProcessManager] Stdin not available for recovered server ${serverId}. Please restart it.`);
                    return;
                }
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

    module.exports = new RealProcessManager();

} else {
    // -----------------------------------------------------------------
    // --- PROXY PROCESS MANAGER (For API Process) ---
    // -----------------------------------------------------------------
    class ProxyProcessManager extends EventEmitter {
        constructor() {
            super();
            this.processes = new Map(); // serverId -> { pid }
            this.histories = new Map(); // serverId -> string[]
            this.locks = new Set();
            this.lockTimers = new Map();
            this.statuses = new Map(); // serverId -> string
            this.stats = new Map(); // serverId -> { cpu, ram }
            
            this.worker = null;
            this.pendingRequests = new Map();
            this.requestIdCounter = 0;
            
            this.startWorker();
        }
        
        acquireLock(serverId, timeoutMs = 60000) {
            const idStr = serverId.toString();
            if (this.locks.has(idStr)) return false;
            this.locks.add(idStr);

            if (this.lockTimers.has(idStr)) {
                clearTimeout(this.lockTimers.get(idStr));
            }

            const timer = setTimeout(() => {
                if (this.locks.has(idStr)) {
                    console.warn(`[ProxyProcessManager] Lock for server ${idStr} auto-released after ${timeoutMs}ms`);
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
        
        startWorker() {
            const workerPath = path.resolve(__dirname, '../worker.js');
            const logger = require('./utils/logger');
            logger.info(`[API] Forking worker process from ${workerPath}`);
            
            this.worker = fork(workerPath, [], {
                env: { ...process.env, MINEPANEL_PROCESS: 'worker' },
                stdio: 'inherit'
            });
            
            this.worker.on('message', (message) => {
                if (!message || typeof message !== 'object') return;
                this.handleWorkerMessage(message);
            });
            
            this.worker.on('exit', (code, signal) => {
                logger.error(`[API] Worker process exited (code: ${code}, signal: ${signal}). Re-spawning in 2s...`);
                this.worker = null;
                // Reject all pending responses
                for (const [requestId, { reject }] of this.pendingRequests.entries()) {
                    reject(new Error('Worker process exited unexpectedly'));
                    this.pendingRequests.delete(requestId);
                }
                setTimeout(() => this.startWorker(), 2000);
            });
            
            this.worker.on('error', (err) => {
                logger.error(`[API] Worker process error:`, err);
            });
        }
        
        handleWorkerMessage(message) {
            const { type, serverId, requestId } = message;
            
            if (requestId && this.pendingRequests.has(requestId)) {
                const { resolve, reject } = this.pendingRequests.get(requestId);
                this.pendingRequests.delete(requestId);
                if (message.error) {
                    reject(new Error(message.error));
                } else {
                    resolve(message.result);
                }
                return;
            }
            
            switch (type) {
                case 'log': {
                    const { data } = message;
                    this.appendHistory(serverId, data);
                    this.emit('console', serverId, data);
                    break;
                }
                case 'status': {
                    const { status, pid } = message;
                    const idStr = serverId.toString();
                    this.statuses.set(idStr, status);
                    if (status === 'online') {
                        this.processes.set(idStr, { pid });
                    } else {
                        this.processes.delete(idStr);
                        this.stats.delete(idStr);
                    }
                    this.emit('status', serverId, status);
                    break;
                }
                case 'clear-console': {
                    this.histories.set(serverId, []);
                    this.emit('clear_console', serverId);
                    break;
                }
                case 'stats': {
                    const { stats } = message;
                    this.stats.set(serverId.toString(), stats);
                    break;
                }
                case 'crash': {
                    const { info } = message;
                    this.emit('crash', serverId, info);
                    break;
                }
            }
        }
        
        sendIpcRequest(type, serverId, payload = {}) {
            return new Promise((resolve, reject) => {
                if (!this.worker) {
                    return reject(new Error('Worker process is not running'));
                }
                const requestId = `${type}-${serverId}-${this.requestIdCounter++}-${Date.now()}`;
                this.pendingRequests.set(requestId, { resolve, reject });
                
                const timeout = setTimeout(() => {
                    if (this.pendingRequests.has(requestId)) {
                        this.pendingRequests.delete(requestId);
                        reject(new Error(`IPC request ${type} timed out`));
                    }
                }, 35000); // slightly longer timeout for starts
                
                this.worker.send({
                    type,
                    requestId,
                    serverId,
                    ...payload
                }, (err) => {
                    if (err) {
                        clearTimeout(timeout);
                        this.pendingRequests.delete(requestId);
                        reject(err);
                    }
                });
            });
        }
        
        start(serverId, serverDir, javaArgs, jarFile, maxMemoryMb, customArgs = null, javaPath = 'java', spawnEnv = null, mode = 'java') {
            const idStr = serverId.toString();
            this.clearHistory(idStr);
            this.statuses.set(idStr, 'online');
            
            this.sendIpcRequest('start-server', idStr, {
                serverDir, javaArgs, jarFile, ramMb: maxMemoryMb, customArgs, javaPath, spawnEnv, mode
            }).catch(err => {
                const logger = require('./utils/logger');
                logger.error(`[API] Failed to start server ${idStr}:`, err);
                this.statuses.set(idStr, 'offline');
                this.emit('status', idStr, 'offline');
            });
        }
        
        stop(serverId) {
            this.sendIpcRequest('stop-server', serverId.toString()).catch(() => {});
        }
        
        gracefulStop(serverId, timeoutMs = 15000) {
            return this.sendIpcRequest('graceful-stop', serverId.toString(), { timeoutMs });
        }
        
        restartGraceful(serverId, serverDir, javaArgs, jarFile, maxMemoryMb, timeoutMs = 15000, customArgs = null, javaPath = 'java', spawnEnv = null, mode = 'java') {
            return this.sendIpcRequest('restart-graceful', serverId.toString(), {
                serverDir, javaArgs, jarFile, ramMb: maxMemoryMb, timeoutMs, customArgs, javaPath, spawnEnv, mode
            });
        }
        
        kill(serverId) {
            this.sendIpcRequest('kill-server', serverId.toString()).catch(() => {});
        }
        
        sendCommand(serverId, command) {
            if (!this.worker) throw new Error('Worker process is not running');
            this.worker.send({ type: 'send-command', serverId: serverId.toString(), command });
        }
        
        getStats(serverId) {
            return this.stats.get(serverId.toString()) || { cpu: 0, ram: 0 };
        }
        
        getStatus(serverId) {
            return this.statuses.get(serverId.toString()) || 'offline';
        }
        
        waitForExit(serverId, timeoutMs = 10000) {
            return new Promise((resolve) => {
                if (this.getStatus(serverId.toString()) === 'offline') {
                    return resolve(true);
                }

                let resolved = false;
                const onStatus = (emittedId, status) => {
                    if (emittedId.toString() === serverId.toString() && status === 'offline' && !resolved) {
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

        clearHistory(serverId) {
            const idStr = serverId.toString();
            this.histories.set(idStr, []);
            this.emit('clear_console', idStr);
            if (this.worker) {
                this.worker.send({ type: 'clear-history', serverId: idStr });
            }
        }
        
        appendHistory(serverId, data) {
            const idStr = serverId.toString();
            if (!this.histories.has(idStr)) {
                this.histories.set(idStr, []);
            }
            const history = this.histories.get(idStr);
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
            return this.histories.get(serverId.toString()) || [];
        }
    }

    module.exports = new ProxyProcessManager();
}
