/**
 * Nukkit.js  —  NukkitX  (CloudburstMC/Nukkit)
 * ───────────────────────────────────────────────
 * Source:  GitHub Releases API
 * Cache:   cache/resolvers/nukkit.json  (TTL 45 min)
 */

'use strict';

const { fetchLatestRelease, normaliseRelease } = require('./github');
const { makeCache } = require('./cache');

const NAME  = 'NukkitX';
const OWNER = 'CloudburstMC';
const REPO  = 'Nukkit';
const ASSET = 'jar';
const cache = makeCache('nukkit', 45 * 60 * 1000);

// NukkitX has no real GitHub release assets — actual builds are published
// via Jenkins CI. This is the stable, documented "always latest" link
// (the same one used by the official Multicraft jar config).
const JENKINS_JAR_URL =
    'https://ci.opencollab.dev/job/NukkitX/job/Nukkit/job/master/lastSuccessfulBuild/artifact/target/nukkit-1.0-SNAPSHOT.jar';

class NukkitResolver {
    /**
     * Returns: { name, version, downloadUrl, source }
     */
    async getLatestRelease() {
        const cached = cache.read();
        if (cache.isFresh(cached)) return cached.data;

        try {
            const release = await fetchLatestRelease(OWNER, REPO);
            const data    = normaliseRelease(release, { name: NAME, assetExt: ASSET });
            console.log(`[NukkitX] → ${data.version}`);
            cache.write({ data });
            return data;
        } catch (e) {
            console.warn(`[NukkitX] Fetch failed: ${e.message}`);
            if (cached?.data) return cached.data;
            throw e;
        }
    }

    /**
     * Returns: { type, version, build, url, provider, isZip }
     * Matches the same shape Bedrock.js/resolveBuild() returns, so
     * core/resolvers/index.js → downloadJar() can handle it uniformly.
     *
     * NukkitX has no per-version GitHub release assets, so the version
     * string is informational (from the atom feed when available) while
     * the actual download always points at Jenkins' latest successful build.
     */
    async resolveBuild(version, build = 'latest') {
        let liveVersion = 'latest';
        try {
            const latest = await this.getLatestRelease();
            if (latest?.version) liveVersion = latest.version;
        } catch (_) {
            // non-fatal — Jenkins link doesn't need the version to work
        }

        if (version && version !== liveVersion) {
            console.warn(`[NukkitX] Requested version ${version} differs from latest known (${liveVersion}). NukkitX only ships a rolling Jenkins build — using it.`);
        }

        return {
            type: 'nukkitx',
            version: liveVersion,
            build: 'latest',
            url: JENKINS_JAR_URL,
            provider: 'jenkins',
            isZip: false,
        };
    }
}

module.exports = new NukkitResolver();
