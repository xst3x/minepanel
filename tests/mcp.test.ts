process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'mcp-test-secret-that-is-at-least-32-characters';
jest.mock('../src/core/processManager', () => ({ getHistory: jest.fn(() => ['fixture log\n']), sendCommand: jest.fn(), getStatus: jest.fn(() => 'offline') }));
jest.mock('../src/core/serverHelper', () => ({
    getServer: id => require('../src/db/database').dbGet('SELECT * FROM servers WHERE id=?', [id]),
    getServerDir: jest.fn(),
    createBackup: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const database = require('../src/db/database');
const store = require('../src/core/mcp/store');
const engine = require('../src/core/mcp/engine');
const { registry, registerTool, authorizedTools, redact } = require('../src/core/mcp/registry');
const { createMcpMiddleware, validTransport } = require('../src/core/mcp/transport');
const permissions = require('../src/core/permissions');
const processManager = require('../src/core/processManager');
const serverHelper = require('../src/core/serverHelper');
const { safeServerPath } = require('../src/core/safeServerPath');
const management = require('../src/routes/mcpRoutes');

let root;
let ownerRank;
let transport;
let app;
const keyHeader = key => ({ Authorization: `Bearer ${key}`, Accept: 'application/json, text/event-stream' });
const message = (method, params = {}, id = 1) => ({ jsonrpc: '2.0', id, method, params });
const humanToken = id => jwt.sign({ id, role: 'admin', iat: Math.floor(Date.now() / 1000) }, process.env.JWT_SECRET);
const make = async (extra = {}) => store.createIdentity({ name: 'Test agent', rankId: ownerRank, allowedServers: ['1'], approvalMode: 'full', ...extra }, '1');
const rpc = (key, body) => request(app).post('/mcp').set(keyHeader(key)).send(body);
const rpcBody = response => response.headers['content-type']?.includes('text/event-stream')
    ? JSON.parse(response.text.split('\n').find(line => line.startsWith('data: ')).slice(6)) : response.body;

beforeAll(async () => {
    await database.initDb();
    ownerRank = (await database.dbGet("SELECT id FROM ranks WHERE name='Owner'")).id;
    await database.dbRun("INSERT INTO users(id,username,password,role,disabled) VALUES(1,'fixture-admin','unused','admin',0)");
    await database.dbRun("INSERT INTO users(id,username,password,role,rank_id,disabled) VALUES(2,'fixture-manager','unused','user',?,0)", [ownerRank]);
    for (const id of [1, 2]) await database.dbRun("INSERT INTO servers(id,uuid,name,software,version,ram_mb,port,directory_name) VALUES(?,?,?,'paper','1.21',1024,?,?)", [id, `fixture-${id}`, `Fixture ${id}`, 25564 + id, `fixture-${id}`]);
});
beforeEach(async () => {
    jest.clearAllMocks();
    await database.dbRun('DELETE FROM mcp_approvals');
    await database.dbRun('DELETE FROM mcp_audit');
    await database.dbRun('DELETE FROM mcp_identities');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'minepanel-mcp-'));
    serverHelper.getServerDir.mockReturnValue(root);
    fs.writeFileSync(path.join(root, 'example.txt'), 'before');
    await store.saveSettings({ enabled: true });
    transport = createMcpMiddleware();
    app = express();
    app.use(transport.middleware);
    app.use(express.json());
    app.use('/api/mcp', management);
    app.use('/api/servers/:serverId/files', require('../src/routes/fileRoutes'));
});
afterEach(async () => {
    await transport.close();
    expect(path.dirname(path.resolve(root))).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(root).startsWith('minepanel-mcp-')).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
});

test('migration is repeatable and does not reset users or servers', async () => {
    const count = await database.dbGet('SELECT COUNT(*) AS count FROM users');
    await require('../src/db/migrations/026_mcp').up(database.dbRun);
    expect((await database.dbGet('SELECT COUNT(*) AS count FROM users')).count).toBe(count.count);
    expect((await database.dbAll('SELECT * FROM servers')).length).toBe(2);
});
test('existing unrelated migrations 24 and 25 cannot suppress MCP table creation', async () => {
    const sqlite = require('sqlite3');
    const fixture = new sqlite.Database(':memory:');
    const run = (sql, params = []) => new Promise((resolve, reject) => fixture.run(sql, params, function(error) { error ? reject(error) : resolve(this); }));
    const get = (sql, params = []) => new Promise((resolve, reject) => fixture.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
    const all = (sql, params = []) => new Promise((resolve, reject) => fixture.all(sql, params, (error, rows) => error ? reject(error) : resolve(rows)));
    try {
        await run('CREATE TABLE _migrations(version INTEGER PRIMARY KEY, description TEXT)');
        for (let version = 1; version <= 23; version++) await run('INSERT INTO _migrations VALUES(?,?)', [version, 'Existing installation']);
        await run('INSERT INTO _migrations VALUES(24,?)', ['Remove legacy users.role authorization column']);
        await run('INSERT INTO _migrations VALUES(25,?)', ['Enforce referential integrity']);
        await run('CREATE TABLE users(id INTEGER PRIMARY KEY)');
        await run("CREATE TABLE ranks(id INTEGER PRIMARY KEY,name TEXT,global_permissions TEXT DEFAULT '[]')");
        await run('CREATE TABLE servers(id INTEGER PRIMARY KEY)');
        await run('INSERT INTO users VALUES(1)');
        await run('INSERT INTO servers VALUES(1)');
        await require('../src/db/migrationRunner').runMigrations(run, get, all);
        for (const table of ['mcp_identities', 'mcp_settings', 'mcp_approvals', 'mcp_audit']) expect(await get('SELECT name FROM sqlite_master WHERE name=?', [table])).toBeDefined();
        expect((await get('SELECT description FROM _migrations WHERE version=24')).description).toBe('Remove legacy users.role authorization column');
        expect(await get('SELECT version FROM _migrations WHERE version=26')).toBeDefined();
        expect((await get('SELECT COUNT(*) AS count FROM users')).count).toBe(1);
        expect((await get('SELECT COUNT(*) AS count FROM servers')).count).toBe(1);
    } finally { await new Promise(resolve => fixture.close(resolve)); }
});
test('migration 26 preserves identities already created by the earlier MCP schema', async () => {
    const created = await make();
    await require('../src/db/migrations/026_mcp').up(database.dbRun);
    expect((await store.authenticate(created.key)).id).toBe(created.identity.id);
});
test('keys are revealed once, hashed at rest and absent from normal users', async () => {
    const created = await make();
    expect(created.key).toMatch(/^mp_mcp_/);
    expect((await store.authenticate(created.key)).id).toBe(created.identity.id);
    const row = await database.dbGet('SELECT * FROM mcp_identities WHERE id=?', [created.identity.id]);
    expect(row.key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(await store.identities())).not.toContain(created.key);
    expect(JSON.stringify(await database.dbAll('SELECT * FROM mcp_audit'))).not.toContain(created.key);
    expect((await database.dbGet('SELECT COUNT(*) AS count FROM users')).count).toBe(2);
});
test('missing, malformed and invalid bearer keys cannot initialize', async () => {
    expect((await rpc('', message('initialize'))).status).toBe(401);
    const { key } = await make();
    expect((await rpc(key.slice(0, -1) + (key.endsWith('a') ? 'b' : 'a'), message('initialize'))).status).toBe(401);
    expect((await rpc('not-a-key', message('tools/list'))).status).toBe(401);
});
test('rotation invalidates old keys and outstanding approvals; revocation disables immediately', async () => {
    const { identity, key } = await make({ approvalMode: 'everything' });
    const pending = await engine.executeTool(identity, 'files_read', { serverId: '1', path: 'example.txt' });
    const rotated = await store.rotateKey(identity.id, '1');
    expect(await store.authenticate(key)).toBeNull();
    expect(await store.authenticate(rotated.key)).not.toBeNull();
    expect((await database.dbGet('SELECT status FROM mcp_approvals WHERE id=?', [pending.approvalId])).status).toBe('denied');
    await store.rotateKey(identity.id, '1', true);
    expect(await store.authenticate(rotated.key)).toBeNull();
});
test('legacy MCP initializes and discovers schemas with current authorization', async () => {
    const { key } = await make({ overrides: { 'server.console.write': false } });
    const init = await rpc(key, message('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'fixture', version: '1' } }));
    expect(init.status).toBe(200);
    expect(rpcBody(init).result.serverInfo.name).toBe('MinePanel');
    const list = await rpc(key, message('tools/list'));
    expect(list.status).toBe(200);
    expect(rpcBody(list).result.tools.some(t => t.name === 'files_read')).toBe(true);
    expect(rpcBody(list).result.tools.some(t => t.name === 'console_command')).toBe(false);
    expect(rpcBody(list).result.tools.find(t => t.name === 'files_write').inputSchema.properties.expectedVersion).toBeDefined();
});
test('official current MCP client initializes, discovers, reads a file, resources and prompt', async () => {
    const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
    const { key } = await make();
    const listener = app.listen(0, '127.0.0.1');
    await new Promise(resolve => listener.once('listening', resolve));
    const client = new Client({ name: 'MinePanel fixture client', version: '1' });
    try {
        await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${listener.address().port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
        expect((await client.listTools()).tools.some(t => t.name === 'files_read')).toBe(true);
        const read = await client.callTool({ name: 'files_read', arguments: { serverId: '1', path: 'example.txt' } });
        expect(read.structuredContent.result.content).toBe('before');
        expect((await client.readResource({ uri: 'minepanel://guide' })).contents[0].text).toContain('approval_result');
        expect((await client.getPrompt({ name: 'minepanel-workflow', arguments: { goal: 'Inspect the server' } })).messages.length).toBe(1);
    } finally { await client.close(); await new Promise(resolve => listener.close(resolve)); }
});
test('rank permissions reuse evaluator; overrides deny wildcard permissions and allowed servers are mandatory', async () => {
    const { identity } = await make({ overrides: { 'server.files.read': false } });
    expect(await permissions.hasPermission(`mcp:${identity.id}`, '1', 'server.files.read')).toBe(false);
    expect(await permissions.hasPermission(`mcp:${identity.id}`, '1', 'server.stop')).toBe(true);
    expect(await permissions.hasPermission(`mcp:${identity.id}`, '2', 'server.stop')).toBe(false);
    expect(await permissions.hasPermission('1', '2', 'server.stop')).toBe(true);
    const names = (await authorizedTools(identity)).map(t => t.name);
    expect(names).not.toContain('files_read');
    await expect(engine.executeTool(identity, 'server_stop', { serverId: '2' })).rejects.toThrow('Server access denied');
    await expect(engine.executeTool(identity, 'files_read', { serverId: '1', path: 'example.txt', userId: 1 })).rejects.toThrow();
});
test('rank scoped permissions do not bleed into other allowed servers', async () => {
    const rank = await database.dbRun("INSERT INTO ranks(name,permissions,global_permissions) VALUES('Fixture scoped',?, '[]')", [JSON.stringify({ '1': ['server.files.read'] })]);
    const { identity } = await make({ rankId: rank.lastID, allowedServers: ['1', '2'] });
    expect(await permissions.hasPermission(`mcp:${identity.id}`, '1', 'server.files.read')).toBe(true);
    expect(await permissions.hasPermission(`mcp:${identity.id}`, '2', 'server.files.read')).toBe(false);
});
test('no assigned rank grants no implicit permissions', async () => {
    const { identity } = await make({ rankId: null });
    expect(await authorizedTools(identity)).toEqual([]);
    await expect(engine.executeTool(identity, 'console_command', { serverId: '1', command: 'op Notch' })).rejects.toThrow('Permission denied');
});
test.each(['full', 'dangerous', 'everything'])('approval mode %s is enforced for reads and commands', async mode => {
    const { identity } = await make({ approvalMode: mode });
    const read = await engine.executeTool(identity, 'files_read', { serverId: '1', path: 'example.txt' });
    expect(read.status).toBe(mode === 'everything' ? 'pending' : 'completed');
    const command = await engine.executeTool(identity, 'console_command', { serverId: '1', command: 'say fixture' });
    expect(command.status).toBe(mode === 'full' ? 'completed' : 'pending');
    expect(processManager.sendCommand).toHaveBeenCalledTimes(mode === 'full' ? 1 : 0);
});
test('immutable arguments, atomic claims and repeated polling never execute twice', async () => {
    const { identity } = await make({ approvalMode: 'dangerous' });
    const args = { serverId: '1', command: 'say original' };
    const pending = await engine.executeTool(identity, 'console_command', args);
    args.command = 'op Notch';
    await store.decide(pending.approvalId, true, '1');
    await Promise.all(Array.from({ length: 8 }, () => engine.approvalResult(identity, pending.approvalId)));
    await engine.approvalResult(identity, pending.approvalId);
    expect(processManager.sendCommand).toHaveBeenCalledTimes(1);
    expect(processManager.sendCommand).toHaveBeenCalledWith('1', 'say original');
    await expect(store.decide(pending.approvalId, true, '1')).rejects.toThrow();
});
test('denied, expired and revoked approvals never execute', async () => {
    const { identity } = await make({ approvalMode: 'everything' });
    const denied = await engine.executeTool(identity, 'console_command', { serverId: '1', command: 'say denied' });
    await store.decide(denied.approvalId, false, '1');
    expect((await engine.approvalResult(identity, denied.approvalId)).status).toBe('denied');
    const expired = await engine.executeTool(identity, 'console_command', { serverId: '1', command: 'say expired' });
    await database.dbRun('UPDATE mcp_approvals SET expires_at=0 WHERE id=?', [expired.approvalId]);
    expect((await engine.approvalResult(identity, expired.approvalId)).status).toBe('expired');
    await expect(store.decide(expired.approvalId, true, '1')).rejects.toThrow();
    expect(processManager.sendCommand).not.toHaveBeenCalled();
});
test('permissions and server access are revalidated after approval', async () => {
    const { identity } = await make({ approvalMode: 'dangerous' });
    const pending = await engine.executeTool(identity, 'console_command', { serverId: '1', command: 'say approved' });
    await store.decide(pending.approvalId, true, '1');
    await store.updateIdentity(identity.id, { name: identity.name, rankId: identity.rankId, allowedServers: [], approvalMode: 'dangerous' }, '1');
    await expect(engine.approvalResult(identity, pending.approvalId)).rejects.toThrow('Server access denied');
    expect(processManager.sendCommand).not.toHaveBeenCalled();
});
test('another identity cannot poll or consume an approval', async () => {
    const { identity } = await make({ approvalMode: 'everything' });
    const other = (await make()).identity;
    const pending = await engine.executeTool(identity, 'files_read', { serverId: '1', path: 'example.txt' });
    await expect(engine.approvalResult(other, pending.approvalId)).rejects.toThrow('Request not found');
});
test('pending approval ceiling holds under concurrent submissions', async () => {
    await store.saveSettings({ enabled: true, maxPendingApprovals: 2 });
    const { identity } = await make({ approvalMode: 'everything' });
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => engine.executeTool(identity, 'files_read', { serverId: '1', path: 'example.txt' })));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(2);
});
test('global and identity request limits apply to protocol discovery', async () => {
    await store.saveSettings({ enabled: true, requestsPerMinute: 5, identityRequestsPerMinute: 2 });
    const { key } = await make();
    expect((await rpc(key, message('tools/list'))).status).toBe(200);
    expect((await rpc(key, message('tools/list'))).status).toBe(200);
    expect((await rpc(key, message('tools/list'))).status).toBe(429);
    for (let i = 0; i < 2; i++) await rpc('invalid-key', message('tools/list'));
    expect((await rpc('invalid-key', message('tools/list'))).status).toBe(429);
});
test('Origin, Host, HTTPS, stateless session and raw body size are enforced', async () => {
    const { key } = await make();
    expect((await rpc(key, message('tools/list')).set('Origin', 'https://evil.example')).status).toBe(403);
    expect((await rpc(key, message('tools/list')).set('Host', 'evil.example')).status).toBe(403);
    await store.saveSettings({ enabled: true, publicUrl: 'https://panel.example.com', maxRequestBytes: 1024 });
    expect((await rpc(key, message('tools/list')).set('Host', 'panel.example.com').set('X-Forwarded-Proto', 'https')).status).toBe(403);
    expect((await rpc(key, message('tools/list')).set('Mcp-Session-Id', 'attacker-session')).status).toBe(400);
    expect((await rpc(key, message('tools/list', { padding: 'x'.repeat(2000) }))).status).toBe(413);
    expect((await request(app).get('/mcp').set(keyHeader(key))).status).toBe(405);
});
test('local HTTPS Origin matches the secure endpoint without allowing an unrelated origin', async () => {
    const config = await store.settings();
    const headers = { host: 'localhost:8080', origin: 'https://localhost:8080' };
    const req = { get: name => headers[name.toLowerCase()], socket: { encrypted: true, remoteAddress: '127.0.0.1' } };
    expect(validTransport(req, config)).toBe(true);
    headers.origin = 'https://evil.example';
    expect(validTransport(req, config)).toBe(false);
    headers.origin = 'http://localhost:8080';
    expect(validTransport(req, config)).toBe(false);
});
test('file tools share GUI validation and expected-version conflict protection', async () => {
    const { identity } = await make();
    const read = await engine.executeTool(identity, 'files_read', { serverId: '1', path: 'example.txt' });
    expect(read.result.content).toBe('before');
    expect(read.result.version).toMatch(/^[a-f0-9]{64}$/);
    fs.writeFileSync(path.join(root, 'example.txt'), 'GUI edit');
    const conflict = await engine.executeTool(identity, 'files_write', { serverId: '1', path: 'example.txt', content: 'MCP edit', expectedVersion: read.result.version });
    expect(conflict.status).toBe('failed');
    expect(fs.readFileSync(path.join(root, 'example.txt'), 'utf8')).toBe('GUI edit');
    expect((await request(app).post('/api/servers/1/files/write').set('Authorization', `Bearer ${humanToken(1)}`).send({ path: 'example.txt', content: 'GUI save' })).status).toBe(200);
    const written = await engine.executeTool(identity, 'files_write', { serverId: '1', path: 'example.txt', content: 'MCP save' });
    expect(written.status).toBe('completed');
    expect(fs.readFileSync(path.join(root, 'example.txt'), 'utf8')).toBe('MCP save');
});
test('traversal, symlink escapes, protected paths and root deletion are denied', async () => {
    const { identity } = await make();
    await expect(engine.executeTool(identity, 'files_read', { serverId: '1', path: '../outside' })).rejects.toThrow();
    fs.writeFileSync(path.join(root, '.env'), 'JWT_SECRET=do-not-return');
    expect((await engine.executeTool(identity, 'files_read', { serverId: '1', path: '.env' })).status).toBe('failed');
    expect((await engine.executeTool(identity, 'files_delete', { serverId: '1', path: '/' })).status).toBe('failed');
    fs.symlinkSync(os.tmpdir(), path.join(root, 'escape'), 'junction');
    expect(() => safeServerPath(root, 'escape/outside')).toThrow('Symbolic links');
    expect((await engine.executeTool(identity, 'files_read', { serverId: '1', path: 'escape/outside' })).status).toBe('failed');
    fs.unlinkSync(path.join(root, 'escape'));
});
test('dangerous classification is conservative and privileges cannot be edited through the registry', () => {
    for (const name of ['files_write', 'files_delete', 'console_command', 'player_action', 'plugins_install', 'server_delete', 'automation_delete']) expect(registry.find(t => t.name === name).risk).toBe('dangerous');
    expect(registry.some(t => /^(rank_update|user_update|mcp_.*)/.test(t.name))).toBe(false);
});
test('MCP management accepts authorized panel users while rejecting agent credentials', async () => {
    const { key } = await make();
    expect((await request(app).post('/api/mcp/identities').set('Authorization', `Bearer ${key}`).send({ name: 'escalation', rankId: ownerRank })).status).toBe(401);
    expect((await request(app).get('/api/mcp/identities').set('Authorization', `Bearer ${humanToken(2)}`)).status).toBe(200);
    expect((await request(app).get('/api/mcp/identities').set('Authorization', `Bearer ${humanToken(1)}`)).status).toBe(200);
});
test.each(['Owner', 'Admin', 'Manager', 'Helper', 'Player'])('%s rank has the correct MCP management access', async name => {
    const rank = await database.dbGet('SELECT id,global_permissions FROM ranks WHERE name=?', [name]);
    const user = await database.dbRun("INSERT INTO users(username,password,role,rank_id) VALUES(?,'unused','user',?)", [`mcp-access-${name}`, rank.id]);
    const allowed = ['Owner', 'Admin', 'Manager'].includes(name);
    expect(JSON.parse(rank.global_permissions).includes('mcp.manage')).toBe(allowed);
    const response = await request(app).get('/api/mcp/settings').set('Authorization', `Bearer ${humanToken(user.lastID)}`);
    expect(response.status).toBe(allowed ? 200 : 403);
    if (allowed) {
        const update = await request(app).put('/api/mcp/settings').set('Authorization', `Bearer ${humanToken(user.lastID)}`).send({ enabled: true });
        expect(update.status).toBe(200);
    }
});
test('mcp.manage grants only MCP administration and cannot be assigned to agent overrides', async () => {
    const user = await database.dbRun("INSERT INTO users(username,password,role,global_permissions) VALUES('mcp-only','unused','user',?)", [JSON.stringify(['mcp.manage'])]);
    expect(await permissions.hasPermission(user.lastID, null, 'mcp.manage')).toBe(true);
    expect(await permissions.hasPermission(user.lastID, null, 'panel.settings')).toBe(false);
    expect((await request(app).get('/api/mcp/identities').set('Authorization', `Bearer ${humanToken(user.lastID)}`)).status).toBe(200);
    const { identity } = await make();
    expect(await permissions.hasPermission(`mcp:${identity.id}`, null, 'mcp.manage')).toBe(false);
    await expect(make({ overrides: { 'mcp.manage': true } })).rejects.toThrow();
});
test('Manager notification access is revalidated when its MCP permission is revoked', async () => {
    const WebSocket = require('ws');
    const { attachMcpNotifications } = require('../src/core/mcp/notifications');
    const rank = await database.dbGet("SELECT id FROM ranks WHERE name='Manager'");
    const user = await database.dbRun("INSERT INTO users(username,password,role,rank_id) VALUES('notification-manager','unused','user',?)", [rank.id]);
    const listener = app.listen(0, '127.0.0.1');
    await new Promise(resolve => listener.once('listening', resolve));
    const sockets = new WebSocket.Server({ server: listener });
    sockets.on('connection', socket => attachMcpNotifications(socket));
    const client = new WebSocket(`ws://127.0.0.1:${listener.address().port}/ws?channel=mcp`);
    try {
        const message = new Promise((resolve, reject) => { client.once('message', value => resolve(JSON.parse(value.toString()))); client.once('error', reject); });
        client.once('open', () => client.send(JSON.stringify({ type: 'auth', token: humanToken(user.lastID) })));
        expect(await message).toMatchObject({ type: 'mcp_changed', pending: 0 });
        const closed = new Promise(resolve => client.once('close', code => resolve(code)));
        await database.dbRun('UPDATE users SET rank_id=NULL WHERE id=?', [user.lastID]);
        store.mcpEvents.emit('changed');
        expect(await closed).toBe(4003);
    } finally {
        client.terminate();
        await new Promise(resolve => sockets.close(resolve));
        await new Promise(resolve => listener.close(resolve));
    }
});
test('responses redact credential fields, key material, JSON and YAML secrets', () => {
    expect(redact({ ftp_password_plain: 'secret', nested: { jwt_secret: 'jwt' }, content: 'rcon.password=hidden\npassword: hidden\n{"api_token":"hidden"}' })).toEqual({ ftp_password_plain: '[REDACTED]', nested: { jwt_secret: '[REDACTED]' }, content: 'rcon.password=[REDACTED]\npassword:[REDACTED]\n{"api_token":"[REDACTED]"}' });
});
test('restart recovery does not replay uncertain side effects', async () => {
    const { identity } = await make({ approvalMode: 'everything' });
    const pending = await engine.executeTool(identity, 'console_command', { serverId: '1', command: 'say uncertain' });
    await database.dbRun("UPDATE mcp_approvals SET status='executing' WHERE id=?", [pending.approvalId]);
    await engine.recoverInterruptedOperations();
    expect((await engine.approvalResult(identity, pending.approvalId)).status).toBe('failed');
    expect(processManager.sendCommand).not.toHaveBeenCalled();
});
test('Approve Everything withholds the polling tool and uses an owned operation resource', async () => {
    const { Client, StreamableHTTPClientTransport } = require('@modelcontextprotocol/client');
    const { identity, key } = await make({ approvalMode: 'everything' });
    const listener = app.listen(0, '127.0.0.1');
    await new Promise(resolve => listener.once('listening', resolve));
    const client = new Client({ name: 'Approval fixture', version: '1' });
    try {
        await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${listener.address().port}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
        expect((await client.listTools()).tools.some(t => t.name === 'approval_result')).toBe(false);
        const pending = (await client.callTool({ name: 'files_read', arguments: { serverId: '1', path: 'example.txt' } })).structuredContent;
        expect(pending.status).toBe('pending');
        const resource = { uri: pending.resultUri };
        expect(JSON.parse((await client.readResource(resource)).contents[0].text).status).toBe('pending');
        await store.decide(pending.approvalId, true, '1');
        expect(JSON.parse((await client.readResource(resource)).contents[0].text).result.content).toBe('before');
    } finally { await client.close(); await new Promise(resolve => listener.close(resolve)); }
});
test('operation concurrency is reserved before claims and a timed out operation keeps its slot', async () => {
    let finish;
    const work = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    const name = 'fixture_concurrency';
    registerTool({ name, description: 'Fixture only', permission: 'server.console.read', risk: 'ordinary', server: true, schema: z.object({ serverId: z.string() }), execute: work });
    await store.saveSettings({ enabled: true, maxConcurrent: 1, requestTimeoutMs: 1000 });
    const { identity } = await make();
    try {
        const first = await engine.executeTool(identity, name, { serverId: '1' });
        expect(first.status).toBe('executing');
        const second = await engine.executeTool(identity, name, { serverId: '1' });
        expect(second.status).toBe('approved');
        expect(work).toHaveBeenCalledTimes(1);
        finish({ done: true });
        // Wait on the durable state, not an arbitrary delay.
        while ((await database.dbGet('SELECT status FROM mcp_approvals WHERE id=?', [first.approvalId])).status === 'executing') await new Promise(resolve => setTimeout(resolve, 5));
        expect((await engine.approvalResult(identity, first.approvalId)).status).toBe('completed');
        work.mockResolvedValueOnce({ done: true });
        expect((await engine.approvalResult(identity, second.approvalId)).status).toBe('completed');
    } finally { if (finish) finish({}); registry.splice(registry.findIndex(t => t.name === name), 1); }
});
test('file moves into executable content directories require install permission too', async () => {
    const { identity } = await make({ overrides: { 'server.plugins.install': false } });
    fs.mkdirSync(path.join(root, 'plugins'));
    const result = await engine.executeTool(identity, 'files_move', { serverId: '1', paths: ['example.txt'], destination: 'plugins' });
    expect(result.status).toBe('failed');
    expect(fs.existsSync(path.join(root, 'example.txt'))).toBe(true);
});
test('MCP endpoint does not intercept its separate GUI route and follows endpoint configuration', async () => {
    app.get('/mcp-servers', (_req, res) => res.type('html').send('Fixture management UI'));
    await store.saveSettings({ enabled: false });
    expect((await request(app).get('/mcp-servers')).status).toBe(200);
    expect((await request(app).post('/mcp')).status).toBe(503);
    await expect(store.saveSettings({ endpoint: '/mcp-servers' })).rejects.toThrow('Reserved endpoint');
    await store.saveSettings({ enabled: true, endpoint: '/agent/mcp' });
    const { key } = await make();
    expect((await request(app).post('/agent/mcp').set(keyHeader(key)).send(message('tools/list'))).status).toBe(200);
    expect((await rpc(key, message('tools/list'))).status).toBe(404);
});
test('credential material is rejected before storing immutable operation arguments', async () => {
    const { identity, key } = await make({ approvalMode: 'everything' });
    await expect(engine.executeTool(identity, 'files_write', { serverId: '1', path: 'notes.txt', content: key })).rejects.toThrow('authentication keys');
    expect((await database.dbGet('SELECT COUNT(*) AS count FROM mcp_approvals')).count).toBe(0);
});
test('Modrinth search maps its query to the existing provider handler without external requests', async () => {
    const https = require('https');
    const { EventEmitter } = require('events');
    const spy = jest.spyOn(https, 'request').mockImplementation((_url, _options, callback) => {
        const response = Object.assign(new EventEmitter(), { statusCode: 200 });
        const outbound = Object.assign(new EventEmitter(), { setTimeout: () => {}, destroy: () => {}, end: () => {
            callback(response);
            response.emit('data', JSON.stringify({ hits: [{ project_id: 'fixture-project', title: 'LuckPerms', server_side: 'required' }], total_hits: 1 }));
            response.emit('end');
        } });
        return outbound;
    });
    try {
        const { identity } = await make();
        const result = await engine.executeTool(identity, 'plugins_search', { serverId: '1', query: 'LuckPerms' });
        expect(result.status).toBe('completed');
        expect(result.result.hits[0].title).toBe('LuckPerms');
        expect(new URL(spy.mock.calls[0][0]).searchParams.get('query')).toBe('LuckPerms');
    } finally { spy.mockRestore(); }
});
test('file creation, copying, moving, renaming, archiving and deletion reuse working GUI handlers', async () => {
    const { identity } = await make();
    for (const [tool, args] of [
        ['files_create', { path: 'new.txt' }], ['files_mkdir', { path: 'copies' }],
        ['files_copy', { paths: ['example.txt'], destination: 'copies' }],
        ['files_move', { paths: ['copies/example.txt'], destination: 'moved' }],
        ['files_rename', { oldPath: 'moved/example.txt', newPath: 'moved/renamed.txt' }],
        ['files_archive', { paths: ['moved/renamed.txt'], archiveName: 'fixture-archive' }],
    ]) expect((await engine.executeTool(identity, tool, { serverId: '1', ...args })).status).toBe('completed');
    expect(fs.readFileSync(path.join(root, 'moved/renamed.txt'), 'utf8')).toBe('before');
    expect(fs.existsSync(path.join(root, 'moved/fixture-archive.zip'))).toBe(true);
    expect((await engine.executeTool(identity, 'files_delete', { serverId: '1', path: 'moved/renamed.txt' })).status).toBe('completed');
    expect(fs.existsSync(path.join(root, 'moved/renamed.txt'))).toBe(false);
});
test('redacted file reads do not publish an offline credential verifier', async () => {
    const { identity } = await make();
    fs.writeFileSync(path.join(root, 'server.properties'), 'rcon.password=fixture-private-password\n');
    const result = await engine.executeTool(identity, 'files_read', { serverId: '1', path: 'server.properties' });
    expect(result.status).toBe('completed');
    expect(result.result.content).toContain('[REDACTED]');
    expect(result.result.content).not.toContain('fixture-private-password');
    expect(result.result.version).toBeNull();
});
