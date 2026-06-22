'use strict';

/**
 * spongevanilla.js — SpongeVanilla (SpongePowered)
 * Source: https://dl-api.spongepowered.org/v2/groups/org.spongepowered/artifacts/spongevanilla/versions
 *
 * The Sponge Download API v2 returns a paged list of artifact versions.
 * Each version has associated assets; we look for a universal/server jar.
 */

const https = require('https');

const API_BASE = 'https://dl-api.spongepowered.org/v2';
const GROUP    = 'org.spongepowered';
const ARTIFACT = 'spongevanilla';
const TYPE     = 'spongevanilla';

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

class SpongeVanillaResolver {
    /**
     * Returns a list of recommended (stable) SpongeVanilla versions,
     * e.g. ["1.21.1-12.0.0", "1.20.6-12.0.0", ...] (Minecraft-version prefixed).
     */
    async listVersions() {
        const data = await fetchJson(
            `${API_BASE}/groups/${GROUP}/artifacts/${ARTIFACT}/versions?limit=50`
        );
        const artifacts = data.artifacts || {};
        const entries = Object.entries(artifacts);
        const recommended = entries
            .filter(([, artifact]) => artifact?.recommended === true)
            .map(([version]) => version);

        if (recommended.length > 0) return recommended;

        return entries.map(([version]) => version);
    }

    async getLatestVersion() {
        const versions = await this.listVersions();
        if (!versions.length) throw new Error('No SpongeVanilla versions found');
        return { version: versions[0] };
    }

    async resolveBuild(version, _build = 'latest') {
        const data = await fetchJson(`${API_BASE}/groups/${GROUP}/artifacts/${ARTIFACT}/versions/${version}`);
        const assets = Array.isArray(data.assets) ? data.assets : [];
        const asset = assets.find(a => a.classifier === 'universal' && a.extension === 'jar')
            || assets.find(a => a.classifier === null && a.extension === 'jar')
            || assets.find(a => a.extension === 'jar' && !String(a.classifier || '').includes('sources'));

        if (!asset?.downloadUrl) {
            throw new Error(`No SpongeVanilla server jar found for ${version}`);
        }

        return {
            type:     TYPE,
            version,
            build:    version,
            url:      asset.downloadUrl,
            provider: 'spongepowered',
            isZip:    false,
            sha1:     asset.sha1,
        };
    }
}

module.exports = new SpongeVanillaResolver();
