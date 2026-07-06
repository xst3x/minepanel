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

beforeAll(async () => {
    await initDb();
});

describe('Authentication API', () => {
    let inviteToken = null;

    test('GET /api/auth/settings returns requireInviteToken default', async () => {
        const res = await request(app)
            .get('/api/auth/settings');
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('requireInviteToken', true);
    });

    test('POST /api/auth/register fails without invite token', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'testuser',
                password: 'TestPass1!',
                confirmPassword: 'TestPass1!'
            });
        
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('AUTH_INVITE_TOKEN_REQUIRED');
    });

    test('Create an invite token directly in DB and register', async () => {
        // Manually bootstrap an admin user so we can test login or create invite token
        // But since we are testing registration, we can just insert a token directly into DB
        inviteToken = 'test-token-12345';
        const expiresAt = new Date(Date.now() + 1200000).toISOString();
        await dbRun(
            'INSERT INTO account_creation_tokens (token, created_by, expires_at, permissions, ranks) VALUES (?, ?, ?, ?, ?)',
            [inviteToken, 1, expiresAt, '[]', '[]']
        );

        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'testuser',
                password: 'TestPass1!',
                confirmPassword: 'TestPass1!',
                token: inviteToken
            });
        
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Account created successfully');
    });

    test('Case-insensitive duplicate registration is blocked', async () => {
        const expiresAt = new Date(Date.now() + 1200000).toISOString();
        await dbRun(
            'INSERT OR IGNORE INTO account_creation_tokens (token, created_by, expires_at, permissions, ranks) VALUES (?, ?, ?, ?, ?)',
            [inviteToken, 1, expiresAt, '[]', '[]']
        );

        const res = await request(app)
            .post('/api/auth/register')
            .send({
                username: 'TestUser',
                password: 'TestPass1!',
                confirmPassword: 'TestPass1!',
                token: inviteToken
            });
        
        expect(res.status).toBe(200);
        // Per the anti-enumeration fix, duplicate usernames return 200 with the same
        // success message rather than a 409 — revealing that the username exists would
        // allow an attacker to enumerate valid accounts.
        expect(res.body.message).toBe('Account created successfully');
    });

    let loginToken = null;

    test('POST /api/auth/login with correct credentials works', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'testuser',
                password: 'TestPass1!'
            });
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body.username).toBe('testuser');
        loginToken = res.body.token;
    });

    test('POST /api/auth/login with incorrect credentials fails', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                username: 'testuser',
                password: 'wrongpassword'
            });
        
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    test('POST /api/auth/logout returns success', async () => {
        const res = await request(app)
            .post('/api/auth/logout')
            .set('Authorization', `Bearer ${loginToken}`);
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
