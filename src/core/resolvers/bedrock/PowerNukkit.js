/**
 * PowerNukkit.js  —  PowerNukkitX  (PowerNukkitX/PowerNukkitX)
 * ──────────────────────────────────────────────────────────────
 * Source:  GitHub releases.atom feed (no auth, no rate limit)
 * Cache:   cache/resolvers/powernukkit.json  (TTL 45 min)
 */

'use strict';

const { fetchLatestVersion, normaliseRelease } = require('./github');
const { makeCache } = require('./cache');

const NAME  = 'PowerNukkitX';
const OWNER = 'PowerNukkitX';
const REPO  = 'PowerNukkitX';
const cache = makeCache('powernukkit', 45 * 60 * 1000);

// PowerNukkitX ships from a single rolling 'snapshot' release tag — the
// asset name is fixed, so the download URL never changes between versions.
const SHADED_JAR_URL =
    'https://github.com/PowerNukkitX/PowerNukkitX/releases/download/snapshot/powernukkitx-shaded.jar';

class PowerNukkitResolver {
    async getLatestRelease() {
        const cached = cache.read();
        if (cache.isFresh(cached)) return cached.data;

        try {
            const version = await fetchLatestVersion(OWNER, REPO);
            const data = normaliseRelease({ tag_name: version }, { name: NAME });
            console.log(`[PowerNukkitX] → ${data.version}`);
            cache.write({ data });
            return data;
        } catch (e) {
            console.warn(`[PowerNukkitX] Fetch failed: ${e.message}`);
            if (cached?.data) return cached.data;
            throw e;
        }
    }

    /**
     * Returns: { type, version, build, url, provider, isZip }
     * Matches the same shape Bedrock.js/resolveBuild() returns, so
     * core/resolvers/index.js → downloadJar() can handle it uniformly.
     *
     * Same idea as NukkitX: version string is informational, the actual
     * jar always comes from the fixed 'snapshot' release asset.
     */
    async resolveBuild(version, build = 'latest') {
        let liveVersion = 'snapshot';
        try {
            const latest = await this.getLatestRelease();
            if (latest?.version) liveVersion = latest.version;
        } catch (_) {
            // non-fatal — the shaded jar link doesn't need the version to work
        }

        if (version && version !== liveVersion) {
            console.warn(`[PowerNukkitX] Requested version ${version} differs from latest known (${liveVersion}). PowerNukkitX only ships a rolling 'snapshot' release — using it.`);
        }

        return {
            type: 'powernukkitx',
            version: liveVersion,
            build: 'latest',
            url: SHADED_JAR_URL,
            provider: 'github',
            isZip: false,
        };
    }
}

module.exports = new PowerNukkitResolver();
