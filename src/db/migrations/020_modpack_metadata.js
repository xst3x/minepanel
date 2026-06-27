// Migration 020: Add modpack metadata columns to servers table
// Stores the modpack project title, version number, and project ID so the
// UI can display "All the Mods 9 - 1.2.4" instead of a generic loader name.
module.exports = {
    version: 20,
    description: 'Add modpack_title, modpack_version, modpack_project_id columns to servers',

    up: async (dbRun) => {
        const cols = [
            "ALTER TABLE servers ADD COLUMN modpack_title TEXT DEFAULT NULL",
            "ALTER TABLE servers ADD COLUMN modpack_version TEXT DEFAULT NULL",
            "ALTER TABLE servers ADD COLUMN modpack_project_id TEXT DEFAULT NULL",
        ];
        for (const sql of cols) {
            try { await dbRun(sql); } catch (_) {}
        }
    },

    down: async () => {
        // SQLite does not support DROP COLUMN without recreating the table — no-op.
    },
};
