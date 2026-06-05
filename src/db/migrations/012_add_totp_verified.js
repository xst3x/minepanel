// Migration 012 — add totp_verified column to users
// totp_verified = 1 means authenticator app is configured (secret verified)
// totp_enabled  = 1 means 2FA is enforced at login (requires totp_verified = 1)
module.exports = {
    version: 12,
    description: 'Add totp_verified to users table',
    up: async (db) => {
        await db(`ALTER TABLE users ADD COLUMN totp_verified INTEGER NOT NULL DEFAULT 0`);
        // Back-fill: any user that already has totp_enabled=1 clearly has a verified secret
        await db(`UPDATE users SET totp_verified = 1 WHERE totp_enabled = 1`);
    },
};
