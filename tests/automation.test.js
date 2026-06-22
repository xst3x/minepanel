// tests/automation.test.js
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'super-test-secret-key-12345';

jest.mock('archiver', () => ({
    ZipArchive: class { pipe() { return this; } directory() { return this; } finalize() { return Promise.resolve(); } on() { return this; } }
}));

const request = require('supertest');
const { app } = require('../src/index');
const { initDb, dbRun, dbGet } = require('../src/db/database');
const { generateToken } = require('../src/core/auth');
const workerManager = require('../src/core/automation/workerManager');

let token;
const serverId = 999;

beforeAll(async () => {
    await initDb();
    
    // Create a test user and get their token
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('Pass123!', 10);
    await dbRun(
        'INSERT OR IGNORE INTO users (id, username, password, role) VALUES (?, ?, ?, ?)',
        [500, 'auto-test-user', hash, 'admin']
    );
    token = generateToken({ id: 500, username: 'auto-test-user', role: 'admin' });

    // Seed test server
    await dbRun(
        'INSERT OR IGNORE INTO servers (id, uuid, name, software, version, ram_mb, port) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [serverId, 'test-server-uuid-123', 'Test Server', 'vanilla', '1.20', 1024, 25565]
    );
});

describe('Python Static AST Code Validator', () => {
    test('pass on valid template script', async () => {
        const code = `
import minepanel

def run(ctx):
    minepanel.log("Test log")
`;
        const res = await workerManager.verifyCode(code);
        expect(res.valid).toBe(true);
        expect(res.errors).toHaveLength(0);
    });

    test('fail on forbidden imports (os)', async () => {
        const code = `
import os
import sys

def run(ctx):
    pass
`;
        const res = await workerManager.verifyCode(code);
        expect(res.valid).toBe(false);
        expect(res.errors.some(err => err.includes('Forbidden import: os'))).toBe(true);
        expect(res.errors.some(err => err.includes('Forbidden import: sys'))).toBe(true);
    });

    test('fail on invalid decorators', async () => {
        const code = `
import minepanel

@event("player_joined_wrong_event")
def handle(ctx):
    pass
`;
        const res = await workerManager.verifyCode(code);
        expect(res.valid).toBe(false);
        expect(res.errors.some(err => err.includes("Undefined event decorator: 'player_joined_wrong_event'"))).toBe(true);
    });

    test('fail on invalid minepanel attributes', async () => {
        const code = `
import minepanel

def run(ctx):
    minepanel.delete_all_files()
`;
        const res = await workerManager.verifyCode(code);
        expect(res.valid).toBe(false);
        expect(res.errors.some(err => err.includes("AttributeError: minepanel has no attribute 'delete_all_files'"))).toBe(true);
    });

    test('fail on forbidden builtins (open)', async () => {
        const code = `
def run(ctx):
    f = open("somefile.txt", "w")
`;
        const res = await workerManager.verifyCode(code);
        expect(res.valid).toBe(false);
        expect(res.errors.some(err => err.includes("Forbidden function call: 'open'"))).toBe(true);
    });
});

describe('Automation API Endpoints', () => {
    let createdRuleId;

    test('POST /api/servers/:id/automation (create automation script)', async () => {
        const res = await request(app)
            .post(`/api/servers/${serverId}/automation`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'WelcomeNotifier',
                script: 'import minepanel\n\n@event("player_join")\ndef welcome(ctx):\n    minepanel.log("Welcoming player")'
            })
            .expect(201);

        expect(res.body.rule).toHaveProperty('id');
        expect(res.body.rule.name).toBe('WelcomeNotifier');
        expect(res.body.rule.script).toContain('welcome');
        createdRuleId = res.body.rule.id;
    });

    test('GET /api/servers/:id/automation (list automation rules)', async () => {
        const res = await request(app)
            .get(`/api/servers/${serverId}/automation`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(res.body.rules).toHaveLength(1);
        expect(res.body.rules[0].id).toBe(createdRuleId);
        expect(res.body.automationEnabled).toBe(false); // default 0
    });

    test('PATCH /api/servers/:id/automation/server-toggle (toggle server automation)', async () => {
        const res = await request(app)
            .patch(`/api/servers/${serverId}/automation/server-toggle`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        expect(res.body.automationEnabled).toBe(true);

        const server = await dbGet('SELECT automation_enabled FROM servers WHERE id = ?', [serverId]);
        expect(server.automation_enabled).toBe(1);
    });

    test('POST /api/servers/:id/automation/verify (verify script code via API)', async () => {
        const res = await request(app)
            .post(`/api/servers/${serverId}/automation/verify`)
            .set('Authorization', `Bearer ${token}`)
            .send({ code: 'import os' })
            .expect(200);

        expect(res.body.valid).toBe(false);
        expect(res.body.errors.some(err => err.includes('Forbidden import: os'))).toBe(true);
    });

    test('PUT /api/servers/:id/automation/:ruleId (update script)', async () => {
        const updatedScript = 'import minepanel\n# Updated comment';
        const res = await request(app)
            .put(`/api/servers/${serverId}/automation/${createdRuleId}`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                name: 'NewName',
                script: updatedScript,
                enabled: false
            })
            .expect(200);

        expect(res.body.rule.name).toBe('NewName');
        expect(res.body.rule.script).toBe(updatedScript);
        expect(res.body.rule.enabled).toBe(false);
    });

    test('POST /api/servers/:id/automation/run-test (run test code)', async () => {
        const res = await request(app)
            .post(`/api/servers/${serverId}/automation/run-test`)
            .set('Authorization', `Bearer ${token}`)
            .send({ code: 'import minepanel\n\ndef run(ctx):\n    minepanel.log("Manually running script")' })
            .expect(200);

        expect(res.body.ok).toBe(true);
    });

    test('DELETE /api/servers/:id/automation/:ruleId (delete script)', async () => {
        await request(app)
            .delete(`/api/servers/${serverId}/automation/${createdRuleId}`)
            .set('Authorization', `Bearer ${token}`)
            .expect(200);

        const rule = await dbGet('SELECT * FROM automation_rules WHERE id = ?', [createdRuleId]);
        expect(rule).toBeUndefined();
    });
});
