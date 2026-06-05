// Migration 004 — Add threshold_rules column to servers table
module.exports = {
    version: 4,
    description: 'Add threshold_rules column to servers for multi-threshold escalation system',
    async up(dbRun) {
        await dbRun(`ALTER TABLE servers ADD COLUMN threshold_rules TEXT DEFAULT NULL`);
    },
    async down(dbRun) {
        // Column removal not supported in SQLite < 3.35 — no-op rollback.
    },
};
