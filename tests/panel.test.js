require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

// Mock a simple database and other dependencies so routing files can load without throwing
const mockDb = {
    run: (sql, params, cb) => { if (cb) cb(null); },
    get: (sql, params, cb) => { if (cb) cb(null, {}); },
    all: (sql, params, cb) => { if (cb) cb(null, []); }
};
jestMockModule('../src/db/database', {
    db: mockDb,
    dbRun: () => Promise.resolve({ lastID: 1 }),
    dbGet: () => Promise.resolve({}),
    dbAll: () => Promise.resolve([])
});

// Mock resolvers
jestMockModule('../src/core/resolvers', {
    resolveJar: () => Promise.resolve({ provider: 'paper', version: '1.20', build: '1', type: 'paper', url: 'http://example.com' }),
    downloadJar: () => Promise.resolve({ localPath: '/tmp/mock.jar' })
});

// Helper to mock modules globally in Node's require cache
function jestMockModule(modulePath, mockExport) {
    const resolvedPath = path.resolve(__dirname, modulePath);
    require.cache[resolvedPath] = {
        id: resolvedPath,
        filename: resolvedPath,
        loaded: true,
        exports: mockExport
    };
}

// Ensure database and resolver mock are registered before loading routes
const userRoutes = require('../src/routes/userRoutes');
const { retryOperation } = require('../src/core/utils/fsRetry');
const ProcessManager = require('../src/core/processManager');

test('Self-deletion protection middleware blocks active session user deletion', async (t) => {
    // Locate the preventSelfDeletion middleware in userRoutes route stack
    const deleteRoute = userRoutes.stack.find(
        (layer) => layer.route && layer.route.path === '/:userId/delete'
    );
    assert.ok(deleteRoute, 'Should find the delete route in stack');
    
    // The stack contains: [authenticateToken, preventSelfDeletion, checkGlobalPermission, handler]
    const preventSelfDeletion = deleteRoute.route.stack[1].handle;
    assert.equal(preventSelfDeletion.name, 'preventSelfDeletion');

    // Case A: User attempts to delete themselves
    let statusSet = 400;
    let jsonResponse = null;
    const mockResSelf = {
        status(code) {
            statusSet = code;
            return this;
        },
        json(obj) {
            jsonResponse = obj;
            return this;
        }
    };
    const mockReqSelf = {
        user: { id: 5, username: 'admin' },
        params: { userId: '5' }
    };
    let nextCalled = false;

    preventSelfDeletion(mockReqSelf, mockResSelf, () => { nextCalled = true; });

    assert.equal(nextCalled, false, 'Next should not be called when attempting self-deletion');
    assert.equal(statusSet, 403, 'Should respond with 403 status code');
    assert.deepStrictEqual(jsonResponse, { error: 'Cannot delete the account you are currently logged into' });

    // Case B: User attempts to delete a different user
    nextCalled = false;
    statusSet = 200;
    jsonResponse = null;
    const mockReqOther = {
        user: { id: 5, username: 'admin' },
        params: { userId: '10' }
    };

    preventSelfDeletion(mockReqOther, mockResSelf, () => { nextCalled = true; });
    assert.equal(nextCalled, true, 'Next should be called when deleting a different user');
});

test('fsRetry utility retries on Windows lock errors (EPERM, EBUSY) and eventually succeeds', async (t) => {
    let attempts = 0;
    const testOp = async () => {
        attempts++;
        if (attempts < 3) {
            const err = new Error('Permission denied');
            err.code = 'EPERM';
            throw err;
        }
        return 'success';
    };

    const result = await retryOperation(testOp, { retries: 5, delay: 5, label: 'test-retry' });
    assert.equal(attempts, 3, 'Should attempt 3 times before succeeding');
    assert.equal(result, 'success', 'Should return the successful value');
});

test('fsRetry utility eventually throws after maximum retries if error persists', async (t) => {
    let attempts = 0;
    const testOp = async () => {
        attempts++;
        const err = new Error('Device busy');
        err.code = 'EBUSY';
        throw err;
    };

    await assert.rejects(
        async () => {
            await retryOperation(testOp, { retries: 3, delay: 5, label: 'test-fail' });
        },
        /Device busy/
    );
    assert.equal(attempts, 3, 'Should retry exactly 3 times before throwing');
});

test('ProcessManager lifecycle locks block concurrent actions', async (t) => {
    const pm = require('../src/core/processManager');
    const serverId = 'test-server';

    assert.equal(pm.isLocked(serverId), false, 'Server should not be locked initially');
    
    const acquired1 = pm.acquireLock(serverId);
    assert.equal(acquired1, true, 'Should successfully acquire first lock');
    assert.equal(pm.isLocked(serverId), true, 'Server should now be marked locked');

    const acquired2 = pm.acquireLock(serverId);
    assert.equal(acquired2, false, 'Should fail to acquire lock when already locked');

    pm.releaseLock(serverId);
    assert.equal(pm.isLocked(serverId), false, 'Server should be unlocked after release');

    const acquired3 = pm.acquireLock(serverId);
    assert.equal(acquired3, true, 'Should succeed in acquiring lock again after release');
});
