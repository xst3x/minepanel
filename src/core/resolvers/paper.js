const { fetchJson } = require('./utils');

class PaperResolver {
    constructor(project = 'paper') {
        this.project = project; // can be 'paper', 'velocity', 'waterfall', 'folia'
        this.baseUrl = `https://api.papermc.io/v2/projects/${this.project}`;
    }

    async listVersions() {
        const data = await fetchJson(this.baseUrl);
        return data.versions.reverse(); // Newest first
    }

    async resolveBuild(version, buildId = 'latest') {
        const versionData = await fetchJson(`${this.baseUrl}/versions/${version}`);
        
        let build = buildId;
        if (build === 'latest') {
            build = versionData.builds[versionData.builds.length - 1];
        }

        const buildData = await fetchJson(`${this.baseUrl}/versions/${version}/builds/${build}`);
        const downloadFile = buildData.downloads.application.name;
        const sha256 = buildData.downloads.application.sha256;

        const downloadUrl = `${this.baseUrl}/versions/${version}/builds/${build}/downloads/${downloadFile}`;

        return {
            type: this.project,
            version: version,
            build: build.toString(),
            url: downloadUrl,
            provider: 'papermc',
            sha256: sha256
        };
    }
}

module.exports = PaperResolver;
