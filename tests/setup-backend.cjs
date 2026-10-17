// API tests must not start the hourly external version poller.
jest.mock('../src/core/versionManager', () => ({
  ...jest.requireActual('../src/core/versionManager'),
  init: jest.fn(),
}));

afterAll(async () => {
  // App startup may still be awaiting its own initDb while a suite's parallel initDb
  // has returned. Finish startup before closing shared connections or tearing down Jest.
  for (const module of Object.values(require.cache)) {
    if (module.exports?.app && module.exports?.ready) await module.exports.ready;
  }
  // Both SQLite connections otherwise survive each API test environment.
  const database = require('../src/db/database');
  if (database.sequelize) await database.sequelize.close();
  if (database.db?.close) await new Promise((resolve, reject) => {
    database.db.close(error => error ? reject(error) : resolve());
  });
});

