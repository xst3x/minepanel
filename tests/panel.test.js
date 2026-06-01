require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const path = require('path');

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

describe('Panel Core Tests', () => {
    test('Self-deletion protection middleware blocks active session user deletion', async () => {
        // Locate the preventSelfDeletion middleware in userRoutes route stack
        const deleteRoute = userRoutes.stack.find(
            (layer) => layer.route && layer.route.path === '/:userId/delete'
        );
        expect(deleteRoute).toBeDefined();
        
        // The stack contains: [authenticateToken, preventSelfDeletion, checkGlobalPermission, handler]
        const preventSelfDeletion = deleteRoute.route.stack[1].handle;
        expect(preventSelfDeletion.name).toBe('preventSelfDeletion');

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

        expect(nextCalled).toBe(false);
        expect(statusSet).toBe(403);
        expect(jsonResponse).toMatchObject({ code: 'USER_SELF_DELETE', error: 'You cannot delete your own account.' });

        // Case B: User attempts to delete a different user
        nextCalled = false;
        statusSet = 200;
        jsonResponse = null;
        const mockReqOther = {
            user: { id: 5, username: 'admin' },
            params: { userId: '10' }
        };

        preventSelfDeletion(mockReqOther, mockResSelf, () => { nextCalled = true; });
        expect(nextCalled).toBe(true);
    });

    test('fsRetry utility retries on Windows lock errors (EPERM, EBUSY) and eventually succeeds', async () => {
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
        expect(attempts).toBe(3);
        expect(result).toBe('success');
    });

    test('fsRetry utility eventually throws after maximum retries if error persists', async () => {
        let attempts = 0;
        const testOp = async () => {
            attempts++;
            const err = new Error('Device busy');
            err.code = 'EBUSY';
            throw err;
        };

        await expect(
            retryOperation(testOp, { retries: 3, delay: 5, label: 'test-fail' })
        ).rejects.toThrow(/Device busy/);
        expect(attempts).toBe(3);
    });

    test('ProcessManager lifecycle locks block concurrent actions', async () => {
        const pm = require('../src/core/processManager');
        const serverId = 'test-server';

        expect(pm.isLocked(serverId)).toBe(false);
        
        const acquired1 = pm.acquireLock(serverId);
        expect(acquired1).toBe(true);
        expect(pm.isLocked(serverId)).toBe(true);

        const acquired2 = pm.acquireLock(serverId);
        expect(acquired2).toBe(false);

        pm.releaseLock(serverId);
        expect(pm.isLocked(serverId)).toBe(false);

        const acquired3 = pm.acquireLock(serverId);
        expect(acquired3).toBe(true);
    });
});
