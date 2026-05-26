const https = require('https');
const http = require('http');

/**
 * Fetch JSON from a URL with redirect following and proper error handling.
 */
const fetchJson = (url, maxRedirects = 5) => {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

        const client = url.startsWith('https') ? https : http;
        client.get(url, { headers: { 'User-Agent': 'MinePanel/1.0', 'Accept': 'application/json' } }, (res) => {
            // Follow redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Invalid JSON response from ${url}: ${data.substring(0, 100)}`));
                    }
                } else {
                    reject(new Error(`HTTP ${res.statusCode} from ${url}: ${data.substring(0, 200)}`));
                }
            });
        }).on('error', (err) => {
            reject(new Error(`Network error fetching ${url}: ${err.message}`));
        });
    });
};

class MagmaResolver {
    constructor() {
        // Magma has historically unstable APIs. We try multiple known endpoints.
        this.endpoints = [
            'https://api.magmafoundation.org/api/v2/allVersions',
            'https://api.magmafoundation.org/api/v1/projects/magma'
        ];
    }

    async listVersions() {
        let lastError;
        
        // Try v2 API first
        try {
            const data = await fetchJson('https://api.magmafoundation.org/api/v2/allVersions');
            if (Array.isArray(data)) {
                return data.reverse();
            }
            if (data && data.versions) {
                return data.versions.reverse();
            }
        } catch (e) {
            lastError = e;
            console.warn('[MagmaResolver] v2 API failed:', e.message);
        }

        // Fallback to v1 API
        try {
            const data = await fetchJson('https://api.magmafoundation.org/api/v1/projects/magma/versions');
            if (data && data.versions) return data.versions.reverse();
        } catch (e) {
            lastError = e;
            console.warn('[MagmaResolver] v1 API failed:', e.message);
        }

        // If all fail, return common known versions
        console.warn('[MagmaResolver] All APIs failed. Returning fallback version list.');
        return ['1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.3', '1.18.2', '1.12.2'];
    }

    async resolveBuild(version, buildId = 'latest') {
        let lastError;
        
        // Try v2 endpoint
        try {
            const result = await this._resolveV2(version, buildId);
            if (result) return result;
        } catch (e) {
            lastError = e;
            console.warn(`[MagmaResolver] v2 resolve failed for ${version}:`, e.message);
        }

        // Try v1 endpoint
        try {
            const result = await this._resolveV1(version, buildId);
            if (result) return result;
        } catch (e) {
            lastError = e;
            console.warn(`[MagmaResolver] v1 resolve failed for ${version}:`, e.message);
        }

        throw new Error(`Magma Resolver: Could not resolve build for version ${version}. The Magma API may be temporarily unavailable. Last error: ${lastError?.message || 'unknown'}`);
    }

    async _resolveV2(version, buildId) {
        const url = `https://api.magmafoundation.org/api/v2/allVersions/${version}`;
        const data = await fetchJson(url);
        
        let downloadUrl;
        if (data && data.downloadUrl) {
            downloadUrl = data.downloadUrl;
        } else if (data && data.url) {
            downloadUrl = data.url;
        } else if (data && Array.isArray(data) && data.length > 0) {
            // Array of builds
            const build = data[data.length - 1]; // latest
            downloadUrl = build.downloadUrl || build.url;
        }

        if (!downloadUrl) return null;

        return {
            type: 'magma',
            version: version,
            build: buildId,
            url: downloadUrl,
            provider: 'magma',
            cached: false
        };
    }

    async _resolveV1(version, buildId) {
        const versionData = await fetchJson(`https://api.magmafoundation.org/api/v1/projects/magma/versions/${version}`);
        
        if (!versionData || !versionData.builds || versionData.builds.length === 0) {
            return null;
        }

        let build = buildId;
        if (build === 'latest') {
            build = versionData.builds[versionData.builds.length - 1];
        }

        let downloadUrl;
        try {
            const buildData = await fetchJson(`https://api.magmafoundation.org/api/v1/projects/magma/versions/${version}/builds/${build}`);
            downloadUrl = buildData.downloadLink || buildData.url;
        } catch (e) {
            // Construct download URL from convention
            downloadUrl = `https://api.magmafoundation.org/api/v1/projects/magma/versions/${version}/builds/${build}/download`;
        }

        if (!downloadUrl) return null;

        return {
            type: 'magma',
            version: version,
            build: build.toString(),
            url: downloadUrl,
            provider: 'magma',
            cached: false
        };
    }
}

module.exports = new MagmaResolver();
