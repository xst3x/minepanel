process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'player-data-test-secret-at-least-32-characters';

jest.mock('../src/db/database', () => ({
    User: { findByPk: jest.fn(async () => ({ disabled: 0, valid_tokens_from: 0 })) },
    dbGet: jest.fn(async (_sql, params) => ({ role: params[0] === 1 ? 'admin' : 'user' })),
    dbAll: jest.fn(async () => []),
}));
jest.mock('../src/core/serverHelper', () => ({ getServer: jest.fn(), getServerDir: jest.fn() }));
jest.mock('../src/core/processManager', () => ({
    acquireLock: jest.fn(() => true), releaseLock: jest.fn(),
    getStatus: jest.fn(() => 'offline'), getHistory: jest.fn(() => []), sendCommand: jest.fn(),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { emptyEnderItems, clearPlayerEnderChest } = require('../src/core/playerEnderChest');
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const serverHelper = require('../src/core/serverHelper');
const pm = require('../src/core/processManager');
const router = require('../src/routes/playerRoutes');
const app = express();
app.use(express.json());
app.use('/api/servers/:serverId/players', router);
const uuid = '550e8400-e29b-41d4-a716-446655440001';
const token = id => jwt.sign({ id }, process.env.JWT_SECRET);
const nameBytes = name => { const bytes = Buffer.from(name); const size = Buffer.alloc(2); size.writeUInt16BE(bytes.length); return Buffer.concat([size, bytes]); };
const tag = (type, name, payload) => Buffer.concat([Buffer.from([type]), nameBytes(name), payload]);
const int = value => { const b = Buffer.alloc(4); b.writeInt32BE(value); return b; };
const item = Buffer.concat([tag(8, 'id', nameBytes('minecraft:diamond')), tag(1, 'Count', Buffer.from([32])), Buffer.from([0])]);
const populatedList = Buffer.concat([Buffer.from([10]), int(1), item]);
const emptyList = Buffer.from([10, 0, 0, 0, 0]);
const before = Buffer.concat([tag(3, 'foodLevel', int(18)), tag(9, 'Inventory', populatedList), tag(10, 'Nested', Buffer.concat([tag(9, 'EnderItems', populatedList), Buffer.from([0])]))]);
const after = Buffer.concat([tag(11, 'IntArray', Buffer.concat([int(2), int(42), int(-1)])), tag(12, 'LongArray', Buffer.concat([int(1), Buffer.alloc(8, 7)])), tag(8, 'Custom', nameBytes('Keep this'))]);
const root = list => Buffer.concat([Buffer.from([10, 0, 0]), before, ...(list ? [tag(9, 'EnderItems', list)] : []), after, Buffer.from([0])]);

let sandbox, serverDir, datFile;
beforeEach(async () => {
    sandbox = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'minepanel-ender-test-'));
    serverDir = path.join(sandbox, 'server');
    const directory = path.join(serverDir, 'community', 'playerdata');
    await fs.promises.mkdir(directory, { recursive: true });
    await fs.promises.writeFile(path.join(serverDir, 'server.properties'), 'level-name=community\n');
    datFile = path.join(directory, uuid + '.dat');
    await fs.promises.writeFile(datFile, zlib.gzipSync(root(populatedList)));
    serverHelper.getServer.mockResolvedValue({ id: 1 });
    serverHelper.getServerDir.mockReturnValue(serverDir);
    pm.getStatus.mockReturnValue('offline');
    pm.acquireLock.mockClear().mockReturnValue(true);
    pm.releaseLock.mockClear(); pm.sendCommand.mockClear();
});
afterEach(async () => {
    // mkdtemp's known absolute sandbox is the only recursively removed target.
    expect(path.dirname(path.resolve(sandbox))).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(sandbox).startsWith('minepanel-ender-test-')).toBe(true);
    await fs.promises.rm(sandbox, { recursive: true, force: true });
});

test('changes only root EnderItems and preserves inventory, nested data and unknown tags', () => {
    expect(emptyEnderItems(root(populatedList))).toEqual(root(emptyList));
});
test('adds an empty list when absent and is idempotent', () => {
    const result = emptyEnderItems(root(null));
    expect(emptyEnderItems(result)).toEqual(result);
    expect(result.subarray(3, 3 + before.length)).toEqual(before);
});
test.each([
    Buffer.from([10, 0, 0, 9]),
    Buffer.concat([Buffer.from([10, 0, 0]), tag(9, 'EnderItems', Buffer.concat([Buffer.from([10]), int(-1)])), Buffer.from([0])]),
    Buffer.concat([Buffer.from([10, 0, 0]), tag(3, 'EnderItems', int(1)), Buffer.from([0])]),
    Buffer.concat([root(populatedList), Buffer.from([0])]),
])('rejects malformed NBT without attempting an edit (%#)', malformed => {
    expect(() => emptyEnderItems(malformed)).toThrow();
});
test('edits a real gzipped file in the configured world, accepts compact UUID and leaves no temp files', async () => {
    await clearPlayerEnderChest(serverDir, uuid.replace(/-/g, ''));
    expect(zlib.gunzipSync(await fs.promises.readFile(datFile))).toEqual(root(emptyList));
    expect(await fs.promises.readdir(path.dirname(datFile))).toEqual([uuid + '.dat']);
});
test('invalid compressed data remains unchanged', async () => {
    const invalid = zlib.gzipSync(Buffer.from([10, 0, 0, 9]));
    await fs.promises.writeFile(datFile, invalid);
    await expect(clearPlayerEnderChest(serverDir, uuid)).rejects.toThrow();
    expect(await fs.promises.readFile(datFile)).toEqual(invalid);
});
test('rejects traversal UUIDs and configured worlds outside the server', async () => {
    await expect(clearPlayerEnderChest(serverDir, '../escape')).rejects.toThrow('UUID');
    await fs.promises.mkdir(path.join(sandbox, 'outside', 'playerdata'), { recursive: true });
    await fs.promises.writeFile(path.join(serverDir, 'server.properties'), 'level-name=../outside\n');
    await expect(clearPlayerEnderChest(serverDir, uuid)).rejects.toThrow('inside');
    expect(zlib.gunzipSync(await fs.promises.readFile(datFile))).toEqual(root(populatedList));
});

const command = (auth = token(1), target = uuid) => {
    const req = request(app).post(`/api/servers/1/players/${target}/command`);
    return (auth ? req.set('Authorization', 'Bearer ' + auth) : req).send({ action: 'clear-enderchest' });
};
test('authenticated administrator clears saved data without a plugin or console command', async () => {
    const response = await command();
    expect(response.status).toBe(200);
    expect(zlib.gunzipSync(await fs.promises.readFile(datFile))).toEqual(root(emptyList));
    expect(pm.sendCommand).not.toHaveBeenCalled();
    expect(pm.releaseLock).toHaveBeenCalledWith('1');
});
test.each(['online', 'starting', 'stopping'])('rejects a %s server without changing data and releases the lock', async status => {
    pm.getStatus.mockReturnValue(status);
    const response = await command();
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SERVER_MUST_BE_STOPPED');
    expect(zlib.gunzipSync(await fs.promises.readFile(datFile))).toEqual(root(populatedList));
    expect(pm.releaseLock).toHaveBeenCalledWith('1');
});
test('requires authentication and server.players.manage permission', async () => {
    expect((await command(null)).status).toBe(401);
    expect((await command(token(2))).status).toBe(403);
    expect(pm.acquireLock).not.toHaveBeenCalled();
});
test('rejects concurrent lifecycle operations and invalid UUIDs', async () => {
    pm.acquireLock.mockReturnValue(false);
    expect((await command()).status).toBe(409);
    expect((await command(token(1), 'invalid')).status).toBe(400);
    expect(zlib.gunzipSync(await fs.promises.readFile(datFile))).toEqual(root(populatedList));
});
