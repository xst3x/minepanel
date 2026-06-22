// Migration 018: Python Automations Schema
// Adds script to automation_rules and automation_enabled to servers

module.exports = {
    version: 18,
    description: 'Add script column to automation_rules and automation_enabled to servers',

    up: async (dbRun) => {
        try {
            await dbRun(`ALTER TABLE automation_rules ADD COLUMN script TEXT DEFAULT NULL`);
        } catch (err) {
            // If the column already exists (e.g. from a partial/manual update), log and continue
            console.warn(`[Migrations] Column 'script' might already exist: ${err.message}`);
        }
        try {
            await dbRun(`ALTER TABLE servers ADD COLUMN automation_enabled INTEGER NOT NULL DEFAULT 0`);
        } catch (err) {
            // If the column already exists, log and continue
            console.warn(`[Migrations] Column 'automation_enabled' might already exist: ${err.message}`);
        }
    },

    down: async (dbRun) => {
        // SQLite does not support dropping columns easily.
    },
};
