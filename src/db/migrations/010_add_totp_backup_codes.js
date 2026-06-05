// Migration 010: TOTP backup codes for account recovery
module.exports = {
    version: 10,
    description: 'Add totp_backup_codes column to users for 2FA account recovery',

    up: async (dbRun) => {
        await dbRun(
            `ALTER TABLE users ADD COLUMN totp_backup_codes TEXT DEFAULT NULL`
        ).catch(() => {}); // ignore if already exists
    },

    down: async (_dbRun) => {
        // SQLite doesn't support DROP COLUMN easily — no-op
    },
};
