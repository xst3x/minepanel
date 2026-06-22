'use strict';

/**
 * pufferfish.js - Pufferfish, a performance Paper fork.
 * Source: Jenkins jobs used by pufferfish.host/downloads.
 */

const https = require('https');

const TYPE = 'pufferfish';
const JENKINS_BASE = 'https://ci.pufferfish.host/job';
const SUPPORTED_LINES = [
    { version: '1.21.8', job: 'Pufferfish-1.21' },
    { version: '1.20.4', job: 'Pufferfish-1.20' },
    { version: '1.19.4', job: 'Pufferfish-1.19' },
    { version: '1.18.2', job: 'Pufferfish-1.18' },
    { version: '1.17.1', job: 'Pufferfish-1.17' },
];

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { headers: { 'User-Agent': 'MinePanel/1.0' } }, (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.resume();
                return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            }
            let body = '';
            res.on('data', c => body += c);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (_) { reject(new Error('Invalid JSON')); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

function findLine(version) {
    return SUPPORTED_LINES.find(line => line.version === version || line.job.endsWith(version));
}

class PufferfishResolver {
    async listVersions() {
        return SUPPORTED_LINES.map(line => line.version);
    }

    async getLatestVersion() {
        return { version: SUPPORTED_LINES[0].version };
    }

    async resolveBuild(version, buildId = 'latest') {
        const line = findLine(version);
        if (!line) throw new Error(`Unsupported Pufferfish version: ${version}`);

        const data = await fetchJson(`${JENKINS_BASE}/${line.job}/api/json?tree=builds[number,result,artifacts[relativePath]]{0,20}`);
        const builds = Array.isArray(data.builds) ? data.builds : [];
        const build = buildId === 'latest'
            ? builds.find(b => b.result === 'SUCCESS' && Array.isArray(b.artifacts) && b.artifacts.length > 0)
            : builds.find(b => String(b.number) === String(buildId));

        if (!build) throw new Error(`No Pufferfish build found for ${version}`);

        const artifact = build.artifacts?.find(a => a.relativePath?.endsWith('.jar')) || build.artifacts?.[0];
        if (!artifact?.relativePath) throw new Error(`No Pufferfish jar artifact found for ${version} build ${build.number}`);

        return {
            type: TYPE,
            version,
            build: String(build.number),
            url: `${JENKINS_BASE}/${line.job}/${build.number}/artifact/${artifact.relativePath}`,
            provider: 'pufferfish',
            isZip: false,
        };
    }
}

module.exports = new PufferfishResolver();
