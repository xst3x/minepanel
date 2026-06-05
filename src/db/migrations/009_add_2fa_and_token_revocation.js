// Migration 009: 2FA (TOTP) support + persistent JWT revocation
module.exports = {
    version: 9,
    description: 'Add totp_secret, totp_enabled to users; add valid_tokens_from for JWT revocation',

    up: async (dbRun) => {
        const cols = [
            `ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT NULL`,
            `ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0`,
            `ALTER TABLE users ADD COLUMN valid_tokens_from INTEGER DEFAULT 0`,
        ];
        for (const sql of cols) {
            await dbRun(sql).catch(() => {}); // ignore if column already exists
        }
    },

    down: async (_dbRun) => {
        // SQLite doesn't support DROP COLUMN easily — no-op
    },
};
