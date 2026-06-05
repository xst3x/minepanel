// Migration 007: Add disk_bytes column to server_stats
// Tracks server directory storage usage per collection cycle.

module.exports = {
    version: 7,
    description: 'Add disk_bytes column to server_stats for storage tracking',

    up: async (dbRun) => {
        await dbRun(`ALTER TABLE server_stats ADD COLUMN disk_bytes INTEGER NOT NULL DEFAULT 0`);
    },

    down: async (dbRun) => {
        // SQLite < 3.35 does not support DROP COLUMN — no-op rollback.
        // On SQLite >= 3.35: ALTER TABLE server_stats DROP COLUMN disk_bytes
    },
};
