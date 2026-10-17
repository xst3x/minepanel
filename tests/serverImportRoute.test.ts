process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'server-import-test-secret';

jest.mock('../src/paths', () => ({
    ...jest.requireActual('../src/paths'),
    SERVERS_DIR: require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'minepanel-import-route-')),
}));
jest.mock('archiver', () => ({ ZipArchive: class {} }));
jest.mock('../src/core/processManager', () => ({ acquireLock: jest.fn(() => true), releaseLock: jest.fn() }));
jest.mock('../src/core/executionManager', () => ({}));
jest.mock('../src/core/resolvers', () => ({ resolveJar: jest.fn(), downloadJar: jest.fn() }));
jest.mock('../src/routes/modules/serverHelpers', () => ({ runForgeInstaller: jest.fn(), runNeoForgeInstaller: jest.fn() }));

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const request = require('supertest');
const { SERVERS_DIR } = require('../src/paths');
const { initDb, dbRun, dbGet } = require('../src/db/database');
const { generateToken } = require('../src/core/auth');
const resolver = require('../src/core/resolvers');
const processManager = require('../src/core/processManager');
const { importUpload } = require('../src/middleware/serverImportUpload');
const app = express();
app.use('/api/servers', require('../src/routes/modules/serverManagementRoutes'));
let token: string;
let deniedToken: string;
let zip: Buffer;

async function eventually(check: () => Promise<boolean>) {
    for (let i = 0; i < 200; i++) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('Import cleanup did not finish');
}
async function tempEmpty() {
    try { return (await fs.promises.readdir(path.join(SERVERS_DIR, '.imports'))).length === 0; }
    catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}
beforeAll(async () => {
    await initDb();
    await dbRun("INSERT INTO users (id, username, password, role, global_permissions) VALUES (901, 'importer', 'unused', 'user', '[\"server.create\"]'), (902, 'denied-importer', 'unused', 'user', '[]')");
    token = generateToken({ id: 901, username: 'importer', role: 'user' });
    deniedToken = generateToken({ id: 902, username: 'denied-importer', role: 'user' });
    await fs.promises.writeFile(path.join(SERVERS_DIR, 'fresh.jar'), 'fresh binary');
    const archive = new (require('yazl').ZipFile)();
    archive.addBuffer(Buffer.from('server-port=12345\nmotd=kept'), 'server.properties');
    archive.addBuffer(Buffer.from('world'), 'custom/level.dat');
    archive.addBuffer(Buffer.from('old binary'), 'server.jar');
    const chunks = [];
    const done = new Promise<void>(resolve => { archive.outputStream.on('data', chunk => chunks.push(chunk)); archive.outputStream.on('end', resolve); });
    archive.end({ forceZip64Format: true });
    await done;
    zip = Buffer.concat(chunks);
});
beforeEach(() => {
    resolver.resolveJar.mockResolvedValue({ type: 'paper' });
    resolver.downloadJar.mockResolvedValue({ localPath: path.join(SERVERS_DIR, 'fresh.jar') });
});
afterEach(async () => { await eventually(tempEmpty); jest.restoreAllMocks(); });
afterAll(async () => { await fs.promises.rm(SERVERS_DIR, { recursive: true, force: true }); });

function post(name: string, data = zip, target = app) {
    return request(target).post('/api/servers/import').set('Authorization', `Bearer ${token}`)
        .attach('archive', data, 'server.zip').field('name', name).field('software', 'paper')
        .field('version', '1.21').field('ram_mb', '2048').field('port', '25565').field('root_path', '');
}

test('authentication and server.create are checked before receiving any file', async () => {
    const upload = jest.spyOn(importUpload, 'single');
    expect((await request(app).post('/api/servers/import')).status).toBe(401);
    expect((await request(app).post('/api/servers/import').set('Authorization', `Bearer ${deniedToken}`)).status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
});

test('existing multipart API imports ZIP64, preserves data and downloads a fresh binary', async () => {
    const response = await post('Import Success');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: expect.any(Number), uuid: expect.any(String), directory_name: 'import-success', skipped: ['server.jar'] });
    const target = path.join(SERVERS_DIR, response.body.directory_name);
    expect(await fs.promises.readFile(path.join(target, 'server.jar'), 'utf8')).toBe('fresh binary');
    expect(await fs.promises.readFile(path.join(target, 'custom/level.dat'), 'utf8')).toBe('world');
    expect(await fs.promises.readFile(path.join(target, 'server.properties'), 'utf8')).toBe('server-port=25565\nmotd=kept');
    expect(processManager.releaseLock).toHaveBeenCalledWith(response.body.id);
    await dbRun('DELETE FROM servers WHERE id = ?', [response.body.id]);
});

test('failed extraction rolls back database, destination and uploaded archive', async () => {
    const response = await post('Import Broken', Buffer.from('broken ZIP'));
    expect(response.status).toBe(400);
    expect(await dbGet('SELECT id FROM servers WHERE name = ?', ['Import Broken'])).toBeUndefined();
    expect(fs.existsSync(path.join(SERVERS_DIR, 'import-broken'))).toBe(false);
});

test('failed download also rolls back the already extracted files', async () => {
    resolver.downloadJar.mockRejectedValueOnce(new Error('Download failed'));
    expect((await post('Import Download Failure')).status).toBe(400);
    expect(await dbGet('SELECT id FROM servers WHERE name = ?', ['Import Download Failure'])).toBeUndefined();
    expect(fs.existsSync(path.join(SERVERS_DIR, 'import-download-failure'))).toBe(false);
});

test('database conflicts never delete a preexisting server directory', async () => {
    await fs.promises.mkdir(path.join(SERVERS_DIR, 'import-existing'));
    await fs.promises.writeFile(path.join(SERVERS_DIR, 'import-existing/keep.txt'), 'keep');
    expect((await post('Import Existing')).status).toBe(400);
    expect(await fs.promises.readFile(path.join(SERVERS_DIR, 'import-existing/keep.txt'), 'utf8')).toBe('keep');
});

test('invalid metadata and missing files still release temporary resources', async () => {
    expect((await request(app).post('/api/servers/import').set('Authorization', `Bearer ${token}`)
        .attach('archive', zip, 'server.zip').field('name', 'Incomplete')).status).toBe(400);
    expect((await request(app).post('/api/servers/import').set('Authorization', `Bearer ${token}`)).status).toBe(400);
});

test('disk exhaustion is reported as 507 with no temporary files', async () => {
    jest.spyOn(fs.promises, 'statfs').mockResolvedValue({ bsize: 4096n, bavail: 0n });
    expect((await post('Import No Space')).status).toBe(507);
});

test('a disk write error during upload is caught and cleans temporary files', async () => {
    jest.spyOn(fs, 'createWriteStream').mockImplementation(() => new (require('stream').Writable)({
        write(_chunk, _encoding, callback) { callback(Object.assign(new Error('Disk full'), { code: 'ENOSPC' })); },
    }));
    expect((await post('Import Write Error')).status).toBe(507);
});

test('disconnect after upload rolls back extracted files after the pending download finishes', async () => {
    let finishDownload;
    let downloading = false;
    resolver.downloadJar.mockImplementationOnce(() => {
        downloading = true;
        return new Promise(resolve => { finishDownload = resolve; });
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const client = post('Import Disconnected', zip, server);
    client.end(() => {});
    try {
        await eventually(async () => downloading);
        client.abort();
        // Allow the server-side response-close event to reach the controller.
        await new Promise(resolve => setTimeout(resolve, 20));
    } finally {
        client.abort();
        finishDownload?.({ localPath: path.join(SERVERS_DIR, 'fresh.jar') });
        await eventually(tempEmpty);
        await new Promise(resolve => server.close(resolve));
    }
    expect(await dbGet('SELECT id FROM servers WHERE name = ?', ['Import Disconnected'])).toBeUndefined();
    expect(fs.existsSync(path.join(SERVERS_DIR, 'import-disconnected'))).toBe(false);
});

test('concurrent uploads are bounded and disconnects release their slots', async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const clients = [];
    try {
        for (let i = 0; i < 2; i++) {
            const client = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/api/servers/import', method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data; boundary=import-test' } });
            clients.push(client);
            client.on('error', () => {});
            client.write('--import-test\r\nContent-Disposition: form-data; name="archive"; filename="server.zip"\r\nContent-Type: application/zip\r\n\r\n');
            client.write(Buffer.alloc(65536));
        }
        await eventually(async () => (await fs.promises.readdir(path.join(SERVERS_DIR, '.imports'))).length === 2);
        expect((await request(app).post('/api/servers/import').set('Authorization', `Bearer ${token}`)).status).toBe(503);
    } finally {
        clients.forEach(client => client.destroy());
        await eventually(tempEmpty);
        await new Promise(resolve => server.close(resolve));
    }
    expect((await request(app).post('/api/servers/import').set('Authorization', `Bearer ${token}`)).status).toBe(400);
});

test('a real HTTP disconnect during a chunked upload cleans the partial file', async () => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const client = http.request({ hostname: '127.0.0.1', port: server.address().port, path: '/api/servers/import', method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data; boundary=import-test' } });
    client.on('error', () => {});
    try {
        client.write('--import-test\r\nContent-Disposition: form-data; name="archive"; filename="server.zip"\r\nContent-Type: application/zip\r\n\r\n');
        client.write(Buffer.alloc(65536));
        await eventually(async () => !(await tempEmpty()));
        client.destroy();
        await eventually(tempEmpty);
    } finally {
        client.destroy();
        await new Promise(resolve => server.close(resolve));
    }
});
