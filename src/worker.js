// src/worker.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const processManager = require('./core/processManager');
const logger = require('./core/utils/logger');

logger.info(`[Worker] Started worker process on PID ${process.pid}`);

if (!process.send) {
    logger.error('[Worker] Fatal: Worker process was not spawned with IPC enabled.');
    process.exit(1);
}

// Periodically gather and send stats for all online servers
const statsInterval = setInterval(async () => {
    for (const [serverId, child] of processManager.processes.entries()) {
        try {
            const stats = await processManager.getStats(serverId);
            process.send({
                type: 'stats',
                serverId,
                stats
            });
        } catch (err) {
            // Ignore stats errors
        }
    }
}, 2000);

// Setup IPC handlers
process.on('message', async (message) => {
    if (!message || typeof message !== 'object') return;
    const { type, requestId, serverId } = message;

    try {
        switch (type) {
            case 'start-server': {
                const { serverDir, javaArgs, jarFile, ramMb, customArgs, javaPath, spawnEnv, mode } = message;
                processManager.start(serverId, serverDir, javaArgs, jarFile, ramMb, customArgs, javaPath, spawnEnv, mode);
                process.send({ type: 'start-server-response', requestId, serverId, result: { success: true } });
                break;
            }
            case 'stop-server': {
                processManager.stop(serverId);
                process.send({ type: 'stop-server-response', requestId, serverId, result: { success: true } });
                break;
            }
            case 'graceful-stop': {
                const { timeoutMs } = message;
                const result = await processManager.gracefulStop(serverId, timeoutMs);
                process.send({ type: 'graceful-stop-response', requestId, serverId, result });
                break;
            }
            case 'restart-graceful': {
                const { serverDir, javaArgs, jarFile, ramMb, timeoutMs, customArgs, javaPath, spawnEnv, mode } = message;
                const result = await processManager.restartGraceful(serverId, serverDir, javaArgs, jarFile, ramMb, timeoutMs, customArgs, javaPath, spawnEnv, mode);
                process.send({ type: 'restart-graceful-response', requestId, serverId, result });
                break;
            }
            case 'kill-server': {
                processManager.kill(serverId);
                process.send({ type: 'kill-server-response', requestId, serverId, result: { success: true } });
                break;
            }
            case 'send-command': {
                const { command } = message;
                processManager.sendCommand(serverId, command);
                break;
            }
            case 'clear-history': {
                processManager.clearHistory(serverId);
                break;
            }
            case 'ping': {
                process.send({ type: 'pong', requestId });
                break;
            }
            default:
                logger.warn(`[Worker] Unhandled message type: ${type}`);
        }
    } catch (err) {
        logger.error(`[Worker] Error handling ${type} for server ${serverId}:`, err);
        process.send({
            type: `${type}-response`,
            requestId,
            serverId,
            error: err.message
        });
    }
});

// Event forwarding from ProcessManager
processManager.on('console', (serverId, data) => {
    process.send({ type: 'log', serverId, data });
});

processManager.on('status', (serverId, status) => {
    // If we recovered a process, we also send its PID
    const child = processManager.processes.get(serverId);
    process.send({ type: 'status', serverId, status, pid: child ? child.pid : null });
});

processManager.on('clear_console', (serverId) => {
    process.send({ type: 'clear-console', serverId });
});

processManager.on('crash', (serverId, info) => {
    process.send({ type: 'crash', serverId, info });
});

const shutdown = () => {
    clearInterval(statsInterval);
    logger.info('[Worker] Shutting down worker...');
    process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('disconnect', () => {
    logger.warn('[Worker] IPC channel disconnected. Shutting down...');
    shutdown();
});
