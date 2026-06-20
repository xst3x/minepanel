'use strict';

const logger = require('../utils/logger');
const { getLatestVersions: fetchMinecraftBedrockVersions } = require('minecraft-bedrock-server');

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15000;
const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:\.\d+)?$/;

function withTimeout(promise, timeoutMs) {
    let timeout;

    const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => {
            reject(new Error(`Bedrock version fetch timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeout) clearTimeout(timeout);
    });
}

function toReleaseVersion(entry, platform) {
    if (!entry) {
        throw new Error(`Missing Bedrock ${platform} release metadata`);
    }

    const version = entry.version4 || entry.version3;

    if (!RELEASE_VERSION_PATTERN.test(version)) {
        throw new Error(`Invalid Bedrock ${platform} release version: ${version}`);
    }

    if (!entry.url) {
        throw new Error(`Missing Bedrock ${platform} release download URL`);
    }

    return {
        version,
        downloadUrl: entry.url,
    };
}

function toPreviewVersion(entry, platform) {
    const release = toReleaseVersion(entry, platform);

    return {
        version: `${release.version}-preview`,
        downloadUrl: release.downloadUrl,
    };
}

class BedrockVersionService {
    constructor(options = {}) {
        this.cache = null;
        this.cacheTtlMs = options.cacheTtlMs ?? SIX_HOURS_MS;
        this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.logger = options.logger || logger;
        this.fetchLatestVersions = options.fetchLatestVersions || fetchMinecraftBedrockVersions;
    }

    async getBedrockVersions() {
        if (this.cache && Date.now() - this.cache.lastUpdated < this.cacheTtlMs) {
            return this.cache;
        }

        try {
            // Reuse minecraft-bedrock-server's Mojang download-links lookup and URL
            // version parsing, then normalize it into MinePanel's API shape.
            const upstream = await withTimeout(this.fetchLatestVersions(), this.requestTimeoutMs);

            const result = {
                release: {
                    windows: toReleaseVersion(upstream.windows, 'windows'),
                    linux: toReleaseVersion(upstream.linux, 'linux'),
                },
                preview: {
                    windows: toPreviewVersion(upstream.preview.windows, 'windows'),
                    linux: toPreviewVersion(upstream.preview.linux, 'linux'),
                },
                lastUpdated: Date.now(),
            };

            this.cache = result;
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);

            if (this.cache) {
                this.logger.warn(`[BedrockVersionService] Fetch failed, returning cached Bedrock versions: ${message}`);
                return this.cache;
            }

            this.logger.error(`[BedrockVersionService] Fetch failed and no cached Bedrock versions are available: ${message}`);
            throw error;
        }
    }
}

const bedrockVersionService = new BedrockVersionService();

async function getBedrockVersions() {
    return bedrockVersionService.getBedrockVersions();
}

module.exports = {
    BedrockVersionService,
    bedrockVersionService,
    getBedrockVersions,
};
