/**
 * Proxy Process Manager — communicates with the worker process via IPC.
 * Used in the API process.
 * Extracted from processManager.js — single responsibility.
 */
const { fork } = require('child_process');
const EventEmitter = require('events');
const path = require('path');

class ProxyProcessManager extends EventEmitter {
    constructor() {
        super();
        /** @type {Map<string, {pid: number}>} */
        this.processes = new Map();
        /** @type {Map<string, string[]>} */
        this.histories = new Map();
        /** @type {Set<string>} */
        this.locks = new Set();
        /** @type {Map<string, NodeJS.Timeout>} */
        this.lockTimers = new Map();
        /** @type {Map<string, string>} */
        this.statuses = new Map();
        /** @type {Map<string, {cpu: number, ram: number}>} */
        this.stats = new Map();

        this.worker = null;
        /** @type {Map<string, {resolve: Function, reject: Function}>} */
        this.pendingRequests = new Map();
        this.requestIdCounter = 0;

        this.startWorker();
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

    // ─── Worker lifecycle ────────────────────────────────────────────────

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

    // ─── IPC ─────────────────────────────────────────────────────────────

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
            }, 35000);

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

    // ─── Lifecycle (via IPC) ─────────────────────────────────────────────

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
        this.sendIpcRequest('stop-server', serverId.toString()).catch(() => { });
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
        this.sendIpcRequest('kill-server', serverId.toString()).catch(() => { });
    }

    sendCommand(serverId, command) {
        if (!this.worker) throw new Error('Worker process is not running');
        this.worker.send({ type: 'send-command', serverId: serverId.toString(), command });
    }

    // ─── Stats & Status ──────────────────────────────────────────────────

    getStats(serverId) {
        return this.stats.get(serverId.toString()) || { cpu: 0, ram: 0 };
    }

    getStatus(serverId) {
        return this.statuses.get(serverId.toString()) || 'offline';
    }

    waitForExit(serverId, timeoutMs = 10000) {
        return new Promise((resolve) => {
            if (this.getStatus(serverId.toString()) === 'offline') return resolve(true);

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

    // ─── History ─────────────────────────────────────────────────────────

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

module.exports = ProxyProcessManager;
