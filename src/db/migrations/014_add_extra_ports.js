module.exports = {
    version: 14,
    description: 'Add extra_ports column to servers table',
    async up(dbRun) {
        // Add extra_ports column if it doesn't exist
        try {
            await dbRun("ALTER TABLE servers ADD COLUMN extra_ports TEXT DEFAULT '[]'");
        } catch (e) {
            if (!e.message.includes('duplicate column')) throw e;
        }
    }
};
