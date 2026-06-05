process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'super-test-secret-key-12345';

jest.mock('archiver', () => {
    return {
        ZipArchive: class MockZipArchive {
            constructor() {}
            pipe() { return this; }
            directory() { return this; }
            finalize() { return Promise.resolve(); }
            on() { return this; }
        }
    };
});

const request = require('supertest');
const { app } = require('../src/index');
const { initDb, dbRun } = require('../src/db/database');
const { generateToken } = require('../src/core/auth');
const path = require('path');
const fs = require('fs');

describe('Security Hardening Tests', () => {
    let adminToken = null;
    let inviteToken = 'security-test-token';

    beforeAll(async () => {
        await initDb();
        // Create admin user for admin actions
        const bcrypt = require('bcryptjs');
        const adminHash = bcrypt.hashSync('AdminSecure1!', 10);
        await dbRun(
            'INSERT OR IGNORE INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
            [1337, 'sec-admin', adminHash, 'admin']
        );
        adminToken = generateToken({ id: 1337, username: 'sec-admin', role: 'admin' });

        // Insert server row for file route tests
        await dbRun(
            'INSERT OR IGNORE INTO servers (id, uuid, name, software, version, ram_mb, port, directory_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [1337, 'sec-server-uuid', 'Security Server', 'paper', '1.20', 1024, 25569, 'Security_Server']
        );

        // Ensure physical directory exists
        const serverDir = path.resolve(__dirname, '../servers/Security_Server');
        if (!fs.existsSync(serverDir)) {
            fs.mkdirSync(serverDir, { recursive: true });
        }

        // Insert registration token
        const expiresAt = new Date(Date.now() + 1200000).toISOString();
        await dbRun(
            'INSERT OR IGNORE INTO account_creation_tokens (token, created_by, expires_at, permissions, ranks) VALUES (?, ?, ?, ?, ?)',
            [inviteToken, 1337, expiresAt, '[]', '[]']
        );
    });

    afterAll(() => {
        const serverDir = path.resolve(__dirname, '../servers/Security_Server');
        if (fs.existsSync(serverDir)) {
            try { fs.rmSync(serverDir, { recursive: true, force: true }); } catch (_) {}
        }
    });

    describe('Username Normalization & Character Validation', () => {
        test('Registration rejects invalid usernames (special chars)', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'test@user',
                    password: 'TestPass1!',
                    confirmPassword: 'TestPass1!',
                    token: inviteToken
                });
            expect(res.status).toBe(400);
        });

        test('Registration accepts valid alphanumeric, dash, underscore', async () => {
            const res = await request(app)
                .post('/api/auth/register')
                .send({
                    username: 'test_user-99',
                    password: 'TestPass1!',
                    confirmPassword: 'TestPass1!',
                    token: inviteToken
                });
            expect([200, 409]).toContain(res.status); // 200 success or 409 if already exists
        });
    });

    describe('File Upload Extension Blocklist', () => {
        test('POST /api/servers/:id/files/upload rejects blocked extensions (e.g. .exe)', async () => {
            const res = await request(app)
                .post('/api/servers/1337/files/upload')
                .set('Authorization', `Bearer ${adminToken}`)
                .attach('file', Buffer.from('malicious payload'), 'test.exe')
                .field('path', '');
            
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('FILE_INVALID_NAME');
            expect(res.body.detail).toContain('blocked for security reasons');
        });

        test('POST /api/servers/:id/files/upload accepts safe extensions (e.g. .txt)', async () => {
            const res = await request(app)
                .post('/api/servers/1337/files/upload')
                .set('Authorization', `Bearer ${adminToken}`)
                .attach('file', Buffer.from('safe payload'), 'test.txt')
                .field('path', '');
            
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('File uploaded');
        });
    });

    describe('Password Strength on Direct Administrative Creation', () => {
        test('Admin direct create rejects weak password', async () => {
            const res = await request(app)
                .post('/api/users/create')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    username: 'weakpwuser',
                    password: '123'
                });
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/(at least 8 characters|Validation error)/);
        });
    });

    describe('Metrics Endpoint Authentication', () => {
        test('GET /metrics requires auth by default (no token → 401)', async () => {
            // Since the Task 11 security fix, /metrics is protected by default.
            // To open it publicly, set METRICS_AUTH=false in .env.
            const res = await request(app).get('/metrics');
            expect(res.status).toBe(401);
        });

        test('GET /metrics returns 200 when a valid token is provided', async () => {
            const res = await request(app)
                .get('/metrics')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('text/plain');
        });

        test('GET /metrics is open when METRICS_AUTH=false', async () => {
            process.env.METRICS_AUTH = 'false';

            const res = await request(app).get('/metrics');
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('text/plain');

            // Revert env var so remaining tests use secure default
            delete process.env.METRICS_AUTH;
        });
    });
});
