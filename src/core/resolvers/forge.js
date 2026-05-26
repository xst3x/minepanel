const https = require('https');
const { fetchJson } = require('./utils');

class ForgeResolver {
    constructor() {
        this.id = 'forge';
    }

    async listVersions() {
        try {
            const promotionsUrl = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
            const promos = await fetchJson(promotionsUrl);
            const mcVersions = new Set();
            if (promos && promos.promos) {
                for (const key of Object.keys(promos.promos)) {
                    const mcVer = key.replace(/-(recommended|latest)$/, '');
                    // Basic sanity check for version format (e.g. 1.20.1 or 1.5)
                    if (/^\d+\.\d+(\.\d+)?$/.test(mcVer)) {
                        mcVersions.add(mcVer);
                    }
                }
            }
            return Array.from(mcVersions);
        } catch (e) {
            console.error('[ForgeResolver] listVersions failed:', e.message);
            return [];
        }
    }

    async resolveBuild(version, build = 'latest') {
        try {
            // Forge doesn't have a clean JSON API for all versions in a single endpoint.
            // Modern Forge provides a promotions JSON which tracks recommended/latest versions.
            const promotionsUrl = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
            const promos = await fetchJson(promotionsUrl);

            // Check if there is a recommended or latest build for this exact MC version
            const recommended = promos.promos[`${version}-recommended`];
            const latest = promos.promos[`${version}-latest`];
            
            const forgeVersion = recommended || latest;

            if (!forgeVersion) {
                throw new Error(`Forge does not have a promoted build for Minecraft version ${version}. You may need to manually specify the Forge version string.`);
            }

            const fullVersionString = `${version}-${forgeVersion}`;
            
            // Forge maven structure: net/minecraftforge/forge/{version}-{forge_version}/forge-{version}-{forge_version}-installer.jar
            const downloadUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVersionString}/forge-${fullVersionString}-installer.jar`;

            return {
                type: 'forge',
                version: version,
                build: forgeVersion,
                url: downloadUrl,
                provider: 'minecraftforge'
            };
        } catch (err) {
            throw new Error(`Forge Resolver failed: ${err.message}`);
        }
    }
}

module.exports = new ForgeResolver();
