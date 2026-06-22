// Migration 016: Logic-block automation rules
// Creates automation_rules table for per-server IF/THEN automation

module.exports = {
    version: 16,
    description: 'Add automation_rules table',

    up: async (dbRun) => {
        await dbRun(`
            CREATE TABLE IF NOT EXISTS automation_rules (
                id            TEXT PRIMARY KEY,
                server_id     INTEGER NOT NULL,
                name          TEXT NOT NULL DEFAULT 'Unnamed Rule',
                enabled       INTEGER NOT NULL DEFAULT 1,
                trigger_json  TEXT NOT NULL DEFAULT '{}',
                actions_json  TEXT NOT NULL DEFAULT '[]',
                cooldown_sec  INTEGER NOT NULL DEFAULT 60,
                last_triggered_at DATETIME,
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await dbRun(`
            CREATE INDEX IF NOT EXISTS idx_automation_server
            ON automation_rules (server_id, enabled)
        `);
    },

    down: async (dbRun) => {
        await dbRun(`DROP TABLE IF EXISTS automation_rules`);
    },
};
