module.exports = {
    version: 19,
    description: 'Add sort_order column to ranks for custom ordering',

    up: async (dbRun, dbGet, dbAll) => {
        await dbRun('ALTER TABLE ranks ADD COLUMN sort_order INTEGER DEFAULT 999');

        // Set a sensible initial order for the built-in ranks
        const PRIORITY = { owner: 0, admin: 1, manager: 2, helper: 3, player: 4 };
        const ranks = await dbAll('SELECT id, name FROM ranks');
        for (const r of ranks) {
            const order = PRIORITY[r.name.toLowerCase()] ?? 999;
            await dbRun('UPDATE ranks SET sort_order = ? WHERE id = ?', [order, r.id]);
        }
    },

    down: async (dbRun) => {
        // SQLite doesn't support DROP COLUMN on older versions — recreate without it
        await dbRun('ALTER TABLE ranks RENAME TO ranks_backup');
        await dbRun(`
            CREATE TABLE ranks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                permissions TEXT NOT NULL,
                global_permissions TEXT DEFAULT '[]',
                is_builtin INTEGER DEFAULT 0,
                color TEXT DEFAULT '#3b82f6',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await dbRun(`
            INSERT INTO ranks (id, name, permissions, global_permissions, is_builtin, color, created_at)
            SELECT id, name, permissions, global_permissions, is_builtin, color, created_at FROM ranks_backup
        `);
        await dbRun('DROP TABLE ranks_backup');
    },
};
