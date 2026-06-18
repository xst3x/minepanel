/**
 * PocketMine.js  —  PocketMine-MP  (pmmp/PocketMine-MP)
 * ────────────────────────────────────────────────────────
 * Source:  GitHub releases.atom feed (no auth, no rate limit)
 * Cache:   cache/resolvers/pocketmine.json  (TTL 45 min)
 *
 * PocketMine-MP distributes as a self-contained PHAR (PHP Archive).
 * The release asset is named PocketMine-MP.phar on GitHub.
 */

'use strict';

const https = require('https');
const { fetchLatestVersion, normaliseRelease } = require('./github');
const { makeCache } = require('./cache');

const NAME  = 'PocketMine-MP';
const OWNER = 'pmmp';
const REPO  = 'PocketMine-MP';
const cache = makeCache('pocketmine', 45 * 60 * 1000);

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function fetchText(url, redirectsLeft = 5) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'User-Agent': 'MinePanel/1.0 (github.com/minepanel; version-resolver)' },
        }, (res) => {
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
                res.resume();
                return fetchText(res.headers.location, redirectsLeft - 1).then(resolve).catch(reject);
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            let body = '';
            res.on('data', chunk => (body += chunk));
            res.on('end', () => resolve(body));
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

/**
 * Resolve the GitHub release download URL for a given tag.
 * PocketMine-MP assets follow: PocketMine-MP.phar (primary) or PocketMine-MP-<version>.phar
 */
async function resolveDownloadUrl(version) {
    const tag = `${version}`;
    // Try API endpoint for release assets (no auth needed for public repos, 60/hr limit acceptable here)
    const apiUrl = `https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${tag}`;
    try {
        const body = await fetchText(apiUrl);
        const data = JSON.parse(body);
        if (data.assets && data.assets.length > 0) {
            // Prefer PocketMine-MP.phar
            const asset = data.assets.find(a => /PocketMine-MP.*\.phar$/i.test(a.name));
            if (asset?.browser_download_url) return asset.browser_download_url;
        }
    } catch (_) { /* fall through to constructed URL */ }

    // Fallback: construct the predictable URL GitHub generates for release assets
    return `https://github.com/${OWNER}/${REPO}/releases/download/${tag}/PocketMine-MP.phar`;
}

// ─── Resolver class ───────────────────────────────────────────────────────────

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

    /**
     * Resolves an installable build.
     * Returns the same shape as other resolvers so downloadJar() works unchanged.
     * isPhar: true signals the installer to treat this as a .phar, not a .jar.
     */
    async resolveBuild(version, _build = 'latest') {
        const url = await resolveDownloadUrl(version);
        return {
            type:     'pocketmine',
            version,
            build:    'latest',
            url,
            provider: 'github',
            isPhar:   true,   // signals installer: this is a PHAR, not a JAR/ZIP
            isZip:    false,
        };
    }
}

module.exports = new PocketMineResolver();
