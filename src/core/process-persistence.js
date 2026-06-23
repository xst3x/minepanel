/**
 * Persistence utilities for saving/loading running servers from disk.
 * Extracted from processManager.js — single responsibility.
 */
const fs = require('fs');
const path = require('path');

/** @type {string} */
const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../../data');
const runningServersFile = path.join(dataDir, 'running_servers.json');

/**
 * Save running server processes to disk for crash recovery.
 * @param {Map} processes serverId → ChildProcess
 */
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

/**
 * Load running servers from disk (for recovery after crash/restart).
 * @returns {Array<{serverId: string, pid: number, startInfo: object|null}>}
 */
function loadRunningServers() {
    try {
        if (fs.existsSync(runningServersFile)) {
            const raw = fs.readFileSync(runningServersFile, 'utf8');
            if (!raw || !raw.trim()) {
                return [];
            }
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('[ProcessManager] Failed to load running servers (corrupt file, resetting to empty):', e);
        try {
            fs.writeFileSync(runningServersFile, '[]', 'utf8');
        } catch (writeErr) {
            console.error('[ProcessManager] Failed to reset corrupt running servers file:', writeErr);
        }
    }
    return [];
}

module.exports = { saveRunningServers, loadRunningServers };
