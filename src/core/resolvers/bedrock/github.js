'use strict';

const https = require('https');

// ─── HTTP helper ─────────────────────────────────────────────

function fetchText(url, redirectsLeft = 3) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'MinePanel/1.0',
                'Accept': '*/*'
            }
        }, (res) => {

            // follow redirects
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
                res.resume();
                return fetchText(res.headers.location, redirectsLeft - 1)
                    .then(resolve)
                    .catch(reject);
            }

            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }

            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => resolve(body));
        });

        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

// ─── Atom feed (stable versions, no rate limit) ───────────────

async function fetchLatestVersionViaAtom(owner, repo) {
    const xml = await fetchText(`https://github.com/${owner}/${repo}/releases.atom`);

    const titles = [];
    const re = /<entry>[\s\S]*?<title[^>]*>([^<]+)<\/title>/g;

    let m;
    while ((m = re.exec(xml)) !== null) {
        titles.push(m[1].trim());
    }

    for (const title of titles) {
        if (/nightly|snapshot|alpha|beta|rc|preview|pre[-\s]?release/i.test(title)) continue;

        const v = title.match(/\b(\d+\.\d+[\.\d]*)\b/);
        if (v) return v[1];
    }

    return null;
}

// ─── redirect fallback ────────────────────────────────────────

function fetchLatestTagViaRedirect(owner, repo) {
    return new Promise((resolve) => {
        const req = https.get(`https://github.com/${owner}/${repo}/releases/latest`, {
            headers: { 'User-Agent': 'MinePanel/1.0' }
        }, (res) => {
            res.resume();

            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
                const m = res.headers.location.match(/\/releases\/tag\/(.+)$/);
                return resolve(m ? decodeURIComponent(m[1]) : null);
            }

            resolve(null);
        });

        req.on('error', () => resolve(null));
        req.setTimeout(10000, () => {
            req.destroy();
            resolve(null);
        });
    });
}

// ─── PUBLIC API ──────────────────────────────────────────────

async function fetchLatestVersion(owner, repo) {
    try {
        const atom = await fetchLatestVersionViaAtom(owner, repo);
        if (atom) return atom;
    } catch (_) {}

    const tag = await fetchLatestTagViaRedirect(owner, repo);
    if (tag) {
        const clean = tag.replace(/^v/i, '');
        if (!/snapshot|nightly|alpha|beta/i.test(clean)) return clean;
    }

    throw new Error(`Could not determine latest version for ${owner}/${repo}`);
}

async function fetchLatestRelease(owner, repo) {
    const version = await fetchLatestVersion(owner, repo);

    const xml = await fetchText(`https://github.com/${owner}/${repo}/releases.atom`);

    let downloadUrl = null;

    const assetMatch = xml.match(/https:\/\/github\.com\/[^"']+\.jar/i);
    if (assetMatch) downloadUrl = assetMatch[0];

    return {
        tag_name: version,
        version,
        assets: downloadUrl ? [{ browser_download_url: downloadUrl }] : [],
        zipball_url: null
    };
}

function normaliseRelease(release, { name }) {
    return {
        name,
        version: (release.tag_name || '').replace(/^v/i, ''),
        downloadUrl: release.assets?.[0]?.browser_download_url || null,
        source: 'github'
    };
}

module.exports = {
    fetchLatestRelease,
    fetchLatestVersion,
    normaliseRelease
};