/**
 * CompatibilityEngine.js
 * Checks whether a candidate software version is compatible with a
 * server's current Minecraft version.
 *
 * Rules:
 *  - Exact match always passes.
 *  - A server on 1.20.4 is compatible with a build whose minecraftVersion
 *    is 1.20.x (same major.minor), UNLESS force_incompatible_updates is set.
 *  - Cross-major (1.19 → 1.20) is always considered incompatible unless forced.
 */

'use strict';

class CompatibilityEngine {
    /**
     * @param {string} currentVersion  - Minecraft version the server currently runs (e.g. "1.20.4")
     * @param {string} candidateVersion - Minecraft version the candidate build targets
     * @param {boolean} force          - If true, incompatible updates are allowed anyway
     * @returns {{ compatible: boolean, reason: string }}
     */
    check(currentVersion, candidateVersion, force = false) {
        if (!currentVersion || !candidateVersion) {
            return { compatible: false, reason: 'Version string missing' };
        }

        if (currentVersion === candidateVersion) {
            return { compatible: true, reason: 'Exact version match' };
        }

        const cur  = this._parse(currentVersion);
        const cand = this._parse(candidateVersion);

        if (!cur || !cand) {
            return { compatible: false, reason: 'Cannot parse version strings' };
        }

        // Same major.minor → patch update, always safe
        if (cur.major === cand.major && cur.minor === cand.minor) {
            return { compatible: true, reason: `Patch update within ${cur.major}.${cur.minor}` };
        }

        // Different minor or major → incompatible (e.g. 1.20 → 1.21)
        if (!force) {
            return {
                compatible: false,
                reason: `Cross-minor update: ${currentVersion} → ${candidateVersion}. Enable force_incompatible_updates to proceed.`,
            };
        }

        return {
            compatible: true,
            reason: `Forced incompatible update: ${currentVersion} → ${candidateVersion}`,
        };
    }

    /**
     * @param {string} v - Version string like "1.20.4" or "1.21"
     * @returns {{ major: number, minor: number, patch: number } | null}
     */
    _parse(v) {
        const m = String(v).match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
        if (!m) return null;
        return {
            major: parseInt(m[1], 10),
            minor: parseInt(m[2], 10),
            patch: parseInt(m[3] || '0', 10),
        };
    }

    /**
     * Returns a human-readable description of the version change type.
     * @param {string} from
     * @param {string} to
     * @returns {'patch'|'minor'|'major'|'unknown'}
     */
    changeType(from, to) {
        const a = this._parse(from);
        const b = this._parse(to);
        if (!a || !b) return 'unknown';
        if (a.major !== b.major) return 'major';
        if (a.minor !== b.minor) return 'minor';
        return 'patch';
    }
}

module.exports = new CompatibilityEngine();
