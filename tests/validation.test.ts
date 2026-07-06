// tests/validation.test.js

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'super-test-secret-key-12345';

jest.mock('archiver', () => ({
    ZipArchive: class { pipe() { return this; } directory() { return this; } finalize() { return Promise.resolve(); } on() { return this; } }
}));

const request = require('supertest');
const { app } = require('../src/index');
const { initDb, dbRun } = require('../src/db/database');
const { generateToken } = require('../src/core/auth');

beforeAll(async () => {
    await initDb();
});

/**
 * Helper to perform POST with extra unknown field and expect validation error (400).
 */
function expectValidationError(route, payload) {
  return request(app)
    .post(route)
    .send(payload)
    .expect(400)
    .then(res => {
      expect(res.body).toHaveProperty('code');
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
}

describe('Validation Middleware', () => {
  test('reject unknown fields on register', async () => {
    // Insert a valid invite token so the request gets past the token check
    const expiresAt = new Date(Date.now() + 1200000).toISOString();
    await dbRun(
        'INSERT OR IGNORE INTO account_creation_tokens (token, created_by, expires_at, permissions, ranks) VALUES (?, ?, ?, ?, ?)',
        ['val-test-token', 1, expiresAt, '[]', '[]']
    );
    const payload = {
      username: 'testuser',
      password: 'StrongPass123!',
      confirmPassword: 'StrongPass123!',
      token: 'val-test-token',
      extraField: 'should be rejected'
    };
    await expectValidationError('/api/auth/register', payload);
  });

  test('reject unknown fields on create user (admin)', async () => {
    // Create an admin user directly and generate token
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('AdminPass1!', 10);
    await dbRun(
        'INSERT OR IGNORE INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
        [9001, 'val-admin', hash, 'admin']
    );
    const token = generateToken({ id: 9001, username: 'val-admin', role: 'admin' });

    const payload = {
      username: 'newuser',
      password: 'StrongPass123!',
      extra: 'bad'
    };
    await request(app)
      .post('/api/users/create')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(400)
      .then(res => {
        expect(res.body.code).toBe('VALIDATION_ERROR');
      });
  });
});
