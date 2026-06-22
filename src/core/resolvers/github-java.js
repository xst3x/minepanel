'use strict';

/**
 * github-java.js — shared GitHub release helper for Java server software.
 * Similar to bedrock/github.js but returns .jar assets and exposes listVersions().
 */

const https = require('https');

function fetchJson(url, redirectsLeft = 3) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: { 'User-Agent': 'MinePanel/1.0', Accept: 'application/vnd.github+json' }
        }, (res) => {
            if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location && redirectsLeft > 0) {
                res.resume();
                return fetchJson(res.headers.location, redirectsLeft - 1).then(resolve).catch(reject);
            }
            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { reject(new Error('Invalid JSON')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

/**
 * Fetch all GitHub releases for a repo and return an array of version strings.
 * Skips pre-releases and drafts. Strips leading 'v' prefix from tag names.
 */
async function listVersions(owner, repo, options = {}) {
    const releases = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/releases?per_page=50`);
    if (!Array.isArray(releases)) throw new Error('Unexpected GitHub API response');
    return releases
        .filter(r => !r.draft && (options.includePrerelease || !r.prerelease))
        .map(r => r.tag_name.replace(/^v/i, ''));
}

/**
 * Resolve a download URL for a specific release tag.
 * Finds the first .jar asset; falls back to the zipball.
 */
async function resolveDownloadUrl(owner, repo, version) {
    const tag = version.startsWith('v') ? version : `v${version}`;
    let release;
    try {
        release = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tag}`);
    } catch (_) {
        // Try without 'v' prefix
        release = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${version}`);
    }

    const jar = release.assets?.find(a => a.name.endsWith('.jar') && !a.name.toLowerCase().includes('source'));
    if (jar) return jar.browser_download_url;

    // Some projects use a zip
    const zip = release.assets?.find(a => a.name.endsWith('.zip'));
    if (zip) return zip.browser_download_url;

    return release.zipball_url;
}

module.exports = { listVersions, resolveDownloadUrl };
