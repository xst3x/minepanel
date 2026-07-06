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

jest.mock('../src/core/resolvers', () => {
    return {
        resolveJar: jest.fn().mockResolvedValue({ provider: 'paper', version: '1.20', build: '1', type: 'paper', url: 'http://example.com' }),
        downloadJar: jest.fn().mockResolvedValue({ localPath: '/tmp/mock.jar' })
    };
});

const request = require('supertest');
const { app } = require('../src/index');
const { initDb, dbRun } = require('../src/db/database');
const { generateToken } = require('../src/core/auth');

let token = null;

beforeAll(async () => {
    await initDb();
    
    // Create an admin user to generate an admin token
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('adminpassword', 10);
    await dbRun(
        'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
        [999, 'admin', hash, 'admin']
    );
    
    token = generateToken({ id: 999, username: 'admin', role: 'admin' });
});

describe('Servers API', () => {
    let serverId = null;

    test('POST /api/servers/create should deploy a server successfully', async () => {
        // Mock resolver so it doesn't try to fetch version manifests or download JARs
        const versionManager = require('../src/core/versionManager');
        versionManager.init = () => {};
        
        const resolvers = require('../src/core/resolvers');
        resolvers.resolveJar = () => Promise.resolve({ provider: 'paper', version: '1.20', build: '1', type: 'paper', url: 'http://example.com' });
        resolvers.downloadJar = () => Promise.resolve({ localPath: '/tmp/mock.jar' });

        const fs = require('fs');
        const originalWrite = fs.writeFileSync;
        const originalCopy = fs.copyFileSync;
        const originalMkdir = fs.mkdirSync;
        fs.writeFileSync = () => {};
        fs.copyFileSync = () => {};
        fs.mkdirSync = () => {};

        const res = await request(app)
            .post('/api/servers/create')
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'Test Server',
                software: 'paper',
                version: '1.20',
                ram_mb: 1024,
                port: 25565
            });

        // Restore fs functions
        fs.writeFileSync = originalWrite;
        fs.copyFileSync = originalCopy;
        fs.mkdirSync = originalMkdir;

        expect(res.status).toBe(200);
        expect(res.body.message).toContain('deployed successfully');
    });

    test('GET /api/servers should list created servers', async () => {
        const res = await request(app)
            .get('/api/servers')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        serverId = res.body[0].id;
    });

    test('Lifecycle operations (Stop/Restart) check locks', async () => {
        const pm = require('../src/core/processManager');
        
        // Mock start/stop in process manager so it doesn't spawn real processes
        pm.start = () => {};
        pm.stop = () => {};
        pm.gracefulStop = () => Promise.resolve({ graceful: true, wasRunning: false });
        
        const fs = require('fs');
        const originalExistsSync = fs.existsSync;
        fs.existsSync = (p) => {
            if (p && (p.endsWith('server.jar') || p.endsWith('server.properties'))) return true;
            return originalExistsSync(p);
        };

        try {
            // Acquire lock
            expect(pm.acquireLock(serverId)).toBe(true);

            // Try starting while locked
            const res = await request(app)
                .post(`/api/servers/${serverId}/start`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('SERVER_LOCKED');

            // Release lock
            pm.releaseLock(serverId);
        } finally {
            fs.existsSync = originalExistsSync;
        }
    });
});
