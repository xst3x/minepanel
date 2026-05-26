const https = require('https');
const { fetchJson } = require('./utils');

class QuiltResolver {
    constructor() {
        this.id = 'quilt';
    }

    async listVersions() {
        const gameData = await fetchJson('https://meta.quiltmc.org/v3/versions/game');
        return gameData.filter(v => v.stable).map(v => v.version);
    }

    async resolveBuild(version, build = 'latest') {
        try {
            // Quilt meta API provides a single endpoint for game versions and loader versions
            const gameData = await fetchJson('https://meta.quiltmc.org/v3/versions/game');
            const validGame = gameData.find(v => v.version === version);
            
            if (!validGame) throw new Error(`Quilt does not support Minecraft version ${version}`);

            const loaderData = await fetchJson('https://meta.quiltmc.org/v3/versions/loader');
            if (loaderData.length === 0) throw new Error('No Quilt loaders found');
            
            const loaderVersion = loaderData[0].version; // Get latest loader

            // Format: https://meta.quiltmc.org/v3/versions/loader/{game_version}/{loader_version}/server/jar
            const downloadUrl = `https://meta.quiltmc.org/v3/versions/loader/${version}/${loaderVersion}/server/jar`;

            return {
                type: 'quilt',
                version: version,
                build: loaderVersion,
                url: downloadUrl,
                provider: 'quiltmc'
            };
        } catch (err) {
            throw new Error(`Quilt Resolver failed: ${err.message}`);
        }
    }
}

module.exports = new QuiltResolver();
