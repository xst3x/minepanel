// src/core/automation/workerManager.js
'use strict';

const { spawn } = require('child_process');
const path = require('path');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const processManager = require('../processManager');

const VALIDATOR_PATH = path.join(__dirname, 'validator.py');
const RUNNER_PATH = path.join(__dirname, 'sandbox_runner.py');

class WorkerManager extends EventEmitter {
    constructor() {
        super();
        this.activeWorkers = new Set();
        this.maxConcurrency = 5;
        this.queue = [];
        this.queueWarnThreshold = 100; // log a warning once the backlog gets this large
        this.lastQueueWarnAt = 0;
    }

    async verifyCode(code) {
        return new Promise((resolve) => {
            let pythonCmd = 'python';
            let child = spawn(pythonCmd, [VALIDATOR_PATH]);

            let stdout = '';
            let stderr = '';

            const onOutput = (data) => { stdout += data.toString(); };
            const onError = (data) => { stderr += data.toString(); };

            const onSpawnError = (err) => {
                if (err.code === 'ENOENT') {
                    pythonCmd = 'python3';
                    child = spawn(pythonCmd, [VALIDATOR_PATH]);
                    child.stdout.on('data', onOutput);
                    child.stderr.on('data', onError);
                    child.on('close', onClose);
                    child.on('error', onFinalError);
                    child.stdin.write(code);
                    child.stdin.end();
                } else {
                    resolve({ valid: false, errors: [`Failed to execute Python: ${err.message}`] });
                }
            };

            const onFinalError = (err) => {
                resolve({ valid: false, errors: [`Failed to execute Python: ${err.message}`] });
            };

            const onClose = (code) => {
                if (code !== 0) {
                    resolve({ valid: false, errors: [stderr.trim() || `Validator exited with code ${code}`] });
                    return;
                }
                try {
                    const result = JSON.parse(stdout);
                    resolve(result);
                } catch (e) {
                    resolve({ valid: false, errors: [`Failed to parse validator output: ${stdout}`] });
                }
            };

            child.stdout.on('data', onOutput);
            child.stderr.on('data', onError);
            child.on('close', onClose);
            child.on('error', onSpawnError);

            child.stdin.write(code);
            child.stdin.end();
        });
    }

    executeScript(serverId, scriptName, scriptCode, context) {
        this.queue.push({ serverId, scriptName, scriptCode, context });

        // Soft cap: never drop events, but make a growing backlog visible so it
        // can be diagnosed (e.g. a script that's too slow, or a player flooding
        // events faster than 5 concurrent workers can drain).
        if (this.queue.length >= this.queueWarnThreshold) {
            const now = Date.now();
            if (now - this.lastQueueWarnAt > 5000) {
                this.lastQueueWarnAt = now;
                logger.warn(`[WorkerManager] Automation queue backlog is ${this.queue.length} jobs — events are still being kept, but execution may lag behind.`);
            }
        }

        this.processQueue();
    }

    processQueue() {
        if (this.activeWorkers.size >= this.maxConcurrency) return;
        if (this.queue.length === 0) return;

        const { serverId, scriptName, scriptCode, context } = this.queue.shift();
        this.runWorker(serverId, scriptName, scriptCode, context).catch(err => {
            logger.error(`[WorkerManager] Worker run error:`, err);
        });
    }

    async runWorker(serverId, scriptName, scriptCode, context) {
        const workerId = `${serverId}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        this.activeWorkers.add(workerId);

        try {
            await new Promise((resolve) => {
                let pythonCmd = 'python';
                let child = spawn(pythonCmd, [RUNNER_PATH]);
                let isDead = false;

                const timer = setTimeout(() => {
                    if (!isDead) {
                        isDead = true;
                        child.kill('SIGKILL');
                        const timeoutMsg = `[Automation Error] Script "${scriptName}" timed out after 5s and was terminated.\n`;
                        this.emit('log', serverId, timeoutMsg);
                        resolve();
                    }
                }, 5000);

                const onSpawnError = (err) => {
                    if (err.code === 'ENOENT') {
                        pythonCmd = 'python3';
                        child = spawn(pythonCmd, [RUNNER_PATH]);
                        setupStreams(child);
                    } else {
                        clearTimeout(timer);
                        isDead = true;
                        this.emit('log', serverId, `[Automation Error] Failed to execute Python worker "${scriptName}": ${err.message}\n`);
                        resolve();
                    }
                };

                const setupStreams = (proc) => {
                    proc.stdout.on('data', (data) => {
                        const lines = data.toString().split('\n');
                        for (const line of lines) {
                            if (!line.trim()) continue;
                            try {
                                if (line.startsWith('{"__minepanel_action__":')) {
                                    const action = JSON.parse(line);
                                    this.handleAction(serverId, action);
                                } else {
                                    this.emit('log', serverId, `[${scriptName}] ${line}\n`);
                                }
                            } catch (e) {
                                this.emit('log', serverId, `[${scriptName}] ${line}\n`);
                            }
                        }
                    });

                    proc.stderr.on('data', (data) => {
                        const lines = data.toString().split('\n');
                        for (const line of lines) {
                            if (!line.trim()) continue;
                            this.emit('log', serverId, `[Automation Error] [${scriptName}] ${line}\n`);
                        }
                    });

                    proc.on('close', (code) => {
                        if (!isDead) {
                            isDead = true;
                            clearTimeout(timer);
                            if (code !== 0 && code !== null) {
                                this.emit('log', serverId, `[Automation Error] Script "${scriptName}" exited with code ${code}\n`);
                            }
                            resolve();
                        }
                    });

                    proc.on('error', (err) => {
                        if (!isDead) {
                            isDead = true;
                            clearTimeout(timer);
                            this.emit('log', serverId, `[Automation Error] Script "${scriptName}" process error: ${err.message}\n`);
                            resolve();
                        }
                    });

                    // Write context JSON followed by code
                    proc.stdin.write(JSON.stringify(context) + '\n');
                    proc.stdin.write(scriptCode);
                    proc.stdin.end();
                };

                child.on('error', onSpawnError);
                if (child.pid) {
                    setupStreams(child);
                }
            });
        } finally {
            this.activeWorkers.delete(workerId);
            process.nextTick(() => this.processQueue());
        }
    }

    handleAction(serverId, action) {
        const sid = action.server_id || serverId;
        if (action.__minepanel_action__ === 'send_command') {
            try {
                processManager.sendCommand(sid, action.command);
                logger.info(`[Automation] Executed command on server ${sid}: "${action.command}"`);
            } catch (err) {
                logger.error(`[Automation] Failed to execute command: ${err.message}`);
                this.emit('log', serverId, `[Automation Error] Failed to execute command on server ${sid}: ${err.message}\n`);
            }
        } else if (action.__minepanel_action__ === 'log') {
            logger.info(`[Automation Script Log] Server ${serverId}: ${action.message}`);
            this.emit('log', serverId, `[Automation Log] ${action.message}\n`);
        }
    }
}

module.exports = new WorkerManager();
