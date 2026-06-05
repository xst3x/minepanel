// Migration 008: Server automation options
// Adds autostart, autostart_on_crash columns to servers table

module.exports = {
    version: 8,
    description: 'Add autostart and autostart_on_crash to servers',

    up: async (dbRun) => {
        const backfill = [
            `ALTER TABLE servers ADD COLUMN autostart INTEGER DEFAULT 0`,
            `ALTER TABLE servers ADD COLUMN autostart_on_crash INTEGER DEFAULT 0`,
        ];
        for (const sql of backfill) {
            await dbRun(sql).catch(() => {}); // ignore if column already exists
        }
    },

    down: async (_dbRun) => {
        // SQLite does not support DROP COLUMN in older versions; no-op
    },
};
