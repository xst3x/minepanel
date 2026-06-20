module.exports = {
    version: 15,
    description: 'Add auto update settings columns to servers table',
    async up(dbRun) {
        const cols = [
            "ALTER TABLE servers ADD COLUMN auto_update_software INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE servers ADD COLUMN auto_update_content  INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE servers ADD COLUMN force_incompatible_updates INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE servers ADD COLUMN auto_backup_before_update  INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE servers ADD COLUMN ignored_plugins TEXT NOT NULL DEFAULT '[]'",
            "ALTER TABLE servers ADD COLUMN update_interval_hours INTEGER NOT NULL DEFAULT 12",
            "ALTER TABLE servers ADD COLUMN last_update_check TEXT DEFAULT NULL",
            "ALTER TABLE servers ADD COLUMN last_update_run   TEXT DEFAULT NULL",
        ];
        for (const sql of cols) {
            try {
                await dbRun(sql);
            } catch (e) {
                if (!e.message.includes('duplicate column')) throw e;
            }
        }
    },
};
