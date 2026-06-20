/**
 * Waterdog.js  —  WaterdogPE  (WaterdogPE/WaterdogPE)
 * ──────────────────────────────────────────────────────
 * Source:  GitHub releases.atom feed (no auth, no rate limit)
 * Cache:   cache/resolvers/waterdog.json  (TTL 45 min)
 */

'use strict';

const { fetchLatestRelease, normaliseRelease } = require('./github');
const { makeCache } = require('./cache');

const NAME  = 'WaterdogPE';
const OWNER = 'WaterdogPE';
const REPO  = 'WaterdogPE';
const cache = makeCache('waterdog', 45 * 60 * 1000);

class WaterdogResolver {
    /**
     * Returns: { name, version, downloadUrl, source }
     */
    async getLatestRelease() {
        const cached = cache.read();
        if (cache.isFresh(cached)) return cached.data;

        try {
            const release = await fetchLatestRelease(OWNER, REPO);
            const data    = normaliseRelease(release, { name: NAME });
            console.log(`[WaterdogPE] → ${data.version}`);
            cache.write({ data });
            return data;
        } catch (e) {
            console.warn(`[WaterdogPE] Fetch failed: ${e.message}`);
            if (cached?.data) return cached.data;
            throw e;
        }
    }

    /**
     * Returns: { type, version, build, url, provider, isZip }
     * Matches the same shape Bedrock.js/resolveBuild() returns, so
     * core/resolvers/index.js → downloadJar() can handle it uniformly.
     */
    async resolveBuild(version, build = 'latest') {
        const latest = await this.getLatestRelease();
        const liveVersion = latest?.version || version || 'latest';

        if (!latest?.downloadUrl) {
            throw new Error('WaterdogPE: no downloadable jar asset found in the latest release.');
        }

        if (version && version !== liveVersion) {
            console.warn(`[WaterdogPE] Requested version ${version} differs from latest known (${liveVersion}). Using latest.`);
        }

        return {
            type: 'waterdogpe',
            version: liveVersion,
            build: 'latest',
            url: latest.downloadUrl,
            provider: 'github',
            isZip: false,
        };
    }
}

module.exports = new WaterdogResolver();
