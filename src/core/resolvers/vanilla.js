const fs = require('fs');
const path = require('path');
const https = require('https');

const fetchJson = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('Invalid JSON response'));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        }).on('error', reject);
    });
};

class VanillaResolver {
    constructor() {
        this.manifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest.json';
    }

    async listVersions() {
        const manifest = await fetchJson(this.manifestUrl);
        return manifest.versions
            .filter(v => v.type === 'release' || v.type === 'snapshot')
            .map(v => ({
                version: v.id,
                type: v.type,
                releaseTime: v.releaseTime
            }));
    }

    async resolveBuild(version) {
        const manifest = await fetchJson(this.manifestUrl);
        const versionInfo = manifest.versions.find(v => v.id === version);
        
        if (!versionInfo) {
            throw new Error(`Version ${version} not found in Vanilla manifest`);
        }

        const details = await fetchJson(versionInfo.url);
        
        if (!details.downloads || !details.downloads.server) {
            throw new Error(`Server download not available for Vanilla version ${version}`);
        }

        return {
            type: 'vanilla',
            version: version,
            build: 'release', // Vanilla doesn't have builds like Paper
            url: details.downloads.server.url,
            provider: 'mojang',
            sha1: details.downloads.server.sha1
        };
    }
}

module.exports = new VanillaResolver();
