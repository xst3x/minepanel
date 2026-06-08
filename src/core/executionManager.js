/**
 * ExecutionManager — unified status and control layer that abstracts over
 * Native (processManager) and Docker (dockerService) execution modes.
 *
 * Used by serverRoutes and the WebSocket handler to report accurate status
 * regardless of execution mode.
 */

const processManager = require('./processManager');
const dockerService = require('./dockerService');
const { dbGet } = require('../db/database');
const logger = require('./utils/logger');

/**
 * Get the execution mode for a server.
 * Returns 'native' or 'docker'.
 */
async function getExecutionMode(serverId) {
    try {
        const row = await dbGet('SELECT execution_mode FROM servers WHERE id = ?', [serverId]);
        return (row && row.execution_mode) || 'native';
    } catch (e) {
        return 'native';
    }
}

/**
 * Get unified status for a server: 'online' or 'offline'.
 * Checks the appropriate backend based on execution mode.
 */
async function getStatus(serverId) {
    const mode = await getExecutionMode(serverId);
    if (mode === 'docker') {
        try {
            const containerStatus = await dockerService.getContainerStatus(serverId);
            return containerStatus === 'running' ? 'online' : 'offline';
        } catch (e) {
            return 'offline';
        }
    }
    return processManager.getStatus(String(serverId));
}

/**
 * Get stats (cpu, ram) for a server.
 */
async function getStats(serverId) {
    const mode = await getExecutionMode(serverId);
    if (mode === 'docker') {
        return dockerService.getContainerStats(serverId);
    }
    return processManager.getStats(String(serverId));
}

module.exports = { getExecutionMode, getStatus, getStats };
