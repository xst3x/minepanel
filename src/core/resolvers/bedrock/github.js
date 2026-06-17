/**
 * github.js  —  shared GitHub helpers for all Bedrock-software resolvers
 * ────────────────────────────────────────────────────────────────────────
 * PRIMARY strategy  : GitHub releases.atom feed  (no auth, no rate limit)
 * FALLBACK strategy : /releases/latest redirect  (no auth, no rate limit)
 *
 * Both approaches avoid the unauthenticated REST API (60 req/hr limit)
 * that was causing all four GitHub-based resolvers to fail after a cold
 * start or server restart.
 */

'use strict';

const https = require('https');

// ─── Low-level HTTP helpers ───────────────────────────────────────────────────

/** Fetch raw text from a URL, following one redirect. */
function fetchText(url, redirectsLeft = 3) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'MinePanel/1.0 (github.com/minepanel; version-resolver)',
                'Accept': '*/*',
            },
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
 * Follow the /releases/latest redirect to get the tag name — no API quota used.
 * Returns the tag string (e.g. 'v5.43.2') or null if no redirect / no releases.
 */
function fetchLatestTagViaRedirect(owner, repo) {
    return new Promise((resolve) => {
        const url = `https://github.com/${owner}/${repo}/releases/latest`;
        const req = https.get(url, {
            headers: { 'User-Agent': 'MinePanel/1.0' },
        }, (res) => {
            res.resume();
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                const m = res.headers.location.match(/\/releases\/tag\/(.+)$/);
                return resolve(m ? decodeURIComponent(m[1]) : null);
            }
            resolve(null); // no redirect = no releases
        });
        req.on('error', () => resolve(null));
        req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    });
}

/**
 * Fetch the Atom feed for a repo's releases and extract the latest stable
 * version string.  The Atom feed is a public, unauthenticated, uncached
 * endpoint that GitHub never rate-limits.
 *
 * Title patterns we handle:
 *   "PocketMine-MP 5.43.2"   → "5.43.2"
 *   "PowerNukkitX 2.0.0"     → "2.0.0"
 *   "v1.2.3"                 → "1.2.3"
 *   "Release 1.2.3"          → "1.2.3"
 *
 * Titles we skip:
 *   "Dev Build (nightly)", "Latest Snapshot", "snapshot", "beta", "alpha"
 */
async function fetchLatestVersionViaAtom(owner, repo) {
    const feedUrl = `https://github.com/${owner}/${repo}/releases.atom`;
    const xml = await fetchText(feedUrl);

    // Extract all <title> values except the feed-level one
    const titles = [];
    const re = /<entry>[\s\S]*?<title[^>]*>([^<]+)<\/title>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
        titles.push(m[1].trim());
    }

    for (const title of titles) {
        // Skip non-release entries
        if (/dev\s*build|nightly|snapshot|alpha|beta|rc\b|preview|pre[-\s]?release/i.test(title)) continue;
        // Extract the first version-like number (e.g. "5.43.2", "2.0.0", "1.0.0")
        const vMatch = title.match(/\b(\d+\.\d+[\.\d]*)\b/);
        if (vMatch) return vMatch[1];
    }

    return null; // no stable release found in feed
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the latest version string for a GitHub repo.
 * Tries atom feed first, falls back to redirect trick.
 *
 * @returns {Promise<string>}   clean version string, e.g. "5.43.2"
 * @throws  on complete failure (caller should use stale cache / fallback)
 */
async function fetchLatestVersion(owner, repo) {
    // Strategy 1: atom feed (preferred — stable, no rate limit)
    try {
        const ver = await fetchLatestVersionViaAtom(owner, repo);
        if (ver) return ver;
    } catch (e) {
        // fall through
    }

    // Strategy 2: redirect trick
    const tag = await fetchLatestTagViaRedirect(owner, repo);
    if (tag) {
        // Strip leading 'v' and return
        const clean = tag.replace(/^v/i, '').trim();
        // Reject obviously bad tags like 'snapshot', 'nightly', etc.
        if (clean && !/snapshot|nightly|alpha|beta/i.test(clean)) return clean;
    }

    throw new Error(`Could not determine latest version for ${owner}/${repo}`);
}

/**
 * Legacy helper kept for API compatibility — wraps fetchLatestVersion.
 * Returns the same shape as the original fetchLatestRelease.
 */
async function fetchLatestRelease(owner, repo) {
    const version = await fetchLatestVersion(owner, repo);
    return { tag_name: version, assets: [], zipball_url: null };
}

/**
 * Normalise a raw release (or our synthetic one) into the standard shape.
 * Kept for backwards compatibility with existing resolver files.
 */
function normaliseRelease(release, { name }) {
    const version = (release.tag_name || '').replace(/^v/i, '').trim() || release.tag_name;
    return { name, version, downloadUrl: null, source: 'github' };
}

module.exports = { fetchLatestRelease, fetchLatestVersion, normaliseRelease };
