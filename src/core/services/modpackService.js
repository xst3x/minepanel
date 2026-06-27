/**
 * Modrinth modpack browsing — search, filters, project detail, and version listing.
 */
const { fetchJson, fetchText } = require('./modrinthHttp');

const MODRINTH_BASE = 'https://api.modrinth.com/v2';

/** Real Modrinth category slugs used by modpack projects. */
const MODPACK_CATEGORIES = [
    ['popular', 'Popular'],
    ['technology', 'Technology'],
    ['adventure', 'Adventure'],
    ['magic', 'Magic'],
    ['kitchen-sink', 'Survival'],
    ['hardcore', 'Hardcore'],
    ['vanilla-like', 'Vanilla+'],
    ['optimization', 'Optimization'],
    ['exploration', 'Exploration'],
];

const LOADERS = ['fabric', 'forge', 'quilt', 'neoforge'];

const SORT_INDEX = {
    relevance: 'relevance',
    downloads_desc: 'downloads',
    downloads_asc: 'downloads',
    updated: 'updated',
    newest: 'newest',
};

// Cache Minecraft release versions from Modrinth for 6 hours.
let gameVersionsCache = { versions: null, fetchedAt: 0 };
const GAME_VERSIONS_TTL_MS = 6 * 60 * 60 * 1000;

const buildSearchFacets = ({ mcVersion, loader, category }) => {
    const facets = [['project_type:modpack']];
    if (mcVersion) facets.push([`versions:${mcVersion}`]);
    if (loader) facets.push([`categories:${loader}`]);
    if (category && category !== 'popular') facets.push([`categories:${category}`]);
    return facets;
};

const resolveSearchIndex = ({ query, category, sort }) => {
    if (sort && SORT_INDEX[sort]) return SORT_INDEX[sort];
    if (query) return 'relevance';
    if (category === 'popular' || !category) return 'downloads';
    return 'downloads';
};

const normalizeHit = (hit) => {
    const loaders = (hit.categories || []).filter(c => LOADERS.includes(c));
    const mcVersions = (hit.versions || []).slice(0, 6);
    return {
        project_id: hit.project_id,
        slug: hit.slug,
        title: hit.title,
        author: hit.author,
        description: hit.description,
        icon_url: hit.icon_url,
        downloads: hit.downloads || 0,
        followers: hit.followers || 0,
        categories: hit.categories || [],
        loaders,
        game_versions: mcVersions,
        project_type: hit.project_type || 'modpack',
        date_modified: hit.date_modified,
        source: 'modrinth',
    };
};

/**
 * Search Modrinth modpacks with filters and pagination (15 per page by default).
 */
async function searchModpacks({
    query = '',
    mcVersion = '',
    loader = '',
    category = 'popular',
    sort = '',
    limit = 15,
    offset = 0,
}) {
    const facets = buildSearchFacets({ mcVersion, loader, category });
    const index = resolveSearchIndex({ query, category, sort });
    const params = new URLSearchParams({
        query,
        limit: String(Math.min(Math.max(limit, 1), 100)),
        offset: String(Math.max(offset, 0)),
        index,
        facets: JSON.stringify(facets),
    });

    const data = await fetchJson(`${MODRINTH_BASE}/search?${params}`);
    let hits = (data.hits || []).map(normalizeHit);

    // Modrinth only supports descending download sort — reverse client-side when needed.
    if (sort === 'downloads_asc') {
        hits = [...hits].sort((a, b) => (a.downloads || 0) - (b.downloads || 0));
    }

    return {
        hits,
        offset: data.offset ?? offset,
        limit: data.limit ?? limit,
        totalHits: data.total_hits ?? hits.length,
    };
}

/**
 * Fetch Minecraft Java release versions from Modrinth tag API.
 */
async function getGameVersions() {
    const now = Date.now();
    if (gameVersionsCache.versions && (now - gameVersionsCache.fetchedAt) < GAME_VERSIONS_TTL_MS) {
        return gameVersionsCache.versions;
    }

    try {
        const tags = await fetchJson(`${MODRINTH_BASE}/tag/game_version`);
        const versions = tags
            .filter(t => t.version_type === 'release' && /^(\d+\.)+\d+$/.test(t.version))
            .map(t => t.version)
            .sort((a, b) => {
                const pa = a.split('.').map(Number);
                const pb = b.split('.').map(Number);
                for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                    const diff = (pb[i] || 0) - (pa[i] || 0);
                    if (diff !== 0) return diff;
                }
                return 0;
            });

        gameVersionsCache = { versions, fetchedAt: now };
        return versions;
    } catch (_) {
        if (gameVersionsCache.versions) return gameVersionsCache.versions;
        return ['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5'];
    }
}

async function getProject(projectId) {
    const project = await fetchJson(`${MODRINTH_BASE}/project/${encodeURIComponent(projectId)}`);
    let body = '';
    try {
        body = await fetchText(`${MODRINTH_BASE}/project/${encodeURIComponent(projectId)}/body`);
    } catch (_) {}

    const links = [];
    if (project.discord_url) links.push({ type: 'discord', url: project.discord_url });
    if (project.issues_url) links.push({ type: 'issues', url: project.issues_url });
    if (project.source_url) links.push({ type: 'source', url: project.source_url });
    if (project.wiki_url) links.push({ type: 'wiki', url: project.wiki_url });
    if (project.donation_urls?.length) {
        for (const d of project.donation_urls) {
            links.push({ type: 'donation', url: d.url, label: d.platform || 'Donate' });
        }
    }

    return {
        ...project,
        body,
        links,
        modrinthUrl: `https://modrinth.com/modpack/${project.slug || project.id}`,
        source: 'modrinth',
    };
}

async function getProjectVersions(projectId) {
    const versions = await fetchJson(`${MODRINTH_BASE}/project/${encodeURIComponent(projectId)}/version`);
    return versions
        .filter(v => v.version_type !== 'alpha' || true)
        .map(v => ({
            ...v,
            loaders: (v.loaders || []).filter(l => LOADERS.includes(l)),
            source: 'modrinth',
        }))
        .sort((a, b) => new Date(b.date_published) - new Date(a.date_published));
}

async function getVersion(versionId) {
    return fetchJson(`${MODRINTH_BASE}/version/${encodeURIComponent(versionId)}`);
}

/** Pick the latest modpack version, optionally filtered by loader / MC version. */
async function resolveTargetVersion(projectId, { versionId, loader, mcVersion } = {}) {
    if (versionId) return getVersion(versionId);

    const versions = await getProjectVersions(projectId);
    if (!versions.length) throw new Error('No versions available for this modpack');

    const filtered = versions.filter(v => {
        const loaderOk = !loader || (v.loaders || []).includes(loader);
        const mcOk = !mcVersion || (v.game_versions || []).includes(mcVersion);
        return loaderOk && mcOk;
    });

    return filtered[0] || versions[0];
}

/** Map Modrinth loader to MinePanel software key. */
function loaderToSoftware(loaders) {
    const priority = ['neoforge', 'forge', 'fabric', 'quilt'];
    for (const l of priority) {
        if (loaders.includes(l)) return l;
    }
    return null;
}

function pickMcVersion(versionData, preferred) {
    const versions = versionData.game_versions || [];
    if (preferred && versions.includes(preferred)) return preferred;
    return versions[0] || null;
}

module.exports = {
    MODPACK_CATEGORIES,
    LOADERS,
    SORT_INDEX,
    searchModpacks,
    getGameVersions,
    getProject,
    getProjectVersions,
    getVersion,
    resolveTargetVersion,
    loaderToSoftware,
    pickMcVersion,
};
