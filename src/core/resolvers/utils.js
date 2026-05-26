const https = require('https');

const fetchJson = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'MinePanel/1.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); }
                    catch (e) { reject(new Error('Invalid JSON response')); }
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        }).on('error', reject);
    });
};

module.exports = { fetchJson };
