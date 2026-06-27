// Migration 021: Add custom_start_command column to servers table
// Allows admins to override the auto-generated Java start command per-server.
// NULL means use the auto-generated command (default behaviour — no breaking change).
module.exports = {
    version: 21,
    description: 'Add custom_start_command column to servers',

    up: async (dbRun) => {
        try {
            await dbRun('ALTER TABLE servers ADD COLUMN custom_start_command TEXT DEFAULT NULL');
        } catch (_) {}
    },

    down: async () => {},
};
