/**
 * Nukkit.js  —  NukkitX  (CloudburstMC/Nukkit)
 * ───────────────────────────────────────────────
 * Source:  GitHub Releases API
 * Cache:   cache/resolvers/nukkit.json  (TTL 45 min)
 */

'use strict';

const { fetchLatestRelease, normaliseRelease } = require('./github');
const { makeCache } = require('./cache');

const NAME  = 'NukkitX';
const OWNER = 'CloudburstMC';
const REPO  = 'Nukkit';
const ASSET = 'jar';
const cache = makeCache('nukkit', 45 * 60 * 1000);

class NukkitResolver {
    /**
     * Returns: { name, version, downloadUrl, source }
     */
    async getLatestRelease() {
        const cached = cache.read();
        if (cache.isFresh(cached)) return cached.data;

        try {
            const release = await fetchLatestRelease(OWNER, REPO);
            const data    = normaliseRelease(release, { name: NAME, assetExt: ASSET });
            console.log(`[NukkitX] → ${data.version}`);
            cache.write({ data });
            return data;
        } catch (e) {
            console.warn(`[NukkitX] Fetch failed: ${e.message}`);
            if (cached?.data) return cached.data;
            throw e;
        }
    }
}

module.exports = new NukkitResolver();
