/**
 * UpdateScheduler.js
 *
 * Background scheduler that periodically checks all auto-update-enabled
 * servers and triggers updates when a newer version is available.
 *
 * Design:
 *  - Runs in the main process via setInterval (simple, no worker thread needed
 *    for the polling phase; the actual update still runs async).
 *  - Each server gets its own timer based on `update_interval_hours`.
 *  - Per-server lock (via UpdateManager/processManager) prevents double-runs.
 *  - Errors are caught per-server; one failure never blocks others.
 *
 * Usage (called once from minepanel.js / app bootstrap):
 *   const UpdateScheduler = require('./core/update/UpdateScheduler');
 *   UpdateScheduler.start();
 */

'use strict';

const { dbAll, dbRun } = require('../../db/database');
const UpdateManager    = require('./UpdateManager');
const logger           = require('../utils/logger');

// Minimum poll interval — prevents scheduler running more often than 5 minutes
// even if a server has a very small update_interval_hours value.
const MIN_POLL_MS = 5 * 60 * 1000;

// Global scheduler tick — runs every minute and checks which servers are due.
const TICK_MS = 60 * 1000;

let _tickHandle = null;
let _running    = false;

/**
 * Determine whether a server is due for its periodic update check.
 * @param {object} server - row from servers table
 * @returns {boolean}
 */
function isDue(server) {
    const intervalHours = Math.max(1, server.update_interval_hours || 12);
    const intervalMs    = intervalHours * 60 * 60 * 1000;
    if (!server.last_update_check) return true; // never checked
    const lastCheck = new Date(server.last_update_check).getTime();
    return Date.now() - lastCheck >= intervalMs;
}

/**
 * Process one server: check for update → run update if enabled.
 * All errors are caught; this function never throws.
 * @param {object} server
 */
async function _processServer(server) {
    const sid = server.id;
    try {
        const result = await UpdateManager.checkForUpdate(sid);

        if (!result.available) return; // nothing to do

        if (!result.compatible && !server.force_incompatible_updates) {
            logger.info(
                `[UpdateScheduler] Server ${sid} (${server.name}): ` +
                `update available (${result.currentVersion} → ${result.latestVersion}) ` +
                `but incompatible — skipping. Enable force_incompatible_updates to allow.`
            );
            return;
        }

        logger.info(
            `[UpdateScheduler] Server ${sid} (${server.name}): ` +
            `running auto-update ${result.currentVersion} → ${result.latestVersion}`
        );

        const updateResult = await UpdateManager.runUpdate(sid, {
            targetVersion: 'latest',
            skipBackup: false, // always back up via scheduler
        });

        logger.info(
            `[UpdateScheduler] Server ${sid} (${server.name}): ` +
            `update complete. New version: ${updateResult.newVersion}. ` +
            `Backup: ${updateResult.backupFile || 'none'}`
        );
    } catch (err) {
        logger.error(
            `[UpdateScheduler] Error processing server ${sid} (${server.name}):`,
            err.message
        );
    }
}

/**
 * Single scheduler tick: load enabled servers, check which are due, run.
 */
async function _tick() {
    if (_running) return; // previous tick still running
    _running = true;
    try {
        const servers = await dbAll(
            'SELECT * FROM servers WHERE auto_update_software = 1'
        );
        if (!servers || servers.length === 0) return;

        const due = servers.filter(isDue);
        if (due.length === 0) return;

        logger.info(`[UpdateScheduler] Tick: ${due.length} server(s) due for update check`);

        // Run all due servers concurrently (each has its own lock)
        await Promise.allSettled(due.map(_processServer));
    } catch (err) {
        logger.error('[UpdateScheduler] Tick error:', err.message);
    } finally {
        _running = false;
    }
}

/**
 * Start the background scheduler.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
function start() {
    if (_tickHandle) return; // already started
    logger.info(`[UpdateScheduler] Starting (tick every ${TICK_MS / 1000}s)`);
    _tickHandle = setInterval(_tick, TICK_MS);
    // Don't block process exit
    if (_tickHandle.unref) _tickHandle.unref();
    // Run one tick immediately (async, non-blocking)
    _tick().catch(() => {});
}

/**
 * Stop the scheduler (useful for graceful shutdown / tests).
 */
function stop() {
    if (_tickHandle) {
        clearInterval(_tickHandle);
        _tickHandle = null;
        logger.info('[UpdateScheduler] Stopped');
    }
}

module.exports = { start, stop };
