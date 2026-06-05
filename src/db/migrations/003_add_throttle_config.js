// Migration 003 — Add throttle_config column to servers table
module.exports = {
    version: 3,
    description: 'Add throttle_config column to servers for RAM/CPU throttle settings',
    async up(dbRun) {
        await dbRun(`ALTER TABLE servers ADD COLUMN throttle_config TEXT DEFAULT NULL`);
    },
    // SQLite <3.35 does not support DROP COLUMN; mark as no-op with a comment.
    async down(dbRun) {
        // Column removal not supported in SQLite < 3.35 — this is a no-op rollback.
        // On modern SQLite (>=3.35) you could run: ALTER TABLE servers DROP COLUMN throttle_config
    },
};
