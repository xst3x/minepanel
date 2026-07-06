"use strict";
module.exports = {
    version: 21,
    description: 'Add custom_start_command column to servers',
    up: async (dbRun) => {
        try {
            await dbRun('ALTER TABLE servers ADD COLUMN custom_start_command TEXT DEFAULT NULL');
        }
        catch (_) { }
    },
    down: async () => { },
};
//# sourceMappingURL=021_custom_start_command.js.map