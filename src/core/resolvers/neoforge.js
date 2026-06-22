/**
 * NeoForge Resolver
 * Uses the official NeoForge Maven/API:
 *   - Versions list:  https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge
 *   - Installer URL:  https://maven.neoforged.net/releases/net/neoforged/neoforge/{ver}/neoforge-{ver}-installer.jar
 *
 * NeoForge version scheme: {mcMajor}.{mcMinor}.{mcPatch}-{nfBuild}
 * e.g. "21.1.172" means MC 1.21.1, NeoForge build 172.
 * For MC 1.20.1 the project was still called "NeoForge" but used a different
 * legacy artifact id; we skip those and only expose versions >= 1.21.
 */

const { fetchJson } = require('./utils');

const MAVEN_API_URL =
    'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';

class NeoForgeResolver {
    constructor() {
        this.id = 'neoforge';
    }

    /**
     * Returns the MC versions that NeoForge supports (newest first).
     * NeoForge version strings look like "21.1.172" → MC 1.21.1.
     */
    async listVersions() {
        try {
            const data = await fetchJson(MAVEN_API_URL);
            // data.versions is an array of NeoForge version strings, e.g. ["21.1.172", "21.1.171", ...]
            const versions = data.versions || [];

            // Extract unique MC versions from NeoForge version strings
            const mcVersionSet = new Set();
            for (const nfVer of versions) {
                const mcVer = this._nfVerToMcVer(nfVer);
                if (mcVer) mcVersionSet.add(mcVer);
            }

            // Sort newest first
            const sorted = Array.from(mcVersionSet).sort(this._compareMcVersions.bind(this));
            return sorted;
        } catch (e) {
            console.error('[NeoForgeResolver] listVersions failed:', e.message);
            return [];
        }
    }

    /**
     * Returns all NeoForge build versions for a given MC version string.
     * e.g. mcVersion="1.21.1" → ["21.1.172", "21.1.171", ...]
     */
    async listBuildsForMcVersion(mcVersion) {
        try {
            const data = await fetchJson(MAVEN_API_URL);
            const versions = data.versions || [];
            const prefix = this._mcVerToNfPrefix(mcVersion);
            if (!prefix) return [];
            return versions.filter(v => v.startsWith(prefix + '.'));
        } catch (e) {
            console.error('[NeoForgeResolver] listBuildsForMcVersion failed:', e.message);
            return [];
        }
    }

    /**
     * Resolves the installer JAR info for a given MC version.
     * build = 'latest' (default) → picks the newest NeoForge build for that MC version.
     */
    async resolveBuild(mcVersion, build = 'latest') {
        const data = await fetchJson(MAVEN_API_URL);
        const allVersions = data.versions || [];

        const prefix = this._mcVerToNfPrefix(mcVersion);
        if (!prefix) {
            throw new Error(`NeoForge does not support MC version ${mcVersion}`);
        }

        const candidates = allVersions.filter(v => v.startsWith(prefix + '.'));
        if (candidates.length === 0) {
            throw new Error(`No NeoForge builds found for MC ${mcVersion}`);
        }

        // Maven API returns newest first, so candidates[0] is latest
        let nfVersion;
        if (build === 'latest' || build === 'recommended') {
            nfVersion = candidates[0];
        } else {
            // build might already be a full NeoForge version string
            const exact = candidates.find(v => v === build);
            if (exact) {
                nfVersion = exact;
            } else {
                // fallback to latest
                nfVersion = candidates[0];
            }
        }

        const downloadUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${nfVersion}/neoforge-${nfVersion}-installer.jar`;

        return {
            type: 'neoforge',
            version: mcVersion,
            build: nfVersion,
            url: downloadUrl,
            provider: 'neoforged',
            // NeoForge installer is a standard executable jar
            isInstaller: true
        };
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Converts a NeoForge version string to its MC version.
     * "21.1.172"  → "1.21.1"
     * "21.4.3"    → "1.21.4"
     * "21.0.1"    → "1.21"     (NeoForge uses .0. for 1.21 without patch)
     */
    _nfVerToMcVer(nfVer) {
        const parts = nfVer.split('.');
        if (parts.length < 3) return null;
        const major = parseInt(parts[0], 10);
        const minor = parseInt(parts[1], 10);
        // Anything before 21.x is legacy (1.20.1 era) — skip
        if (major < 21) return null;
        if (minor === 0) return `1.${major}`;
        return `1.${major}.${minor}`;
    }

    /**
     * Converts an MC version string to the NeoForge prefix used in version strings.
     * "1.21.1" → "21.1"
     * "1.21"   → "21.0"
     */
    _mcVerToNfPrefix(mcVersion) {
        const parts = mcVersion.split('.');
        if (parts.length < 2) return null;
        const mcMajor = parseInt(parts[1], 10); // e.g. 21 from "1.21"
        if (mcMajor < 21) return null;          // legacy, not supported
        const mcMinor = parts[2] ? parseInt(parts[2], 10) : 0;
        return `${mcMajor}.${mcMinor}`;
    }

    _compareMcVersions(a, b) {
        const pa = a.split('.').map(Number);
        const pb = b.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const na = pa[i] || 0;
            const nb = pb[i] || 0;
            if (na !== nb) return nb - na;
        }
        return 0;
    }
}

module.exports = new NeoForgeResolver();
