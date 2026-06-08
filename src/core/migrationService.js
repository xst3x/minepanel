/**
 * MigrationService — orchestrates migration of ALL servers between
 * Native (Java process) and Docker (container) execution modes.
 *
 * Each server is migrated sequentially and atomically:
 * - On failure, the server is reverted to its previous working state.
 * - Server files are NEVER deleted during migration.
 *
 * Progress is emitted as events and also stored in-memory for polling.
 */

const EventEmitter = require('events');
const path = require('path');
const logger = require('./utils/logger');
const processManager = require('./processManager');
const dockerService = require('./dockerService');
const { dbAll, dbGet, dbRun } = require('../db/database');
const { getServerDir } = require('./serverHelper');

// Migration status per server
// { serverId: { status: 'pending'|'running'|'success'|'failed', error?: string } }
const migrationStatus = new Map();

class MigrationService extends EventEmitter {
    constructor() {
        super();
        this._migrating = false;
    }

    isMigrating() {
        return this._migrating;
    }

    getStatus() {
        const result = {};
        for (const [id, val] of migrationStatus.entries()) {
            result[id] = { ...val };
        }
        return result;
    }

    _setStatus(serverId, status, error = null, message = null) {
        const entry = {
            status,
            ...(error ? { error: String(error) } : {}),
            ...(message ? { message } : {}),
        };
        migrationStatus.set(String(serverId), entry);
        this.emit('progress', { serverId: String(serverId), ...entry });
        logger.info(`[MigrationService] Server ${serverId}: ${status}${message ? ' — ' + message : ''}${error ? ' — ' + error : ''}`);
    }

    /**
     * Migrate all servers to the target mode ('docker' or 'native').
     * Called when the global Docker toggle is changed.
     */
    async migrateAllServers(targetMode) {
        if (this._migrating) {
            throw new Error('A migration is already in progress. Please wait.');
        }
        this._migrating = true;
        migrationStatus.clear();

        try {
            const servers = await dbAll('SELECT * FROM servers');
            if (!servers || servers.length === 0) {
                return { success: true, results: [] };
            }

            const results = [];
            for (const server of servers) {
                this._setStatus(server.id, 'pending');
            }

            for (const server of servers) {
                let result;
                if (targetMode === 'docker') {
                    result = await this.migrateToDocker(server);
                } else {
                    result = await this.migrateToNative(server);
                }
                results.push(result);
            }

            const allSuccess = results.every(r => r.success);
            return { success: allSuccess, results };
        } finally {
            this._migrating = false;
        }
    }

    /**
     * Migrate a single server from Native → Docker.
     * Steps:
     *   1. Stop the Java process (if running)
     *   2. Create Docker container with server dir bind-mounted
     *   3. Start the container
     *   4. Update server record (execution_mode = 'docker')
     * Rollback: restart Java process if container creation or start fails.
     */
    async migrateToDocker(server) {
        const serverId = server.id;
        this._setStatus(serverId, 'running');

        const wasRunning = processManager.getStatus(String(serverId)) === 'online';
        let containerCreated = false;

        try {
            // Step 1: Stop Java process if running
            if (wasRunning) {
                logger.info(`[MigrationService] Stopping Java process for server ${serverId}`);
                const stopResult = await processManager.gracefulStop(String(serverId), 20000);
                if (!stopResult.graceful) {
                    // Force-kill if graceful stop timed out
                    try { processManager.kill(String(serverId)); } catch (_) {}
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            // Step 2: Create container (bind-mount existing server dir)
            const serverDir = getServerDir(server);
            this._setStatus(serverId, 'pulling', null, 'Pulling Docker image…');
            const { containerId } = await dockerService.createContainer(server, serverDir);
            containerCreated = true;

            // Step 3: Start container
            await dockerService.startContainer(serverId);

            // Step 4: Update DB
            await dbRun('UPDATE servers SET execution_mode = ? WHERE id = ?', ['docker', serverId]);

            this._setStatus(serverId, 'success');
            return { serverId, success: true };
        } catch (e) {
            logger.error(`[MigrationService] migrateToDocker failed for server ${serverId}: ${e.message}`);

            // Rollback: remove container if it was created
            if (containerCreated) {
                try { await dockerService.removeContainer(serverId, { force: true, silent: true }); } catch (_) {}
            }

            // Rollback: restart Java process if it was running before
            if (wasRunning) {
                try {
                    await this._restartNative(server);
                } catch (restartErr) {
                    logger.error(`[MigrationService] Rollback restart failed for server ${serverId}: ${restartErr.message}`);
                }
            }

            this._setStatus(serverId, 'failed', e.message);
            return { serverId, success: false, error: e.message };
        }
    }

    /**
     * Migrate a single server from Docker → Native.
     * Steps:
     *   1. Stop the container
     *   2. Ensure files are accessible (they are — it's a bind mount)
     *   3. Start Java process
     *   4. Update server record (execution_mode = 'native')
     *   5. Remove container
     * Rollback: restart container if Java process fails to start.
     */
    async migrateToNative(server) {
        const serverId = server.id;
        this._setStatus(serverId, 'running');

        const containerStatus = await dockerService.getContainerStatus(serverId);
        const wasRunning = containerStatus === 'running';
        let processStarted = false;

        try {
            // Step 1: Stop container if running
            if (wasRunning) {
                logger.info(`[MigrationService] Stopping container for server ${serverId}`);
                await dockerService.stopContainer(serverId, 30);
            }

            // Step 2: Files remain in place (bind mount = host directory unchanged)
            // Nothing to do here.

            // Step 3: Start Java process (only if it was previously running in Docker)
            if (wasRunning) {
                await this._restartNative(server);
                processStarted = true;
            }

            // Step 4: Update DB
            await dbRun('UPDATE servers SET execution_mode = ? WHERE id = ?', ['native', serverId]);

            // Step 5: Remove container (files are safe — host dir untouched)
            try {
                await dockerService.removeContainer(serverId, { force: false, silent: false });
            } catch (removeErr) {
                // Non-fatal: container removal failure doesn't break native mode
                logger.warn(`[MigrationService] Failed to remove container for server ${serverId}: ${removeErr.message}`);
            }

            this._setStatus(serverId, 'success');
            return { serverId, success: true };
        } catch (e) {
            logger.error(`[MigrationService] migrateToNative failed for server ${serverId}: ${e.message}`);

            // Rollback: if Java process failed to start but container was stopped, restart container
            if (wasRunning && !processStarted) {
                try {
                    await dockerService.startContainer(serverId);
                    logger.info(`[MigrationService] Rollback: container restarted for server ${serverId}`);
                } catch (restartErr) {
                    logger.error(`[MigrationService] Rollback container restart failed for server ${serverId}: ${restartErr.message}`);
                }
            }

            this._setStatus(serverId, 'failed', e.message);
            return { serverId, success: false, error: e.message };
        }
    }

    /**
     * Start a server as a native Java process using existing processManager logic.
     */
    async _restartNative(server) {
        // Re-read fresh server record for latest settings
        const fresh = await dbGet('SELECT * FROM servers WHERE id = ?', [server.id]);
        if (!fresh) throw new Error(`Server ${server.id} not found in database`);

        const serverDir = getServerDir(fresh);

        // Build start args using same logic as serverRoutes (inline helper below)
        let startInfo;
        try {
            startInfo = buildStartInfo(fresh, serverDir);
        } catch (e) {
            throw new Error(`Failed to build start info for server ${fresh.id}: ${e.message}`);
        }

        processManager.clearHistory(String(fresh.id));
        processManager.start(
            String(fresh.id),
            serverDir,
            [],
            startInfo.jarFile,
            fresh.ram_mb,
            startInfo.customArgs,
            fresh.java_path || 'java'
        );
    }
}

/**
 * Build start info (jarFile + customArgs) for a server.
 * Mirrors the logic in serverRoutes.js getStartInfo().
 */
function buildStartInfo(server, serverDir) {
    const path = require('path');
    const fs = require('fs');

    const jarFile = path.join(serverDir, 'server.jar');
    const STRIP_FLAGS = ['-XX:+UseCompactObjectHeaders', '-XX:-UseCompactObjectHeaders'];

    function filterJvmArgs(args) {
        return args.filter(arg => !STRIP_FLAGS.includes(arg.trim()));
    }

    let customArgs = null;
    try {
        if (server.software === 'forge') {
            const isWin = process.platform === 'win32';
            const runScript = path.join(serverDir, isWin ? 'run.bat' : 'run.sh');
            if (fs.existsSync(runScript)) {
                const content = fs.readFileSync(runScript, 'utf8');
                const lines = content.split('\n');
                for (const line of lines) {
                    if (line.trim().startsWith('java ')) {
                        let argsStr = line.trim().substring(5);
                        argsStr = argsStr.replace(/%\*/g, '').replace(/"\$@"/g, '').replace(/\$@/g, '').trim();
                        if (argsStr.includes('@user_jvm_args.txt') || argsStr.includes('libraries/')) {
                            let parsedArgs = argsStr.split(/\s+/).filter(a => a.length > 0);
                            const userJvmArgsFile = path.join(serverDir, 'user_jvm_args.txt');
                            const userJvmIdx = parsedArgs.indexOf('@user_jvm_args.txt');
                            if (userJvmIdx !== -1) {
                                let userJvmFlags = [];
                                if (fs.existsSync(userJvmArgsFile)) {
                                    const userJvmContent = fs.readFileSync(userJvmArgsFile, 'utf8');
                                    userJvmFlags = userJvmContent
                                        .split('\n')
                                        .map(l => l.trim())
                                        .filter(l => l.length > 0 && !l.startsWith('#'));
                                    userJvmFlags = filterJvmArgs(userJvmFlags);
                                }
                                parsedArgs.splice(userJvmIdx, 1, ...userJvmFlags);
                            }
                            const expandedArgs = [];
                            for (const arg of parsedArgs) {
                                if (!STRIP_FLAGS.includes(arg.trim())) expandedArgs.push(arg);
                            }
                            customArgs = expandedArgs;
                            break;
                        }
                    }
                }
            }
        }
    } catch (_) {}

    return { jarFile, customArgs };
}

module.exports = new MigrationService();
