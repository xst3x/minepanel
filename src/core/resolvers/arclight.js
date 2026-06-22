'use strict';

/**
 * arclight.js — Arclight (IzzelAliz/Arclight), a Forge+Bukkit hybrid server.
 * Source: GitHub releases (IzzelAliz/Arclight)
 *
 * Arclight jars are named arclight-<mc_version>-<build>.jar, e.g.:
 *   arclight-1.21-1.0.3.jar
 * The tag is usually the build number (e.g. "1.0.3") and MC version is in the asset name.
 */

const { listVersions, resolveDownloadUrl } = require('./github-java');

const OWNER = 'IzzelAliz';
const REPO  = 'Arclight';
const TYPE  = 'arclight';

class ArclightResolver {
    async listVersions() {
        return listVersions(OWNER, REPO);
    }

    async getLatestVersion() {
        const versions = await this.listVersions();
        if (!versions.length) throw new Error('No Arclight releases found');
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

module.exports = new ArclightResolver();
