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
}

module.exports = new PowerNukkitResolver();
