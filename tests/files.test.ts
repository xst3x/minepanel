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

let token = null;
let serverUuid = 'test-server-uuid';

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
        [1, serverUuid, 'Test Server', 'paper', '1.20', 1024, 25565, 'Test_Server']
    );
    
    token = generateToken({ id: 999, username: 'admin', role: 'admin' });
    
    // Create server directory structure in workspace (temporarily for testing)
    const svDir = path.resolve(__dirname, '../servers/Test_Server');
    if (!fs.existsSync(svDir)) {
        fs.mkdirSync(svDir, { recursive: true });
    }
});

afterAll(() => {
    // Clean up temporary server directory
    const svDir = path.resolve(__dirname, '../servers/Test_Server');
    if (fs.existsSync(svDir)) {
        try {
            fs.rmSync(svDir, { recursive: true, force: true });
        } catch (_) {}
    }
});

describe('Files API Sandbox & Operations', () => {
    test('POST /api/servers/:id/files/write writes file successfully inside sandbox', async () => {
        const res = await request(app)
            .post('/api/servers/1/files/write')
            .set('Authorization', `Bearer ${token}`)
            .send({
                path: 'testfile.txt',
                content: 'Hello World Sandbox'
            });
        
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('File saved successfully');
        
        // Verify file is physically created in correct path
        const expectedPath = path.resolve(__dirname, '../servers/Test_Server/testfile.txt');
        expect(fs.existsSync(expectedPath)).toBe(true);
        expect(fs.readFileSync(expectedPath, 'utf8')).toBe('Hello World Sandbox');
    });

    test('GET /api/servers/:id/files/read reads file successfully', async () => {
        const res = await request(app)
            .get('/api/servers/1/files/read')
            .set('Authorization', `Bearer ${token}`)
            .query({ path: 'testfile.txt' });
        
        expect(res.status).toBe(200);
        expect(res.body.content).toBe('Hello World Sandbox');
    });

    test('Path traversal attempts are blocked (HTTP 403 / FILE_ACCESS_DENIED)', async () => {
        const res = await request(app)
            .get('/api/servers/1/files/read')
            .set('Authorization', `Bearer ${token}`)
            .query({ path: '../../package.json' });
        
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FILE_ACCESS_DENIED');
    });
});
