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

jest.mock('../src/core/versionManager', () => {
    return {
        init: jest.fn()
    };
});

const request = require('supertest');
const { app } = require('../src/index');
const { initDb } = require('../src/db/database');
const { E, AppError, sendError, MESSAGES } = require('../src/core/errors');

beforeAll(async () => {
    await initDb();
});

afterAll(async () => {
    // Wait for any background initialization in index.js to settle safely
    await new Promise(resolve => setTimeout(resolve, 1500));
});

describe('Centralized Error Architecture Tests (Stage 2)', () => {
    test('AppError toResponse() should conform to Standard Stage 2 format', () => {
        const errorDetail = 'Invalid parameter X provided';
        const error = new AppError(E.VALIDATION_ERROR, 400, errorDetail);

        expect(error.code).toBe(E.VALIDATION_ERROR);
        expect(error.status).toBe(400);
        expect(error.detail).toBe(errorDetail);

        const responseBody = error.toResponse();
        expect(responseBody).toHaveProperty('code', E.VALIDATION_ERROR);
        expect(responseBody).toHaveProperty('error', MESSAGES[E.VALIDATION_ERROR]);
        expect(responseBody).toHaveProperty('detail', errorDetail);
        expect(responseBody).toHaveProperty('details', errorDetail);
        expect(responseBody).toHaveProperty('timestamp');
        
        // Ensure timestamp is a valid ISO string
        expect(new Date(responseBody.timestamp).getTime()).not.toBeNaN();
    });

    test('sendError helper should send correct status and structured body', () => {
        const mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };

        sendError(mockRes, E.SERVER_NOT_FOUND, 404, 'Server #100 does not exist');

        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalled();

        const jsonArg = mockRes.json.mock.calls[0][0];
        expect(jsonArg).toHaveProperty('code', E.SERVER_NOT_FOUND);
        expect(jsonArg).toHaveProperty('error', MESSAGES[E.SERVER_NOT_FOUND]);
        expect(jsonArg).toHaveProperty('details', 'Server #100 does not exist');
        expect(jsonArg).toHaveProperty('timestamp');
    });

    test('New error codes and messages exist in Stage 2 E mapping', () => {
        expect(E.BOT_NOT_FOUND).toBe('BOT_NOT_FOUND');
        expect(MESSAGES[E.BOT_NOT_FOUND]).toBe('Discord bot not found.');

        expect(E.THRESHOLD_VALIDATION_FAILED).toBe('THRESHOLD_VALIDATION_FAILED');
        expect(MESSAGES[E.THRESHOLD_VALIDATION_FAILED]).toBe('Threshold validation failed.');
    });

    test('Global error handler fallback formats unexpected errors with timestamp and code', () => {
        // Find the global error handler middleware (arity of 4) in Express stack
        const layer = app._router.stack.find(l => l.handle && l.handle.length === 4);
        expect(layer).toBeDefined();
        const errorHandler = layer.handle;

        const mockReq = {};
        const mockRes = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        errorHandler(new Error('Unexpected fatal db failure'), mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(500);
        const jsonArg = mockRes.json.mock.calls[0][0];
        expect(jsonArg).toHaveProperty('code', 'INTERNAL_ERROR');
        expect(jsonArg).toHaveProperty('error', 'An internal error occurred. Please try again.');
        expect(jsonArg).toHaveProperty('timestamp');
        expect(new Date(jsonArg.timestamp).getTime()).not.toBeNaN();
    });
});
