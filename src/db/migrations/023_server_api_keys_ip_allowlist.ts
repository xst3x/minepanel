// Migration v023: Add allowed_ips column to server_api_keys for IP allowlist
const version = 23;
const description = 'Add allowed_ips column for API key IP allowlisting';

async function up(dbRun: any, dbGet: any, dbAll: any) {
  await dbRun(`ALTER TABLE server_api_keys ADD COLUMN allowed_ips TEXT DEFAULT '[]'`);
}

async function down(dbRun: any) {
  // SQLite does not support DROP COLUMN in older versions; this is a no-op down migration.
  // To fully roll back, restore from a backup taken before v023.
  // The column will remain but will not cause issues if unused.
}

export = { version, description, up, down };
