const { initDb, dbGet } = require('../src/db/database');
const path = require('path');
const fs = require('fs');
const https = require('https');

// Helper to fetch from Modrinth just like in pluginRoutes.js
const fetchJson = (url) => new Promise((resolve, reject) => {
    https.get(url, {
        headers: {
            'User-Agent': 'MinePanel/1.0',
            'Accept': 'application/json'
        }
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                resolve(JSON.parse(data));
            } else {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
        });
    }).on('error', reject);
});

const getModrinthLoader = (software) => {
    const map = {
        paper: 'paper', purpur: 'purpur', spigot: 'spigot', bukkit: 'bukkit',
        fabric: 'fabric', quilt: 'quilt', forge: 'forge', neoforge: 'neoforge', magma: 'forge',
    };
    return map[software.toLowerCase()] || null;
};

const isModBased = (software) =>
    ['fabric', 'quilt', 'forge', 'neoforge'].includes(software.toLowerCase());

const buildServerFacets = (server, projectTypeOverride) => {
    const softwareLower = server.software.toLowerCase();
    const loader = getModrinthLoader(softwareLower);
    const facets = [];
    const projectType = projectTypeOverride || (isModBased(softwareLower) ? 'mod' : 'plugin');
    facets.push([`project_type:${projectType}`]);
    if (projectType === 'mod' && loader) {
        facets.push([`categories:${loader}`]);
    }
    facets.push([`versions:${server.version}`]);
    return facets;
};

async function main() {
    await initDb();
    const server = await dbGet('SELECT * FROM servers WHERE id = ?', [22]);
    console.log('Server loaded:', server.name, 'Software:', server.software, 'Version:', server.version);

    // Test plugin search (like when activeTab === 'plugins')
    const facetsPlugins = buildServerFacets(server, 'plugin');
    console.log('Facets for plugins search:', JSON.stringify(facetsPlugins));
    const urlPlugins = `https://api.modrinth.com/v2/search?query=&limit=5&offset=0&index=downloads&facets=${encodeURIComponent(JSON.stringify(facetsPlugins))}`;
    try {
        const data = await fetchJson(urlPlugins);
        console.log('Plugins search returns:', data.hits?.length, 'hits.');
        if (data.hits && data.hits.length > 0) {
            console.log('First hit title:', data.hits[0].title);
        }
    } catch (err) {
        console.error('Plugins search failed:', err.message);
    }

    // Test mod search (like when activeTab === 'mods')
    const facetsMods = buildServerFacets(server, 'mod');
    console.log('Facets for mods search:', JSON.stringify(facetsMods));
    const urlMods = `https://api.modrinth.com/v2/search?query=&limit=5&offset=0&index=downloads&facets=${encodeURIComponent(JSON.stringify(facetsMods))}`;
    try {
        const data = await fetchJson(urlMods);
        console.log('Mods search returns:', data.hits?.length, 'hits.');
        if (data.hits && data.hits.length > 0) {
            console.log('First hit title:', data.hits[0].title);
        }
    } catch (err) {
        console.error('Mods search failed:', err.message);
    }
}

main().catch(console.error);
