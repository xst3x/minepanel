// API tests must not start the hourly external version poller.
jest.mock('../src/core/versionManager', () => ({
  ...jest.requireActual('../src/core/versionManager'),
  init: jest.fn(),
}));

afterAll(async () => {
  // Both SQLite connections otherwise survive each API test environment.
  const database = require('../src/db/database');
  if (database.sequelize) await database.sequelize.close();
  if (database.db?.close) await new Promise((resolve, reject) => {
    database.db.close(error => error ? reject(error) : resolve());
  });
});

