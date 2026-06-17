const vanillaResolver = require('./resolvers/vanilla');
const PaperResolver = require('./resolvers/paper');
const PurpurResolver = require('./resolvers/purpur');
const fabricResolver = require('./resolvers/fabric');
const forgeResolver = require('./resolvers/forge');
const quiltResolver = require('./resolvers/quilt');
const magmaResolver = require('./resolvers/magma');
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
        quilt: [],
        magma: [],
        // Bedrock software (from GitHub releases via bedrock/ resolvers)
        bedrock: [],       // Vanilla Bedrock Dedicated Server (BDS)
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
        result.magma = await magmaResolver.listVersions();
        result.magma.sort(compareVersions);
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch Magma versions:', e.message);
    }

    // 8. Bedrock software (GitHub releases — parallel, isolated failures)
    try {
        const [bds, pm, nk, pnk, wd] = await bedrockResolvers.getAll();
        if (bds?.version)  result.bedrock       = [bds.version];   // Vanilla BDS
        if (pm?.version)   result.pocketmine   = [pm.version];
        if (nk?.version)   result.nukkitx      = [nk.version];
        if (pnk?.version)  result.powernukkitx = [pnk.version];
        if (wd?.version)   result.waterdogpe   = [wd.version];
    } catch (e) {
        console.error('[VersionFetcher] Failed to fetch Bedrock software versions:', e.message);
    }

    return result;
}

module.exports = {
    fetchAllVersions
};
