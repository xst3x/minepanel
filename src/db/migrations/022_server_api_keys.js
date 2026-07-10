"use strict";
// Migration v022: Create server_api_keys table for per-server API key authentication
const version = 22;
const description = 'Create server_api_keys table';
async function up(dbRun, dbGet, dbAll) {
    await dbRun(`
    CREATE TABLE IF NOT EXISTS server_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT 'Unnamed Key',
      key_hash TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      scopes TEXT NOT NULL DEFAULT '["server.everything"]',
      expires_at DATETIME,
      last_used_at DATETIME,
      is_revoked INTEGER DEFAULT 0,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
    // Index for fast lookup by key during auth
    await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_server_api_keys_server
    ON server_api_keys(server_id)
  `);
}
async function down(dbRun) {
    await dbRun('DROP TABLE IF EXISTS server_api_keys');
}
module.exports = { version, description, up, down };
//# sourceMappingURL=022_server_api_keys.js.map