const { fetchJson } = require('./utils');

// PaperMC migrated from api.papermc.io/v2 (sunset Dec 31, 2025) to the new
// "Fill v3" API hosted at fill.papermc.io. v2 no longer serves new versions
// (e.g. RC/pre-release builds), which is why old code using v2 starts 404ing
// as soon as a version isn't in v2's frozen dataset anymore.
class PaperResolver {
    constructor(project = 'paper') {
        this.project = project; // can be 'paper', 'velocity', 'waterfall', 'folia'
        this.baseUrl = `https://fill.papermc.io/v3/projects/${this.project}`;
    }

    async listVersions() {
        const data = await fetchJson(this.baseUrl);
        // v3 groups versions by major version group: { "1.21": ["1.21.11", "1.21.11-rc3", ...], ... }
        // Flatten all groups into one array. Each group is already newest-first.
        const groups = data.versions || {};
        const flat = [];
        for (const key of Object.keys(groups)) {
            for (const v of groups[key]) flat.push(v);
        }
        return flat;
    }

    async resolveBuild(version, buildId = 'latest') {
        const builds = await fetchJson(`${this.baseUrl}/versions/${version}/builds`);
        if (!Array.isArray(builds) || builds.length === 0) {
            throw new Error(`No builds found for ${this.project} ${version}`);
        }

        // v3 returns builds newest-first already.
        let buildData;
        if (buildId === 'latest') {
            // Prefer a STABLE build if one exists; otherwise take the newest build available.
            buildData = builds.find(b => b.channel === 'STABLE') || builds[0];
        } else {
            buildData = builds.find(b => String(b.id) === String(buildId));
            if (!buildData) throw new Error(`Build ${buildId} not found for ${this.project} ${version}`);
        }

        const download = buildData.downloads?.['server:default'];
        if (!download?.url) {
            throw new Error(`No server jar download found for ${this.project} ${version} build ${buildData.id}`);
        }

        return {
            type: this.project,
            version: version,
            build: buildData.id.toString(),
            url: download.url,
            provider: 'papermc',
            sha256: download.checksums?.sha256,
        };
    }
}

module.exports = PaperResolver;
