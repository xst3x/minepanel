'use strict';

/**
 * leaves.js — Leaves (LeafMC/Leaves), a Paper fork with extra optimizations.
 * Source: GitHub releases (LeafMC/Leaves)
 */

const { listVersions, resolveDownloadUrl } = require('./github-java');

const OWNER = 'LeavesMC';
const REPO  = 'Leaves';
const TYPE  = 'leaves';

class LeavesResolver {
    async listVersions() {
        return listVersions(OWNER, REPO, { includePrerelease: true });
    }

    async getLatestVersion() {
        const versions = await this.listVersions();
        if (!versions.length) throw new Error('No Leaves releases found');
        return { version: versions[0] };
    }

    async resolveBuild(version, _build = 'latest') {
        const url = await resolveDownloadUrl(OWNER, REPO, version);
        return {
            type:     TYPE,
            version,
            build:    'latest',
            url,
            provider: 'github',
            isZip:    false,
        };
    }
}

module.exports = new LeavesResolver();
