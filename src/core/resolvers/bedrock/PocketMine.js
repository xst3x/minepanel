/**
 * PocketMine.js  —  PocketMine-MP  (pmmp/PocketMine-MP)
 * ────────────────────────────────────────────────────────
 * Source:  GitHub releases.atom feed (no auth, no rate limit)
 * Cache:   cache/resolvers/pocketmine.json  (TTL 45 min)
 */

'use strict';

const { fetchLatestVersion, normaliseRelease } = require('./github');
const { makeCache } = require('./cache');

const NAME  = 'PocketMine-MP';
const OWNER = 'pmmp';
const REPO  = 'PocketMine-MP';
const cache = makeCache('pocketmine', 45 * 60 * 1000);

class PocketMineResolver {
    async getLatestRelease() {
        const cached = cache.read();
        if (cache.isFresh(cached)) return cached.data;

        try {
            const version = await fetchLatestVersion(OWNER, REPO);
            const data = normaliseRelease({ tag_name: version }, { name: NAME });
            console.log(`[PocketMine] → ${data.version}`);
            cache.write({ data });
            return data;
        } catch (e) {
            console.warn(`[PocketMine] Fetch failed: ${e.message}`);
            if (cached?.data) return cached.data;
            throw e;
        }
    }
}

module.exports = new PocketMineResolver();
