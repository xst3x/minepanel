/**
 * ExecutionManager — thin wrapper over processManager for native execution.
 * Docker support has been removed; all servers run as native Java processes.
 */

const processManager = require('./processManager');

/**
 * Get status for a server: 'online' or 'offline'.
 */
async function getStatus(serverId) {
    return processManager.getStatus(String(serverId));
}

/**
 * Get stats (cpu, ram) for a server.
 */
async function getStats(serverId) {
    return processManager.getStats(String(serverId));
}

module.exports = { getStatus, getStats };
