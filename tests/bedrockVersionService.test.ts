const { BedrockVersionService } = require('../src/core/services/bedrockVersionService');

const upstreamVersions = {
    windows: {
        version4: '1.21.80.3',
        version3: '1.21.80',
        url: 'https://example.test/bin-win/bedrock-server-1.21.80.3.zip',
    },
    linux: {
        version4: '1.21.80.3',
        version3: '1.21.80',
        url: 'https://example.test/bin-linux/bedrock-server-1.21.80.3.zip',
    },
    preview: {
        windows: {
            version4: '1.21.90.25',
            version3: '1.21.90',
            url: 'https://example.test/bin-win-preview/bedrock-server-1.21.90.25.zip',
        },
        linux: {
            version4: '1.21.90.25',
            version3: '1.21.90',
            url: 'https://example.test/bin-linux-preview/bedrock-server-1.21.90.25.zip',
        },
    },
};

describe('BedrockVersionService', () => {
    test('normalizes release and preview versions from minecraft-bedrock-server', async () => {
        const service = new BedrockVersionService({
            fetchLatestVersions: jest.fn().mockResolvedValue(upstreamVersions),
            logger: { warn: jest.fn(), error: jest.fn() },
        });

        const result = await service.getBedrockVersions();

        expect(result.release.windows).toEqual({
            version: '1.21.80.3',
            downloadUrl: 'https://example.test/bin-win/bedrock-server-1.21.80.3.zip',
        });
        expect(result.release.linux).toEqual({
            version: '1.21.80.3',
            downloadUrl: 'https://example.test/bin-linux/bedrock-server-1.21.80.3.zip',
        });
        expect(result.preview.windows).toEqual({
            version: '1.21.90.25-preview',
            downloadUrl: 'https://example.test/bin-win-preview/bedrock-server-1.21.90.25.zip',
        });
        expect(result.preview.linux).toEqual({
            version: '1.21.90.25-preview',
            downloadUrl: 'https://example.test/bin-linux-preview/bedrock-server-1.21.90.25.zip',
        });
        expect(typeof result.lastUpdated).toBe('number');
    });

    test('returns the last successful cache entry when a refresh fails', async () => {
        const fetchLatestVersions = jest
            .fn()
            .mockResolvedValueOnce(upstreamVersions)
            .mockRejectedValueOnce(new Error('network failed'));
        const logger = { warn: jest.fn(), error: jest.fn() };
        const service = new BedrockVersionService({
            cacheTtlMs: 0,
            fetchLatestVersions,
            logger,
        });

        const first = await service.getBedrockVersions();
        const second = await service.getBedrockVersions();

        expect(second).toBe(first);
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('returning cached Bedrock versions'));
        expect(logger.error).not.toHaveBeenCalled();
    });
});
