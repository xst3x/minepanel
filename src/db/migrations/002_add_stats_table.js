// Migration 002: Server Statistics Table
// Stores periodic telemetry snapshots (RAM, CPU, TPS, Players) per server.
// Includes a collected_at index for fast range queries and efficient 7-day pruning.

module.exports = {
    version: 2,
    description: 'Add server_stats table for telemetry (RAM, CPU, TPS, Players)',

    up: async (dbRun) => {

        // ── Server Stats ───────────────────────────────────────────────────────
        await dbRun(`
            CREATE TABLE IF NOT EXISTS server_stats (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id   INTEGER NOT NULL,
                ram_bytes   INTEGER NOT NULL DEFAULT 0,
                cpu_percent REAL    NOT NULL DEFAULT 0,
                tps         REAL,
                players     INTEGER NOT NULL DEFAULT 0,
                collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
            )
        `);

        // Index for fast range queries and pruning
        await dbRun(`
            CREATE INDEX IF NOT EXISTS idx_server_stats_server_time
            ON server_stats (server_id, collected_at)
        `);
    },

    down: async (dbRun) => {
        await dbRun(`DROP INDEX IF EXISTS idx_server_stats_server_time`);
        await dbRun(`DROP TABLE IF EXISTS server_stats`);
    },
};
