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
const https = require('https');

https.request = jest.fn();

let token = null;
let serverUuid = 'test-datapack-server';

beforeAll(async () => {
    await initDb();
    
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('adminpassword', 10);
    await dbRun(
        'INSERT INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
        [999, 'admin', hash, 'admin']
    );
    
    await dbRun(
        'INSERT INTO servers (id, uuid, name, software, version, ram_mb, port, directory_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [2, serverUuid, 'Datapack Server', 'paper', '1.20', 1024, 25565, 'Datapack_Server']
    );
    
    token = generateToken({ id: 999, username: 'admin', role: 'admin' });
    
    const svDir = path.resolve(__dirname, '../servers/Datapack_Server');
    if (!fs.existsSync(svDir)) {
        fs.mkdirSync(svDir, { recursive: true });
    }
});

afterAll(() => {
    const svDir = path.resolve(__dirname, '../servers/Datapack_Server');
    if (fs.existsSync(svDir)) {
        try {
            fs.rmSync(svDir, { recursive: true, force: true });
        } catch (_) {}
    }
});

/** Helper: create a level-name/world datapacks dir with test entries */
const setupDatapacksDir = (entries) => {
    const worldDir = path.resolve(__dirname, '../servers/Datapack_Server/world/datapacks');
    fs.mkdirSync(worldDir, { recursive: true });
    for (const e of entries) {
        const p = path.join(worldDir, e.name);
        if (e.isDirectory) {
            fs.mkdirSync(p, { recursive: true });
            fs.writeFileSync(path.join(p, 'pack.mcmeta'), JSON.stringify({ pack: { pack_format: 15 } }));
        } else {
            fs.writeFileSync(p, 'fake content');
        }
    }
    return worldDir;
};

describe('Datapacks API', () => {
    test('GET /api/servers/2/plugins/datapacks/installed should return empty list initially', async () => {
        const res = await request(app)
            .get('/api/servers/2/plugins/datapacks/installed')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(0);
    });

    test('GET /api/servers/2/plugins/datapacks/installed should ONLY return .zip files, filtering out directories and non-zip files', async () => {
        const datapacksDir = setupDatapacksDir([
            { name: 'valid-datapack.zip', isDirectory: false },
            { name: 'anextractedfolder', isDirectory: true },
            { name: 'readme.txt', isDirectory: false },
            { name: 'pack.mcmeta', isDirectory: false },
            { name: 'some_script.mcfunction', isDirectory: false },
            { name: 'another-valid.zip', isDirectory: false },
        ]);

        const res = await request(app)
            .get('/api/servers/2/plugins/datapacks/installed')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        
        // Should only contain .zip entries
        const names = res.body.map(i => i.name);
        expect(names).toContain('valid-datapack.zip');
        expect(names).toContain('another-valid.zip');
        expect(names).not.toContain('anextractedfolder');
        expect(names).not.toContain('readme.txt');
        expect(names).not.toContain('pack.mcmeta');
        expect(names).not.toContain('some_script.mcfunction');
        
        // Every entry must be a .zip file
        for (const item of res.body) {
            expect(item.name.toLowerCase().endsWith('.zip')).toBe(true);
            expect(item.isDirectory).toBe(false);
        }

        // Cleanup
        fs.rmSync(datapacksDir, { recursive: true, force: true });
    });

    test('GET /api/servers/2/plugins/datapacks/search should fetch from Modrinth', async () => {
        const mockSearchHits = {
            hits: [
                { project_id: 'proj1', title: 'Cool Datapack', downloads: 100, project_type: 'datapack' }
            ],
            offset: 0,
            limit: 10,
            total_hits: 1
        };

        const mockReq = {
            on: jest.fn(),
            end: jest.fn()
        };

        https.request.mockImplementation((url, options, callback) => {
            const mockRes = {
                statusCode: 200,
                on: jest.fn((event, handler) => {
                    if (event === 'data') {
                        handler(JSON.stringify(mockSearchHits));
                    }
                    if (event === 'end') {
                        handler();
                    }
                })
            };
            callback(mockRes);
            return mockReq;
        });

        const res = await request(app)
            .get('/api/servers/2/plugins/datapacks/search?q=Cool')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(200);
        expect(res.body.hits.length).toBe(1);
        expect(res.body.hits[0].title).toBe('Cool Datapack');
    });

    test('GET /api/servers/2/plugins/datapacks/project/:id/versions should filter out non-datapack versions', async () => {
        const mockVersions = [
            {
                id: 'v1', name: '1.0-datapack', version_number: '1.0',
                game_versions: ['1.20'], loaders: [],
                files: [{ url: 'https://example.com/dp.zip', filename: 'dp.zip', primary: true }],
                date_published: '2024-01-01T00:00:00Z'
            },
            {
                id: 'v2', name: '1.0-plugin', version_number: '1.0',
                game_versions: ['1.20'], loaders: ['paper'],
                files: [{ url: 'https://example.com/p.jar', filename: 'p.jar', primary: true }],
                date_published: '2024-01-01T00:00:00Z'
            },
            {
                id: 'v3', name: '1.0-mod', version_number: '1.0',
                game_versions: ['1.20'], loaders: ['fabric'],
                files: [{ url: 'https://example.com/m.jar', filename: 'm.jar', primary: true }],
                date_published: '2024-01-01T00:00:00Z'
            },
        ];

        const mockReq = { on: jest.fn(), end: jest.fn() };
        let callCount = 0;
        https.request.mockImplementation((url, options, callback) => {
            callCount++;
            const mockRes = {
                statusCode: 200,
                on: jest.fn((event, handler) => {
                    if (event === 'data') {
                        handler(JSON.stringify(mockVersions));
                    }
                    if (event === 'end') handler();
                })
            };
            callback(mockRes);
            return mockReq;
        });

        const res = await request(app)
            .get('/api/servers/2/plugins/datapacks/project/test-proj/versions?type=datapack')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        // Should only include the datapack version (v1), not plugin (v2) or mod (v3)
        expect(res.body.length).toBe(1);
        expect(res.body[0].id).toBe('v1');
    });

    test('GET /api/servers/2/plugins/modrinth/project/:id/versions?type=mod should filter to only mod versions', async () => {
        const mockVersions = [
            {
                id: 'm1', name: '1.0-mod', version_number: '1.0',
                game_versions: ['1.20'], loaders: ['fabric'],
                files: [{ url: 'https://example.com/m.jar', filename: 'm.jar', primary: true }],
                date_published: '2024-01-01T00:00:00Z'
            },
            {
                id: 'p1', name: '1.0-plugin', version_number: '1.0',
                game_versions: ['1.20'], loaders: ['paper'],
                files: [{ url: 'https://example.com/p.jar', filename: 'p.jar', primary: true }],
                date_published: '2024-01-01T00:00:00Z'
            },
        ];

        const mockReq = { on: jest.fn(), end: jest.fn() };
        https.request.mockImplementation((url, options, callback) => {
            const mockRes = {
                statusCode: 200,
                on: jest.fn((event, handler) => {
                    if (event === 'data') handler(JSON.stringify(mockVersions));
                    if (event === 'end') handler();
                })
            };
            callback(mockRes);
            return mockReq;
        });

        const res = await request(app)
            .get('/api/servers/2/plugins/modrinth/project/test-proj/versions?type=mod')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(1);
        expect(res.body[0].id).toBe('m1');
    });

    test('GET /api/servers/2/plugins/modrinth/project/:id/versions?type=plugin should filter to only plugin versions', async () => {
        const mockVersions = [
            {
                id: 'm1', name: '1.0-mod', version_number: '1.0',
                game_versions: ['1.20'], loaders: ['fabric'],
                files: [{ url: 'https://example.com/m.jar', filename: 'm.jar', primary: true }],
                date_published: '2024-01-01T00:00:00Z'
            },
            {
                id: 'p1', name: '1.0-plugin', version_number: '1.0',
                game_versions: ['1.20'], loaders: ['paper'],
                files: [{ url: 'https://example.com/p.jar', filename: 'p.jar', primary: true }],
                date_published: '2024-01-01T00:00:00Z'
            },
            {
                id: 'dp1', name: '1.0-datapack', version_number: '1.0',
                game_versions: ['1.20'], loaders: [],
                files: [{ url: 'https://example.com/dp.zip', filename: 'dp.zip', primary: true }],
                date_published: '2024-01-01T00:00:00Z'
            },
        ];

        const mockReq = { on: jest.fn(), end: jest.fn() };
        https.request.mockImplementation((url, options, callback) => {
            const mockRes = {
                statusCode: 200,
                on: jest.fn((event, handler) => {
                    if (event === 'data') handler(JSON.stringify(mockVersions));
                    if (event === 'end') handler();
                })
            };
            callback(mockRes);
            return mockReq;
        });

        const res = await request(app)
            .get('/api/servers/2/plugins/modrinth/project/test-proj/versions?type=plugin')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(1);
        expect(res.body[0].id).toBe('p1');
    });

    test('GET /api/servers/2/plugins/modrinth/project/:id/versions without type should not filter', async () => {
        const mockVersions = [
            { id: 'm1', name: '1.0-mod', game_versions: ['1.20'], loaders: ['fabric'], files: [], date_published: '2024-01-01T00:00:00Z' },
            { id: 'p1', name: '1.0-plugin', game_versions: ['1.20'], loaders: ['paper'], files: [], date_published: '2024-01-01T00:00:00Z' },
        ];

        const mockReq = { on: jest.fn(), end: jest.fn() };
        https.request.mockImplementation((url, options, callback) => {
            const mockRes = {
                statusCode: 200,
                on: jest.fn((event, handler) => {
                    if (event === 'data') handler(JSON.stringify(mockVersions));
                    if (event === 'end') handler();
                })
            };
            callback(mockRes);
            return mockReq;
        });

        const res = await request(app)
            .get('/api/servers/2/plugins/modrinth/project/test-proj/versions')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(2);
    });
});
