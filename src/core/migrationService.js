/**
 * migrationService.js — REMOVED.
 * Docker migration support has been removed from MinePanel.
 * This stub exists only to prevent require() errors.
 */

const EventEmitter = require('events');

class MigrationService extends EventEmitter {
    isMigrating() { return false; }
    getStatus()   { return {}; }
    async migrateAllServers() { return { success: true, results: [] }; }
}

module.exports = new MigrationService();
