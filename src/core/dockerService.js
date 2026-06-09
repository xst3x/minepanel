/**
 * dockerService.js — REMOVED.
 * Docker execution mode has been removed from MinePanel.
 * This stub exists only to prevent require() errors from any cached reference.
 */

const logger = require('./utils/logger');

function notAvailable(fnName) {
    return function () {
        logger.error(`[DockerService] ${fnName}() called but Docker support has been removed.`);
        throw new Error('Docker support has been removed from MinePanel.');
    };
}

module.exports = {
    pingDocker:         notAvailable('pingDocker'),
    containerName:      notAvailable('containerName'),
    createContainer:    notAvailable('createContainer'),
    startContainer:     notAvailable('startContainer'),
    stopContainer:      notAvailable('stopContainer'),
    removeContainer:    notAvailable('removeContainer'),
    getContainerStatus: notAvailable('getContainerStatus'),
    attachLogs:         notAvailable('attachLogs'),
    getLogsTail:        notAvailable('getLogsTail'),
    sendStdin:          notAvailable('sendStdin'),
    execInContainer:    notAvailable('execInContainer'),
    getContainerStats:  notAvailable('getContainerStats'),
    resetConnection:    notAvailable('resetConnection'),
};
