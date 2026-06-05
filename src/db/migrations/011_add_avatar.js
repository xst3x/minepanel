// Migration 011 — add avatar_url column to users
module.exports = {
    version: 11,
    description: 'Add avatar_url to users table',
    up: async (db) => {
        await db(`ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL`);
    },
};
