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

    test('GET /api/servers/:id/files/info computes file and folder details on demand', async () => {
        const serverDir = path.resolve(__dirname, '../servers/Test_Server');
        const folder = path.join(serverDir, 'info-folder');
        fs.mkdirSync(path.join(folder, 'child'), { recursive: true });
        fs.writeFileSync(path.join(folder, 'child', 'note.txt'), 'hello');
        const headers = { Authorization: `Bearer ${token}` };

        const file = await request(app).get('/api/servers/1/files/info').set(headers).query({ path: 'info-folder/child/note.txt' });
        expect(file.status).toBe(200);
        expect(file.body).toMatchObject({ name: 'note.txt', isDirectory: false, size: 5, extension: 'txt' });
        expect(file.body.createdAt).toBeTruthy();
        expect(file.body.modifiedAt).toBeTruthy();

        const directory = await request(app).get('/api/servers/1/files/info').set(headers).query({ path: 'info-folder' });
        expect(directory.status).toBe(200);
        expect(directory.body).toMatchObject({ name: 'info-folder', isDirectory: true, size: 5, folderCount: 1, fileCount: 1 });

        const denied = await request(app).get('/api/servers/1/files/info').set(headers).query({ path: '../../package.json' });
        expect(denied.status).toBe(403);
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

describe('Multipart upload destinations', () => {
    const root = path.resolve(__dirname, '../servers/Test_Server');
    test.each(['/', '/plugins/Essentials', '/plugins/Space Folder/\u914d\u7f6e'])('preserves destination %s with file-first multipart', async directory => {
        fs.mkdirSync(path.join(root, directory), { recursive: true });
        const name = '\u914d\u7f6e.yml';
        const res = await request(app).post('/api/servers/1/files/upload')
            .set('Authorization', `Bearer ${token}`)
            .attach('file', Buffer.from('settings'), name).field('path', directory);
        expect(res.status).toBe(200);
        expect(fs.readFileSync(path.join(root, directory, name), 'utf8')).toBe('settings');
    });
    test.each([undefined, '../outside', '/plugins/../outside', 'C:/outside', '//host/share', 'plugins\\..\\outside'])('rejects missing or invalid path %s', async directory => {
        const req = request(app).post('/api/servers/1/files/upload').set('Authorization', `Bearer ${token}`);
        if (directory !== undefined) req.field('path', directory);
        const res = await req.attach('file', Buffer.from('bad'), 'rejected.yml');
        expect(res.status).toBe(400);
        expect(fs.existsSync(path.join(root, 'rejected.yml'))).toBe(false);
    });
    test('isolates simultaneous uploads and streams a larger file', async () => {
        const payload = Buffer.alloc(8 * 1024 * 1024, 65);
        const results = await Promise.all(['one', 'two'].map(async folder => {
            fs.mkdirSync(path.join(root, folder), { recursive: true });
            return request(app).post('/api/servers/1/files/upload').set('Authorization', `Bearer ${token}`)
                .field('path', '/' + folder).attach('file', payload, 'large.dat');
        }));
        expect(results.map(r => r.status)).toEqual([200, 200]);
        for (const folder of ['one', 'two']) expect(fs.readFileSync(path.join(root, folder, 'large.dat')).equals(payload)).toBe(true);
    });
    test('rejects symlink destinations and blocked extensions', async () => {
        fs.symlinkSync(root, path.join(root, 'linked'), 'junction');
        const linked = await request(app).post('/api/servers/1/files/upload').set('Authorization', `Bearer ${token}`)
            .field('path', '/linked').attach('file', Buffer.from('bad'), 'link.yml');
        expect(linked.status).toBe(403);
        const blocked = await request(app).post('/api/servers/1/files/upload').set('Authorization', `Bearer ${token}`)
            .field('path', '/').attach('file', Buffer.from('bad'), 'bad.exe');
        expect(blocked.status).toBe(400);
    });
    test('creates uploaded folder hierarchy beneath the selected directory', async () => {
        const res = await request(app).post('/api/servers/1/files/upload').set('Authorization', `Bearer ${token}`)
            .attach('file', Buffer.from('nested'), 'config.yml')
            .field('path', '/plugins/Essentials').field('relativePath', 'Folder with spaces/deeper/config.yml');
        expect(res.status).toBe(200);
        expect(fs.readFileSync(path.join(root, 'plugins/Essentials/Folder with spaces/deeper/config.yml'), 'utf8')).toBe('nested');
    });
    test.each(['../config.yml', '/absolute/config.yml', 'folder/../../config.yml', 'folder\\config.yml', 'C:/config.yml', 'folder//config.yml'])('rejects unsafe relative folder path %s', async relativePath => {
        const res = await request(app).post('/api/servers/1/files/upload').set('Authorization', `Bearer ${token}`)
            .field('path', '/').field('relativePath', relativePath).attach('file', Buffer.from('bad'), 'config.yml');
        expect([400, 403]).toContain(res.status);
    });

});
