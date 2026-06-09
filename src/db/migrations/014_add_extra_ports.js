module.exports = {
    id: '014_add_extra_ports',
    async up(dbRun, dbGet) {
        const info = await dbGet("PRAGMA table_info(servers)");
        const cols = await new Promise((res, rej) => {
            const sqlite3 = require('sqlite3').verbose();
            // Use dbGet to check column existence
            res(null);
        });
        // Add extra_ports column if it doesn't exist
        try {
            await dbRun("ALTER TABLE servers ADD COLUMN extra_ports TEXT DEFAULT '[]'");
        } catch (e) {
            if (!e.message.includes('duplicate column')) throw e;
        }
    }
};
