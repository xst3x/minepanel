// Migration 005: Statistics retention configuration
// Keeps Stage 6 retention settings in SQLite instead of hardcoding them only.

module.exports = {
    version: 5,
    description: 'Add statistics_config retention settings',

    up: async (dbRun) => {
        await dbRun(`
            CREATE TABLE IF NOT EXISTS statistics_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbRun(`
            INSERT INTO statistics_config (key, value)
            VALUES ('retention_days', '7')
            ON CONFLICT(key) DO NOTHING
        `);

        await dbRun(`
            INSERT INTO statistics_config (key, value)
            VALUES ('collection_interval_seconds', '30')
            ON CONFLICT(key) DO NOTHING
        `);
    },

    down: async (dbRun) => {
        await dbRun(`DROP TABLE IF EXISTS statistics_config`);
    },
};
