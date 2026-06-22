// Migration 017: Visual Block Automation Fields
// Adds nodes_json and edges_json nullable columns to automation_rules for graph rules

module.exports = {
    version: 17,
    description: 'Add nodes_json and edges_json to automation_rules',

    up: async (dbRun) => {
        await dbRun(`ALTER TABLE automation_rules ADD COLUMN nodes_json TEXT DEFAULT NULL`);
        await dbRun(`ALTER TABLE automation_rules ADD COLUMN edges_json TEXT DEFAULT NULL`);
    },

    down: async (dbRun) => {
        // SQLite doesn't easily support dropping columns in older versions.
        // We can leave this as a no-op or just empty.
    },
};
