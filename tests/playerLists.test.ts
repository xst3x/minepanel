process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'player-list-test-secret-at-least-32-characters';

jest.mock('../src/db/database', () => ({
    User: { findByPk: jest.fn(async () => ({ disabled: 0, valid_tokens_from: 0 })) },
    dbGet: jest.fn(async (_sql, params) => ({ role: params[0] === 1 ? 'admin' : 'user' })),
    dbAll: jest.fn(async () => []),
}));
jest.mock('../src/core/serverHelper', () => ({ getServer: jest.fn(), getServerDir: jest.fn() }));
jest.mock('../src/core/processManager', () => ({ sendCommand: jest.fn() }));
jest.mock('../src/core/executionManager', () => ({ getStatus: jest.fn() }));
jest.mock('../src/core/dockerService', () => ({ sendStdin: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const serverHelper = require('../src/core/serverHelper');
const processManager = require('../src/core/processManager');
const executionManager = require('../src/core/executionManager');
const dockerService = require('../src/core/dockerService');
const router = require('../src/routes/playerRoutes');
const app = express();
app.use(express.json());
app.use('/api/servers/:serverId/players', router);
const token = id => jwt.sign({ id }, process.env.JWT_SECRET);
const remove = (listName, target, auth = token(1)) => {
    const req = request(app).delete(`/api/servers/1/players/lists/${listName}/${encodeURIComponent(target)}`);
    return auth ? req.set('Authorization', 'Bearer ' + auth) : req;
};
const cases = [
    ['whitelist', 'Notch', 'whitelist remove Notch', { name: 'Notch', uuid: 'target-uuid' }, { name: 'Alex', uuid: 'keep-uuid' }],
    ['ops', 'Notch', 'deop Notch', { name: 'Notch', uuid: 'target-uuid', level: 4 }, { name: 'Alex', uuid: 'keep-uuid', level: 2 }],
    ['banned-players', 'Notch', 'pardon Notch', { name: 'Notch', uuid: 'target-uuid' }, { name: 'Alex', uuid: 'keep-uuid' }],
    ['banned-ips', '192.168.1.100', 'pardon-ip 192.168.1.100', { ip: '192.168.1.100' }, { ip: '192.168.1.101' }],
];

let sandbox;
beforeEach(async () => {
    jest.clearAllMocks();
    sandbox = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'minepanel-lists-test-'));
    serverHelper.getServer.mockResolvedValue({ id: 1, execution_mode: 'native' });
    serverHelper.getServerDir.mockReturnValue(sandbox);
    executionManager.getStatus.mockResolvedValue('offline');
});
afterEach(async () => {
    expect(path.dirname(path.resolve(sandbox))).toBe(path.resolve(os.tmpdir()));
    expect(path.basename(sandbox).startsWith('minepanel-lists-test-')).toBe(true);
    await fs.promises.rm(sandbox, { recursive: true, force: true });
});

test.each(cases)('bodyless GUI DELETE removes only the target from offline %s', async (listName, target, _cmd, entry, keep) => {
    const file = path.join(sandbox, listName + '.json');
    await fs.promises.writeFile(file, JSON.stringify([entry, keep]));
    const response = await remove(listName, target);
    expect(response.status).toBe(200);
    expect(serverHelper.getServer).toHaveBeenCalledWith('1');
    expect(JSON.parse(await fs.promises.readFile(file, 'utf8'))).toEqual([keep]);
    expect(processManager.sendCommand).not.toHaveBeenCalled();
});

test.each(cases)('bodyless GUI DELETE sends the correct command for online %s', async (listName, target, cmd) => {
    executionManager.getStatus.mockResolvedValue('online');
    expect((await remove(listName, target)).status).toBe(200);
    expect(processManager.sendCommand).toHaveBeenCalledWith('1', cmd);
});

test('online Docker whitelist deletion uses container stdin', async () => {
    serverHelper.getServer.mockResolvedValue({ id: 1, execution_mode: 'docker' });
    executionManager.getStatus.mockResolvedValue('online');
    expect((await remove('whitelist', 'Notch')).status).toBe(200);
    expect(dockerService.sendStdin).toHaveBeenCalledWith('1', 'whitelist remove Notch');
    expect(processManager.sendCommand).not.toHaveBeenCalled();
});

test('invalid URL list is rejected even if the body supplies a valid list', async () => {
    const response = await remove('invalid', 'Notch').send({ listName: 'whitelist', target: 'Notch' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(serverHelper.getServer).not.toHaveBeenCalled();
});

test('deletion still requires authentication and manage permission', async () => {
    expect((await remove('whitelist', 'Notch', null)).status).toBe(401);
    expect((await remove('whitelist', 'Notch', token(2))).status).toBe(403);
    expect(serverHelper.getServer).not.toHaveBeenCalled();
});
