import { getLatestVersions as fetchMinecraftBedrockVersions } from 'minecraft-bedrock-server';

type UpstreamPlatformVersion = {
    version4: string;
    version3: string;
    url: string;
};

type BedrockPlatformVersion = {
    version: string;
    downloadUrl: string;
};

export type BedrockVersions = {
    release: {
        windows: BedrockPlatformVersion;
        linux: BedrockPlatformVersion;
    };
    preview: {
        windows: BedrockPlatformVersion;
        linux: BedrockPlatformVersion;
    };
    lastUpdated: number;
};

type BedrockVersionServiceOptions = {
    cacheTtlMs?: number;
    requestTimeoutMs?: number;
    logger?: Pick<Console, 'warn' | 'error'>;
    fetchLatestVersions?: typeof fetchMinecraftBedrockVersions;
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15000;
const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:\.\d+)?$/;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
            reject(new Error(`Bedrock version fetch timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeout) clearTimeout(timeout);
    });
}

function toReleaseVersion(entry: UpstreamPlatformVersion, platform: 'windows' | 'linux'): BedrockPlatformVersion {
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

function toPreviewVersion(entry: UpstreamPlatformVersion, platform: 'windows' | 'linux'): BedrockPlatformVersion {
    const release = toReleaseVersion(entry, platform);

    return {
        version: `${release.version}-preview`,
        downloadUrl: release.downloadUrl,
    };
}

export class BedrockVersionService {
    private cache: BedrockVersions | null = null;
    private readonly cacheTtlMs: number;
    private readonly requestTimeoutMs: number;
    private readonly logger: Pick<Console, 'warn' | 'error'>;
    private readonly fetchLatestVersions: typeof fetchMinecraftBedrockVersions;

    constructor(options: BedrockVersionServiceOptions = {}) {
        this.cacheTtlMs = options.cacheTtlMs ?? SIX_HOURS_MS;
        this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.logger = options.logger ?? console;
        this.fetchLatestVersions = options.fetchLatestVersions ?? fetchMinecraftBedrockVersions;
    }

    async getBedrockVersions(): Promise<BedrockVersions> {
        if (this.cache && Date.now() - this.cache.lastUpdated < this.cacheTtlMs) {
            return this.cache;
        }

        try {
            // Reuse minecraft-bedrock-server's Mojang download-links lookup and URL
            // version parsing, then normalize it into MinePanel's API shape.
            const upstream = await withTimeout(this.fetchLatestVersions(), this.requestTimeoutMs);

            const result: BedrockVersions = {
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

export async function getBedrockVersions(): Promise<BedrockVersions> {
    return bedrockVersionService.getBedrockVersions();
}

export default bedrockVersionService;
