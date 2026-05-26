const https = require('https');

const fetchJson = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'MinePanel/1.0' } }, (res) => {
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

class PurpurResolver {
    constructor() {
        this.baseUrl = 'https://api.purpurmc.org/v2/purpur';
    }

    async listVersions() {
        const data = await fetchJson(this.baseUrl);
        return data.versions.reverse(); // Newest first
    }

    async resolveBuild(version, buildId = 'latest') {
        const versionData = await fetchJson(`${this.baseUrl}/${version}`);
        
        let build = buildId;
        if (build === 'latest') {
            build = versionData.builds.latest;
        }

        const downloadUrl = `${this.baseUrl}/${version}/${build}/download`;

        return {
            type: 'purpur',
            version: version,
            build: build.toString(),
            url: downloadUrl,
            provider: 'purpur',
            cached: false
        };
    }
}

module.exports = PurpurResolver;
