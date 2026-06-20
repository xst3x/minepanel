const https = require('https');
const http = require('http');

/**
 * Fetch JSON from a URL with redirect following and proper error handling.
 */
const fetchJson = (url, maxRedirects = 5) => {
    return new Promise((resolve, reject) => {
        if (maxRedirects <= 0) return reject(new Error('Too many redirects'));

        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { 
            headers: { 'User-Agent': 'MinePanel/1.0', 'Accept': 'application/json' },
            timeout: 8000
        }, (res) => {
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
        });

        req.on('error', (err) => {
            reject(new Error(`Network error fetching ${url}: ${err.message}`));
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Timeout fetching ${url}`));
        });
    });
};

class MagmaResolver {
    constructor() {
        this.baseApiUrl = 'https://api.magmafoundation.org';
    }

    _matchMinecraftVersion(apiMcVersion, requestedMcVersion) {
        if (!apiMcVersion || !requestedMcVersion) return false;
        if (apiMcVersion === requestedMcVersion) return true;
        
        // Handle '1.21.x' matching '1.21.1', '1.21', etc.
        if (apiMcVersion.endsWith('.x')) {
            const prefix = apiMcVersion.slice(0, -2);
            return requestedMcVersion === prefix || requestedMcVersion.startsWith(prefix + '.');
        }
        
        return false;
    }

    async listVersions() {
        try {
            const data = await fetchJson(`${this.baseApiUrl}/api/versions?limit=0`);
            if (data && Array.isArray(data.versions)) {
                // Extract unique minecraft versions, clean up falsy/undefined values
                const mcVersions = data.versions
                    .map(v => v.minecraftVersion)
                    .filter(Boolean);
                
                if (mcVersions.length > 0) {
                    return {
                        source: 'api',
                        versions: [...new Set(mcVersions)]
                    };
                }
            }
        } catch (e) {
            console.warn('[MagmaResolver] API request failed. Returning fallback versions. Error:', e.message);
        }

        // Return fallback version list if API fails
        return {
            source: 'fallback',
            versions: ['1.21.1', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.3', '1.18.2', '1.12.2']
        };
    }

    async resolveBuild(version, buildId = 'latest') {
        try {
            // Handle 'latest' shortcut
            if (version === 'latest') {
                const latest = await fetchJson(`${this.baseApiUrl}/api/versions/latest`);
                if (latest && latest.version) {
                    return {
                        type: 'magma',
                        version: latest.minecraftVersion || latest.version,
                        build: latest.version,
                        url: latest.installerUrl || `${this.baseApiUrl}/api/versions/${latest.version}/download?type=installer`,
                        provider: 'magma',
                        cached: false
                    };
                }
            }

            // Fetch catalog
            const data = await fetchJson(`${this.baseApiUrl}/api/versions?limit=0`);
            if (!data || !Array.isArray(data.versions)) {
                throw new Error('Invalid response format from Magma API');
            }

            let match;
            
            // 1. Try to match by Magma version string directly (e.g. if version or buildId is a specific Magma version like '21.1.33-beta')
            if (buildId !== 'latest') {
                match = data.versions.find(v => v.version === buildId);
            }
            if (!match) {
                match = data.versions.find(v => v.version === version);
            }

            // 2. Try to match by Minecraft version prefix/glob (e.g. '1.21.x' matching '1.21.1')
            if (!match) {
                match = data.versions.find(v => this._matchMinecraftVersion(v.minecraftVersion, version));
            }

            if (!match) {
                throw new Error(`No Magma build found matching Minecraft version ${version}`);
            }

            return {
                type: 'magma',
                version: version,
                build: match.version,
                url: match.installerUrl || `${this.baseApiUrl}/api/versions/${match.version}/download?type=installer`,
                provider: 'magma',
                cached: false
            };
        } catch (error) {
            console.warn(`[MagmaResolver] Failed to resolve build for version ${version}:`, error.message);
            throw new Error(`Magma Resolver: Could not resolve build for version ${version}. The Magma API may be temporarily unavailable. Error: ${error.message}`);
        }
    }
}

module.exports = new MagmaResolver();
