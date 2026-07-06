const https = require('https');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const agent = new https.Agent({
    rejectUnauthorized: false
});

async function main() {
    const secret = process.env.JWT_SECRET;
    console.log('Using secret key:', secret);
    
    // Generate valid admin token
    const token = jwt.sign({
        id: 1,
        username: 'xst3x',
        role: 'admin'
    }, secret, { expiresIn: '1h' });

    console.log('Generated token successfully.');

    // Fetch plugins search
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
