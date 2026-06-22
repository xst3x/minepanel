const vanillaResolver = require('./resolvers/vanilla');
const PaperResolver = require('./resolvers/paper');
const PurpurResolver = require('./resolvers/purpur');
const fabricResolver = require('./resolvers/fabric');
const forgeResolver = require('./resolvers/forge');
const quiltResolver = require('./resolvers/quilt');
const magmaResolver = require('./resolvers/magma');
const foliaResolver = require('./resolvers/folia');
const velocityResolver = require('./resolvers/velocity');
const waterfallResolver = require('./resolvers/waterfall');
const leavesResolver = require('./resolvers/leaves');
const pufferfishResolver = require('./resolvers/pufferfish');
const arclightResolver = require('./resolvers/arclight');
const mohistResolver = require('./resolvers/mohist');
const spongevanillaResolver = require('./resolvers/spongevanilla');
const neoforgeResolver = require('./resolvers/neoforge');
const bedrockResolvers = require('./resolvers/bedrock');

const paperResolver = new PaperResolver('paper');
const purpurResolver = new PurpurResolver();

// Custom comparison to sort versions semver-like descending (newest first)
function compareVersions(a, b) {
    const aParts = a.split('-')[0].split('.').map(Number);
    const bParts = b.split('-')[0].split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
        const aVal = aParts[i] || 0;
        const bVal = bParts[i] || 0;
        if (aVal !== bVal) {
            return bVal - aVal; // Newest first
        }
    }
    return b.localeCompare(a);
}

async function fetchAllVersions() {
    console.log('[VersionFetcher] Fetching versions from APIs...');
    const result = {
        vanilla: [],
        snapshots: [],
        paper: [],
        purpur: [],
        fabric: [],
        forge: [],
	neoforge: [],
        quilt: [],
        magma: [],
        folia: [],
        velocity: [],
        waterfall: [],
        leaves: [],
        pufferfish: [],
        arclight: [],
        mohist: [],
        spongevanilla: [],
        // Bedrock software (from GitHub releases via bedrock/ resolvers)
        bedrock: [],
        'bedrock-preview': [],
        pocketmine: [],
        nukkitx: [],
        powernukkitx: [],
        waterdogpe: [],
    };

    // 1. Vanilla & Snapshots
    try {
        const vanillaAll = await vanillaResolver.listVersions();
        result.vanilla = vanillaAll.filter(v => v.type === 'release').map(v => v.version);
        result.snapshots = vanillaAll.filter(v => v.type === 'snapshot').map(v => v.version);
        // They are returned chronological (newest first) by Mojang, which is perfect.
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch Vanilla/Snapshots versions:', e.message);
    }

    // 2. Paper
    try {
        result.paper = await paperResolver.listVersions();
        // paper listVersions returns reversed (newest first), but let's sort just in case
        result.paper.sort(compareVersions);
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch Paper versions:', e.message);
    }

    // 3. Purpur
    try {
        result.purpur = await purpurResolver.listVersions();
        result.purpur.sort(compareVersions);
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch Purpur versions:', e.message);
    }

    // 4. Fabric
    try {
        result.fabric = await fabricResolver.listVersions();
        result.fabric.sort(compareVersions);
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch Fabric versions:', e.message);
    }

    // 5. Forge
    try {
        result.forge = await forgeResolver.listVersions();
        result.forge.sort(compareVersions);
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch Forge versions:', e.message);
    }

    // 6. Quilt
    try {
        result.quilt = await quiltResolver.listVersions();
        result.quilt.sort(compareVersions);
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch Quilt versions:', e.message);
    }

    // 7. Magma
    try {
        const magmaRes = await magmaResolver.listVersions();
        if (Array.isArray(magmaRes)) {
            result.magma = magmaRes;
        } else if (magmaRes && Array.isArray(magmaRes.versions)) {
            result.magma = magmaRes.versions;
            if (magmaRes.source === 'fallback') {
                console.warn('[VersionFetcher] Magma API is down. Using safe fallback version list.');
            }
        } else {
            result.magma = [];
        }
        result.magma.sort(compareVersions);
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch Magma versions:', e.message);
    }

    // 8. PaperMC forks: Folia, Velocity, Waterfall
    const paperForks = [
        { key: 'folia', resolver: foliaResolver },
        { key: 'velocity', resolver: velocityResolver },
        { key: 'waterfall', resolver: waterfallResolver },
    ];
    for (const { key, resolver } of paperForks) {
        try {
            result[key] = await resolver.listVersions();
            result[key].sort(compareVersions);
        } catch (e) {
            console.error(`[VersionFetcher] Failed to fetch ${key} versions:`, e.message);
        }
    }

    // 9. GitHub-based Java resolvers: Leaves, Pufferfish, Arclight
    const githubForks = [
        { key: 'leaves', resolver: leavesResolver },
        { key: 'pufferfish', resolver: pufferfishResolver },
        { key: 'arclight', resolver: arclightResolver },
    ];
    for (const { key, resolver } of githubForks) {
        try {
            result[key] = await resolver.listVersions();
        } catch (e) {
            console.error(`[VersionFetcher] Failed to fetch ${key} versions:`, e.message);
        }
    }

    // 10. Mohist
    try {
        result.mohist = await mohistResolver.listVersions();
        result.mohist.sort(compareVersions);
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch Mohist versions:', e.message);
    }

    // 11. SpongeVanilla
    try {
        result.spongevanilla = await spongevanillaResolver.listVersions();
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch SpongeVanilla versions:', e.message);
    }

    // 11b. NeoForge
    try {
        result.neoforge = await neoforgeResolver.listVersions();
        result.neoforge.sort(compareVersions);
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch NeoForge versions:', e.message);
    }

    // 12. Bedrock software (GitHub releases — parallel, isolated failures)
    try {
        const [bds, bdsPrev, pm, nk, pnk, wd] = await bedrockResolvers.getAll();
        if (bds?.version)     result.bedrock            = [bds.version];
        if (bdsPrev?.version) result['bedrock-preview'] = [bdsPrev.version];
        if (pm?.version)      result.pocketmine          = [pm.version];
        if (nk?.version)      result.nukkitx             = [nk.version];
        if (pnk?.version)     result.powernukkitx        = [pnk.version];
        if (wd?.version)      result.waterdogpe          = [wd.version];
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch Bedrock software versions:', e.message);
    }

    return result;
}

module.exports = {
    fetchAllVersions
};
