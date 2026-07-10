"use strict";
// Migration v023: Add allowed_ips column to server_api_keys for IP allowlist
const version = 23;
const description = 'Add allowed_ips column for API key IP allowlisting';
async function up(dbRun, dbGet, dbAll) {
    await dbRun(`ALTER TABLE server_api_keys ADD COLUMN allowed_ips TEXT DEFAULT '[]'`);
}
async function down(dbRun) {
    // SQLite does not support DROP COLUMN in older versions; this is a no-op down migration.
    // To fully roll back, restore from a backup taken before v023.
    // The column will remain but will not cause issues if unused.
}
module.exports = { version, description, up, down };
//# sourceMappingURL=023_server_api_keys_ip_allowlist.js.map