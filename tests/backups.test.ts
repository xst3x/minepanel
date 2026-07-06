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

jest.mock('../src/core/serverHelper', () => {
    const original = jest.requireActual('../src/core/serverHelper');
    return {
        ...original,
        createBackup: jest.fn().mockResolvedValue({ filename: 'backup-mock.zip', size: 1024 })
    };
});

const request = require('supertest');
const { app } = require('../src/index');
const { initDb, dbRun } = require('../src/db/database');
const { generateToken } = require('../src/core/auth');
const path = require('path');
const fs = require('fs');

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
    
    // Insert a server row with name and uuid
    await dbRun(
        'INSERT INTO servers (id, uuid, name, software, version, ram_mb, port, directory_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [1, 'backup-server-uuid', 'Test Backup Server', 'paper', '1.20', 1024, 25565, 'Test_Backup_Server']
    );
    
    token = generateToken({ id: 999, username: 'admin', role: 'admin' });
    
    // Create server directory structure in workspace
    const svDir = path.resolve(__dirname, '../servers/Test_Backup_Server');
    if (!fs.existsSync(svDir)) {
        fs.mkdirSync(svDir, { recursive: true });
    }
});

afterAll(() => {
    const svDir = path.resolve(__dirname, '../servers/Test_Backup_Server');
    if (fs.existsSync(svDir)) {
        try {
            fs.rmSync(svDir, { recursive: true, force: true });
        } catch (_) {}
    }
});

describe('Backups API', () => {
    test('GET /api/servers/:id/backups lists backups successfully', async () => {
        const res = await request(app)
            .get('/api/servers/1/backups')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('POST /api/servers/:id/backups/create initiates backup', async () => {
        // Stub process manager online/offline check
        const pm = require('../src/core/processManager');
        pm.processes.set(1, { pid: 1234 }); // Mock server is online
        pm.stop = () => {};
        pm.start = () => {};
        pm.gracefulStop = () => Promise.resolve({ graceful: true });
        pm.getStatus = () => 'offline';

        // Mock createBackup to avoid hanging streams
        const serverHelper = require('../src/core/serverHelper');
        serverHelper.createBackup = () => Promise.resolve({ filename: 'backup-mock.zip', size: 1024 });

        const res = await request(app)
            .post('/api/servers/1/backups/create')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(200);
        expect(res.body.filename).toBe('backup-mock.zip');
    });
});
