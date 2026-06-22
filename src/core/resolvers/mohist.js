'use strict';

/**
 * mohist.js — Mohist (MohistMC), a Forge+Bukkit/Spigot hybrid.
 * Source: https://mohistmc.com/api/v2/projects/mohist
 *
 * API returns:
 *   GET /projects/mohist           → { versions: ["1.20.1", "1.19.2", ...] }
 *   GET /projects/mohist/{version} → { builds: [{number, url, ...}, ...] }
 */

const https = require('https');

const BASE = 'https://mohistmc.com/api/v2/projects/mohist';
const TYPE = 'mohist';

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'MinePanel/1.0' } }, (res) => {
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

class MohistResolver {
    async listVersions() {
        const data = await fetchJson(BASE);
        if (!data.versions || !Array.isArray(data.versions)) {
            throw new Error('Unexpected Mohist API response');
        }
        const sorted = data.versions.sort(compareVersions);
        const withBuilds = [];

        for (const version of sorted) {
            try {
                const buildData = await fetchJson(`${BASE}/${version}/builds`);
                if (Array.isArray(buildData.builds) && buildData.builds.length > 0) {
                    withBuilds.push(version);
                }
            } catch (_) {
                // Keep the version list installable; versions with missing build
                // metadata are skipped instead of failing the whole provider.
            }
        }

        return withBuilds;
    }

    async getLatestVersion() {
        const versions = await this.listVersions();
        if (!versions.length) throw new Error('No Mohist versions found');
        return { version: versions[0] };
    }

    async resolveBuild(version, _build = 'latest') {
        const data = await fetchJson(`${BASE}/${version}/builds`);
        const builds = data.builds;
        if (!Array.isArray(builds) || !builds.length) {
            throw new Error(`No Mohist builds found for ${version}`);
        }
        // builds are returned newest-first
        const build = builds[0];
        const url = build.url || build.download_url;
        if (!url) throw new Error(`No download URL in Mohist build for ${version}`);
        return {
            type:     TYPE,
            version,
            build:    String(build.number || build.id || 'latest'),
            url,
            provider: 'mohistmc',
            isZip:    false,
            sha256:   build.fileSha256,
        };
    }
}

function compareVersions(a, b) {
    const pa = String(a).split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b).split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pb[i] || 0) - (pa[i] || 0);
        if (diff !== 0) return diff;
    }
    return String(b).localeCompare(String(a));
}

module.exports = new MohistResolver();
