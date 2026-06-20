const magmaResolver = require('../src/core/resolvers/magma');
const https = require('https');

jest.mock('https');

describe('MagmaResolver', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should match minecraft versions correctly', () => {
        expect(magmaResolver._matchMinecraftVersion('1.21.x', '1.21.1')).toBe(true);
        expect(magmaResolver._matchMinecraftVersion('1.21.x', '1.21')).toBe(true);
        expect(magmaResolver._matchMinecraftVersion('1.21.x', '1.20.4')).toBe(false);
        expect(magmaResolver._matchMinecraftVersion('1.20.4', '1.20.4')).toBe(true);
        expect(magmaResolver._matchMinecraftVersion('1.20.4', '1.20.1')).toBe(false);
    });

    test('listVersions should return parsed versions on success', async () => {
        const mockResponse = {
            total: 2,
            versions: [
                { version: '21.1.33-beta', minecraftVersion: '1.21.x' },
                { version: '20.1.20-beta', minecraftVersion: '1.20.4' }
            ]
        };

        const mockReq = {
            on: jest.fn()
        };

        https.get.mockImplementation((url, options, callback) => {
            const mockRes = {
                statusCode: 200,
                on: jest.fn((event, handler) => {
                    if (event === 'data') {
                        handler(JSON.stringify(mockResponse));
                    }
                    if (event === 'end') {
                        handler();
                    }
                })
            };
            callback(mockRes);
            return mockReq;
        });

        const result = await magmaResolver.listVersions();
        expect(result).toEqual({
            source: 'api',
            versions: ['1.21.x', '1.20.4']
        });
    });

    test('listVersions should fallback to defaults on API failure', async () => {
        https.get.mockImplementation((url, options, callback) => {
            const mockRes = {
                statusCode: 522,
                on: jest.fn((event, handler) => {
                    if (event === 'data') handler('Timeout');
                    if (event === 'end') handler();
                })
            };
            callback(mockRes);
            return { on: jest.fn() };
        });

        const result = await magmaResolver.listVersions();
        expect(result.source).toBe('fallback');
        expect(result.versions).toContain('1.21.1');
        expect(result.versions).toContain('1.20.4');
    });

    test('resolveBuild should find the correct build and return proper structure', async () => {
        const mockResponse = {
            total: 2,
            versions: [
                { version: '21.1.33-beta', minecraftVersion: '1.21.x', installerUrl: 'http://example.com/21.1.33.jar' },
                { version: '20.1.20-beta', minecraftVersion: '1.20.4', installerUrl: 'http://example.com/20.1.20.jar' }
            ]
        };

        https.get.mockImplementation((url, options, callback) => {
            const mockRes = {
                statusCode: 200,
                on: jest.fn((event, handler) => {
                    if (event === 'data') {
                        handler(JSON.stringify(mockResponse));
                    }
                    if (event === 'end') {
                        handler();
                    }
                })
            };
            callback(mockRes);
            return { on: jest.fn() };
        });

        const result = await magmaResolver.resolveBuild('1.21.1');
        expect(result).toEqual({
            type: 'magma',
            version: '1.21.1',
            build: '21.1.33-beta',
            url: 'http://example.com/21.1.33.jar',
            provider: 'magma',
            cached: false
        });
    });
});
