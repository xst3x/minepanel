const { fetchJson } = require('./utils');

class FabricResolver {
    constructor() {
        this.gameVersionsUrl = 'https://meta.fabricmc.net/v2/versions/game';
        this.loaderVersionsUrl = 'https://meta.fabricmc.net/v2/versions/loader';
        this.installerVersionsUrl = 'https://meta.fabricmc.net/v2/versions/installer';
    }

    async listVersions() {
        const data = await fetchJson(this.gameVersionsUrl);
        return data.filter(v => v.stable).map(v => v.version);
    }

    async resolveBuild(version, loaderVersion = 'latest', installerVersion = 'latest') {
        let loader = loaderVersion;
        if (loader === 'latest') {
            const loaders = await fetchJson(this.loaderVersionsUrl);
            loader = loaders.find(l => l.stable).version;
        }

        let installer = installerVersion;
        if (installer === 'latest') {
            const installers = await fetchJson(this.installerVersionsUrl);
            installer = installers.find(i => i.stable).version;
        }

        const downloadUrl = `https://meta.fabricmc.net/v2/versions/loader/${version}/${loader}/${installer}/server/jar`;

        return {
            type: 'fabric',
            version: version,
            build: loader,
            url: downloadUrl,
            provider: 'fabricmc'
        };
    }
}

module.exports = new FabricResolver();
