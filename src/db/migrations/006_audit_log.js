// Migration 006: Audit Log Table
// Creates the audit_log table for tracking security-relevant events
// (login, logout, failed login, registration, password changes, admin actions).

module.exports = {
    version: 6,
    description: 'Add audit_log table for security event tracking',

    up: async (dbRun) => {
        await dbRun(`
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event TEXT NOT NULL,
                user_id INTEGER,
                username TEXT,
                ip TEXT,
                detail TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await dbRun(`
            CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log (event)
        `);

        await dbRun(`
            CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log (user_id)
        `);

        await dbRun(`
            CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log (created_at)
        `);
    },

    down: async (dbRun) => {
        await dbRun(`DROP INDEX IF EXISTS idx_audit_log_created_at`);
        await dbRun(`DROP INDEX IF EXISTS idx_audit_log_user_id`);
        await dbRun(`DROP INDEX IF EXISTS idx_audit_log_event`);
        await dbRun(`DROP TABLE IF EXISTS audit_log`);
    },
};
