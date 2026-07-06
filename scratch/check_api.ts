const https = require('https');

// Ignore self-signed certificate errors
const agent = new https.Agent({
    rejectUnauthorized: false
});

async function main() {
    // 1. Log in to get token
    const loginData = JSON.stringify({
        username: 'admin',
        password: 'eP56E9Qc*6Kxbbj'
    });

    const token = await new Promise((resolve, reject) => {
        const req = https.request('https://localhost:8081/api/auth/login', {
            method: 'POST',
            agent,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(loginData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data).token);
                } else {
                    reject(new Error(`Login failed: ${res.statusCode} ${data}`));
                }
            });
        });
        req.on('error', reject);
        req.write(loginData);
        req.end();
    });

    console.log('Logged in successfully, token obtained.');

    // 2. Fetch plugins search
    const searchRes = await new Promise((resolve, reject) => {
        https.get('https://localhost:8081/api/servers/22/plugins/modrinth/search?project_type=plugin', {
            agent,
            headers: {
                'Authorization': `Bearer ${token}`
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`Fetch failed: ${res.statusCode} ${data}`));
                }
            });
        }).on('error', reject);
    });

    console.log('Search response hits count:', searchRes.hits?.length);
    if (searchRes.hits && searchRes.hits.length > 0) {
        console.log('First hit:', searchRes.hits[0].title);
    }
}

main().catch(console.error);
