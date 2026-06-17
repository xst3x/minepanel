/**
 * Waterdog.js  —  WaterdogPE  (WaterdogPE/WaterDog)
 * ─────────────────────────────────────────────────────
 * Source:  GitHub Releases API
 * Cache:   cache/resolvers/waterdog.json  (TTL 45 min)
 */

'use strict';

const { fetchLatestRelease, normaliseRelease } = require('./github');
const { makeCache } = require('./cache');

const NAME  = 'WaterdogPE';
const OWNER = 'WaterdogPE';
const REPO  = 'WaterDog';
const ASSET = 'jar';
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
            const data    = normaliseRelease(release, { name: NAME, assetExt: ASSET });
            console.log(`[WaterdogPE] → ${data.version}`);
            cache.write({ data });
            return data;
        } catch (e) {
            console.warn(`[WaterdogPE] Fetch failed: ${e.message}`);
            if (cached?.data) return cached.data;
            throw e;
        }
    }
}

module.exports = new WaterdogResolver();
