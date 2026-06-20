/**
 * UpdateManager.js
 *
 * Orchestrates the full software update lifecycle for a single server:
 *   1. Check if a newer version is available          (checkForUpdate)
 *   2. Run the update: stop → backup → swap jar       (runUpdate)
 *   3. Rollback to the most recent pre-update backup  (rollback)
 *
 * Concurrency: uses the existing processManager lock so no two lifecycle
 * operations (start/stop/update/rollback) can run on the same server at once.
 *
 * This module is intentionally free of Express and database imports so it
 * can be unit-tested without starting the whole panel.
 */

'use strict';

const path           = require('path');
const fs             = require('fs');
const { dbRun, dbGet } = require('../../db/database');
const { resolveJar, downloadJar } = require('../resolvers');
const { getServer, getServerDir, createBackup } = require('../serverHelper');
const processManager = require('../processManager');
const compatibility  = require('./CompatibilityEngine');
const logger         = require('../utils/logger');

// Per-server in-memory update state  (cleared on process restart — intentional)
// Map<serverId, { status, message, availableVersion, checkedAt, runAt }>
const _state = new Map();

function getState(serverId) {
    return _state.get(String(serverId)) || { status: 'idle', message: null };
}

function setState(serverId, patch) {
    _state.set(String(serverId), { ...getState(serverId), ...patch });
}

/**
 * Check whether a newer software build is available for a server.
 *
 * @param {number|string} serverId
 * @returns {Promise<{
 *   available: boolean,
 *   currentVersion: string,
 *   latestVersion: string|null,
 *   compatible: boolean,
 *   compatibilityReason: string,
 *   source: string,
 * }>}
 */
async function checkForUpdate(serverId) {
    const server = await getServer(serverId);
    if (!server) throw new Error(`Server ${serverId} not found`);

    setState(serverId, { status: 'checking', message: 'Checking for updates…' });

    let latestInfo;
    try {
        latestInfo = await resolveJar(server.software, 'latest');
    } catch (err) {
        setState(serverId, { status: 'idle', message: null });
        throw new Error(`Failed to resolve latest version: ${err.message}`);
    }

    // latestInfo.minecraftVersion is the MC version targeted by the build
    // latestInfo.version is the build/release identifier
    const latestMcVersion = latestInfo.minecraftVersion || latestInfo.version;
    const currentVersion  = server.version;

    const available = latestMcVersion !== currentVersion;
    const forceFlag = !!server.force_incompatible_updates;
    const compat    = compatibility.check(currentVersion, latestMcVersion, forceFlag);

    // Persist last-checked timestamp
    await dbRun(
        'UPDATE servers SET last_update_check = ? WHERE id = ?',
        [new Date().toISOString(), serverId]
    );

    setState(serverId, {
        status: 'idle',
        message: null,
        availableVersion: available ? latestMcVersion : null,
        checkedAt: new Date().toISOString(),
    });

    return {
        available,
        currentVersion,
        latestVersion:        latestMcVersion,
        buildVersion:         latestInfo.version,
        compatible:           compat.compatible,
        compatibilityReason:  compat.reason,
        changeType:           compatibility.changeType(currentVersion, latestMcVersion),
        source:               latestInfo.source || 'api',
    };
}

/**
 * Execute an update:  stop → backup → download new jar → swap → restart (if was running).
 *
 * @param {number|string} serverId
 * @param {object}        [opts]
 * @param {string}        [opts.targetVersion='latest']  Minecraft version to update to
 * @param {boolean}       [opts.skipBackup=false]        Override backup (NOT recommended)
 * @returns {Promise<{ success: boolean, backupFile: string|null, newVersion: string }>}
 */
async function runUpdate(serverId, opts = {}) {
    const { targetVersion = 'latest', skipBackup = false } = opts;

    const server = await getServer(serverId);
    if (!server) throw new Error(`Server ${serverId} not found`);

    // Acquire lifecycle lock — fail fast if another operation is in progress
    if (!processManager.acquireLock(serverId)) {
        throw new Error('Another lifecycle operation is in progress for this server.');
    }

    const wasRunning = processManager.getStatus(String(serverId)) === 'online';
    let backupFile   = null;
    let jarInfo;

    try {
        setState(serverId, { status: 'updating', message: 'Resolving version…' });

        // 1. Resolve the target build first (fail early if unavailable)
        jarInfo = await resolveJar(server.software, targetVersion);
        const newMcVersion = jarInfo.minecraftVersion || jarInfo.version;

        // 2. Compatibility check
        const forceFlag = !!server.force_incompatible_updates;
        const compat    = compatibility.check(server.version, newMcVersion, forceFlag);
        if (!compat.compatible) {
            throw new Error(`Compatibility check failed: ${compat.reason}`);
        }

        // 3. Stop the server gracefully (if running)
        if (wasRunning) {
            setState(serverId, { status: 'updating', message: 'Stopping server…' });
            await processManager.gracefulStop(String(serverId), 30_000);
        }

        // 4. Backup (unless explicitly skipped or setting disabled)
        const shouldBackup = !skipBackup && (server.auto_backup_before_update !== 0);
        if (shouldBackup) {
            setState(serverId, { status: 'updating', message: 'Creating pre-update backup…' });
            try {
                const serverDir = getServerDir(server);
                const bk = await createBackup(serverDir, `pre-update-${server.version}`);
                backupFile = bk.filename;
                logger.info(`[UpdateManager] Pre-update backup created: ${backupFile} (server ${serverId})`);
            } catch (backupErr) {
                logger.error(`[UpdateManager] Backup failed for server ${serverId}:`, backupErr.message);
                // Re-raise: never proceed with update without backup if setting is ON
                throw new Error(`Pre-update backup failed: ${backupErr.message}`);
            }
        }

        // 5. Download the new jar
        setState(serverId, { status: 'updating', message: `Downloading ${jarInfo.version}…` });
        const finalJarInfo = await downloadJar(jarInfo);

        // 6. Swap the jar
        const serverDir = getServerDir(server);
        const targetJar = path.join(serverDir, 'server.jar');
        try { fs.unlinkSync(targetJar); } catch (_) {}
        fs.copyFileSync(finalJarInfo.localPath, targetJar);
        logger.info(`[UpdateManager] Swapped server.jar for server ${serverId} → ${jarInfo.version}`);

        // 7. Persist new version in DB
        await dbRun(
            'UPDATE servers SET version = ?, last_update_run = ? WHERE id = ?',
            [newMcVersion, new Date().toISOString(), serverId]
        );

        setState(serverId, {
            status: 'idle',
            message: null,
            runAt: new Date().toISOString(),
        });

        return { success: true, backupFile, newVersion: newMcVersion };
    } catch (err) {
        logger.error(`[UpdateManager] Update failed for server ${serverId}:`, err.message);
        setState(serverId, { status: 'error', message: err.message });
        throw err;
    } finally {
        processManager.releaseLock(serverId);
    }
}

/**
 * Roll back to the most recent pre-update backup.
 *
 * Finds the newest "pre-update-*.zip" in the server's backups/ dir,
 * extracts server.jar from it, and replaces the current jar.
 *
 * @param {number|string} serverId
 * @returns {Promise<{ success: boolean, restoredFrom: string }>}
 */
async function rollback(serverId) {
    const server = await getServer(serverId);
    if (!server) throw new Error(`Server ${serverId} not found`);

    if (!processManager.acquireLock(serverId)) {
        throw new Error('Another lifecycle operation is in progress for this server.');
    }

    try {
        setState(serverId, { status: 'rolling_back', message: 'Finding latest backup…' });

        const serverDir  = getServerDir(server);
        const backupsDir = path.join(serverDir, 'backups');

        if (!fs.existsSync(backupsDir)) {
            throw new Error('No backups directory found.');
        }

        // Find most-recent pre-update backup
        const backups = fs.readdirSync(backupsDir)
            .filter(f => f.startsWith('pre-update-') && f.endsWith('.zip'))
            .map(f => ({ name: f, mtime: fs.statSync(path.join(backupsDir, f)).mtime }))
            .sort((a, b) => b.mtime - a.mtime);

        if (backups.length === 0) {
            throw new Error('No pre-update backups found to roll back to.');
        }

        const latest    = backups[0];
        const backupZip = path.join(backupsDir, latest.name);

        // Stop server if running
        if (processManager.getStatus(String(serverId)) === 'online') {
            setState(serverId, { status: 'rolling_back', message: 'Stopping server for rollback…' });
            await processManager.gracefulStop(String(serverId), 30_000);
        }

        setState(serverId, { status: 'rolling_back', message: `Extracting ${latest.name}…` });

        // Extract server.jar from backup zip using adm-zip (already a dep)
        const AdmZip = require('adm-zip');
        const zip    = new AdmZip(backupZip);
        const entry  = zip.getEntry('server.jar');
        if (!entry) {
            throw new Error(`Backup ${latest.name} does not contain server.jar`);
        }

        const targetJar = path.join(serverDir, 'server.jar');
        try { fs.unlinkSync(targetJar); } catch (_) {}
        zip.extractEntryTo(entry, serverDir, false, true);

        logger.info(`[UpdateManager] Rolled back server ${serverId} from ${latest.name}`);
        setState(serverId, { status: 'idle', message: null });

        return { success: true, restoredFrom: latest.name };
    } catch (err) {
        logger.error(`[UpdateManager] Rollback failed for server ${serverId}:`, err.message);
        setState(serverId, { status: 'error', message: err.message });
        throw err;
    } finally {
        processManager.releaseLock(serverId);
    }
}

module.exports = { checkForUpdate, runUpdate, rollback, getState };
