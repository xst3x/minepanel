// src/db/migrations/003_add_webhooks_table.js
module.exports = {
  version: 3,
  description: 'Webhooks table',
  up: async (dbRun) => {
    await dbRun(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        server_id TEXT NOT NULL,
        event TEXT NOT NULL,
        url TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  },
  down: async (dbRun) => {
    await dbRun('DROP TABLE IF EXISTS webhooks');
  }
};
