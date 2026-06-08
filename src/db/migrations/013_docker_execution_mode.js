// Migration 013 — Docker execution mode support
// Adds execution_mode column to servers table.
// Also adds docker_container_id for reference (informational only).
module.exports = {
    version: 13,
    description: 'Add execution_mode and docker_container_id to servers table',
    up: async (db) => {
        // execution_mode: 'native' | 'docker'
        try {
            await db(`ALTER TABLE servers ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'native'`);
        } catch (e) {
            if (!e.message.includes('duplicate column')) throw e;
        }
        // Store the container ID for reference/cleanup
        try {
            await db(`ALTER TABLE servers ADD COLUMN docker_container_id TEXT DEFAULT NULL`);
        } catch (e) {
            if (!e.message.includes('duplicate column')) throw e;
        }
    },
};
