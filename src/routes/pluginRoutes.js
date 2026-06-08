const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { authenticateToken } = require('../core/auth');
const { checkPermission } = require('../core/permissions');
const { getServer, getServerDir } = require('../core/serverHelper');
const { E, sendError } = require('../core/errors');
const logger = require('../core/utils/logger');

const router = express.Router({ mergeParams: true });

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const fetchJson = (url, options = {}) => new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : null;
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
        method: options.method || 'GET',
        headers: {
            'User-Agent': 'MinePanel/1.0',
            'Accept': 'application/json',
            ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
            ...(options.headers || {})
        }
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON response')); }
            } else {
                reject(new Error(`HTTP ${res.statusCode}`));
            }
        });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
});

const fetchText = (url) => new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'MinePanel/1.0' } }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
            else reject(new Error(`HTTP ${res.statusCode}`));
        });
    }).on('error', reject);
});

const downloadFile = (url, dest) => new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(dest);
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'MinePanel/1.0' } }, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            fileStream.close(); try { fs.unlinkSync(dest); } catch(_) {}
            return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        }
        if (response.statusCode !== 200) {
            fileStream.close(); try { fs.unlinkSync(dest); } catch(_) {}
            return reject(new Error(`Download failed: ${response.statusCode}`));
        }
        response.pipe(fileStream);
        fileStream.on('finish', () => { fileStream.close(); resolve(); });
    }).on('error', (err) => { fileStream.close(); try { fs.unlinkSync(dest); } catch(_) {} reject(err); });
});


// ─── Compatibility helpers ────────────────────────────────────────────────────

const getModrinthLoader = (software) => {
    const map = {
        paper: 'paper', purpur: 'purpur', spigot: 'spigot', bukkit: 'bukkit',
        fabric: 'fabric', quilt: 'quilt', forge: 'forge', neoforge: 'neoforge', magma: 'forge',
    };
    return map[software.toLowerCase()] || null;
};

const isPluginBased = (software) =>
    ['paper', 'purpur', 'spigot', 'bukkit', 'magma'].includes(software.toLowerCase());

const isModBased = (software) =>
    ['fabric', 'quilt', 'forge', 'neoforge'].includes(software.toLowerCase());

const getCompatibleLoaders = (software) => {
    const map = {
        paper: ['paper', 'spigot', 'bukkit'], purpur: ['purpur', 'paper', 'spigot', 'bukkit'],
        spigot: ['spigot', 'bukkit'], bukkit: ['bukkit'], fabric: ['fabric'], quilt: ['quilt', 'fabric'],
        forge: ['forge'], neoforge: ['neoforge'], magma: ['spigot', 'bukkit', 'forge']
    };
    return map[software.toLowerCase()] || [getModrinthLoader(software)].filter(Boolean);
};

const getManagedFolderName = (software) => isModBased(software) ? 'mods' : 'plugins';

const sha1File = (filePath) =>
    crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');

const isVersionCompatible = (version, serverVersion, softwareLower) => {
    const gameOk = version.game_versions && version.game_versions.includes(serverVersion);
    if (!gameOk) return false;
    const compatibleLoaders = getCompatibleLoaders(softwareLower);
    if (isModBased(softwareLower) || isPluginBased(softwareLower)) {
        return version.loaders && version.loaders.some(l => compatibleLoaders.includes(l));
    }
    return true;
};

const buildServerFacets = (server) => {
    const softwareLower = server.software.toLowerCase();
    const loader = getModrinthLoader(softwareLower);
    const facets = [];
    if (isModBased(softwareLower)) {
        facets.push(['project_type:mod']);
        if (loader) facets.push([`categories:${loader}`]);
        facets.push([`versions:${server.version}`]);
    } else {
        facets.push(['project_type:plugin']);
        facets.push([`versions:${server.version}`]);
    }
    return facets;
};

// ─── Hangar helpers ───────────────────────────────────────────────────────────

// Hangar only serves Paper/Waterfall/Velocity plugins
const isHangarCompatible = (software) =>
    ['paper', 'purpur', 'spigot', 'bukkit', 'waterfall', 'velocity'].includes(software.toLowerCase());

// Map our software names to Hangar platform names
const getHangarPlatform = (software) => {
    const map = {
        paper: 'PAPER', purpur: 'PAPER', spigot: 'PAPER',
        bukkit: 'PAPER', waterfall: 'WATERFALL', velocity: 'VELOCITY'
    };
    return map[software.toLowerCase()] || null;
};

// Normalize a Hangar project into a shape similar to Modrinth hits
const normalizeHangarProject = (p) => ({
    project_id: p.namespace ? `${p.namespace.owner}/${p.namespace.slug}` : p.name,
    slug: p.namespace ? p.namespace.slug : p.name,
    owner: p.namespace ? p.namespace.owner : '',
    title: p.name,
    author: p.namespace ? p.namespace.owner : '',
    description: p.description || '',
    icon_url: p.avatarUrl || p.iconUrl || '',
    downloads: p.stats ? (p.stats.downloads || 0) : 0,
    followers: p.stats ? (p.stats.watchers || 0) : 0,
    project_type: 'plugin',
    categories: p.settings ? (p.settings.tags || []) : [],
    source: 'hangar',
    hangarUrl: p.namespace ? `https://hangar.papermc.io/${p.namespace.owner}/${p.namespace.slug}` : null,
});

// Normalize a Hangar version into a shape similar to Modrinth versions
// Real API: v.channel.name, v.downloads.PAPER.downloadUrl or .externalUrl
const normalizeHangarVersion = (v, platform) => {
    const platformData = v.downloads
        ? (v.downloads[platform] || v.downloads['PAPER'] || v.downloads[Object.keys(v.downloads)[0]])
        : null;
    const downloadUrl = platformData ? (platformData.downloadUrl || platformData.externalUrl || null) : null;
    const isExternal = platformData ? (!platformData.downloadUrl && !!platformData.externalUrl) : false;
    const fileInfo = platformData ? platformData.fileInfo : null;
    const filename = fileInfo ? fileInfo.name : `${(v.name || 'unknown').replace(/[^a-zA-Z0-9.\-_]/g, '_')}.jar`;
    return {
        id: v.name,
        name: v.name,                      // version number only — no commit hash description
        version_number: v.name,
        description: v.description || '',  // commit message goes here, shown separately
        loaders: ['paper'],
        game_versions: [],
        date_published: v.createdAt,
        files: downloadUrl ? [{
            url: downloadUrl,
            filename,
            primary: true,
            size: fileInfo ? fileInfo.sizeBytes : 0,
        }] : [],
        source: 'hangar',
        channel: v.channel ? v.channel.name : 'Release',
        isExternal,
        externalUrl: isExternal ? (platformData ? platformData.externalUrl : null) : null,
    };
};


// ─── Installed items helper ───────────────────────────────────────────────────

const getInstalledItems = async (server) => {
    const folderName = getManagedFolderName(server.software);
    const pluginsDir = path.join(getServerDir(server), folderName);
    if (!fs.existsSync(pluginsDir)) return [];
    const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.jar'));
    const items = [];
    for (const f of files) {
        const filePath = path.join(pluginsDir, f);
        const stats = fs.statSync(filePath);
        const sha1 = sha1File(filePath);
        const item = { name: f, size: stats.size, modifiedAt: stats.mtime, sha1, folder: folderName };
        // Try Modrinth fingerprint
        try {
            const version = await fetchJson(`https://api.modrinth.com/v2/version_file/${sha1}?algorithm=sha1`);
            item.modrinth = {
                projectId: version.project_id, versionId: version.id,
                versionNumber: version.version_number, versionName: version.name,
                loaders: version.loaders || [], gameVersions: version.game_versions || []
            };
        } catch (_) { item.modrinth = null; }
        items.push(item);
    }
    return items;
};

const removeInstalledProjectFiles = async (server, projectId, keepFilename) => {
    const folderName = getManagedFolderName(server.software);
    const pluginsDir = path.join(getServerDir(server), folderName);
    const installed = await getInstalledItems(server);
    for (const item of installed) {
        if (item.name === keepFilename) continue;
        if (item.modrinth?.projectId !== projectId) continue;
        const oldPath = path.join(pluginsDir, item.name);
        const expectedDir = path.resolve(pluginsDir);
        if (path.resolve(oldPath).startsWith(expectedDir) && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
};

const installVersionData = async (server, versionData, { replaceProjectId = null, oldFilename = null } = {}) => {
    const folderName = getManagedFolderName(server.software);
    const pluginsDir = path.join(getServerDir(server), folderName);
    if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
    const primaryFile = versionData.files.find(f => f.primary) || versionData.files[0];
    if (!primaryFile) throw new Error('No download file found');
    const dest = path.join(pluginsDir, primaryFile.filename);
    const tempDest = `${dest}.download`;
    await downloadFile(primaryFile.url, tempDest);
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    fs.renameSync(tempDest, dest);
    if (oldFilename && oldFilename !== primaryFile.filename) {
        const oldPath = path.join(pluginsDir, oldFilename);
        const expectedDir = path.resolve(pluginsDir);
        if (path.resolve(oldPath).startsWith(expectedDir) && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    if (replaceProjectId) await removeInstalledProjectFiles(server, replaceProjectId, primaryFile.filename);
    return primaryFile;
};

const pickCompatibleVersion = (versions, serverVersion, softwareLower) =>
    versions.filter(v => isVersionCompatible(v, serverVersion, softwareLower))[0] || null;


// ─── Routes: Modrinth ────────────────────────────────────────────────────────

router.get('/modrinth/search', authenticateToken, async (req, res) => {
    const { serverId } = req.params;
    const query = req.query.q || '';
    const category = req.query.category || '';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const facets = buildServerFacets(server);
        if (category) facets.push([`categories:${category}`]);
        const indexSort = query ? 'relevance' : 'downloads';
        const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&index=${indexSort}&facets=${encodeURIComponent(JSON.stringify(facets))}`;
        const data = await fetchJson(url);
        const hits = (data.hits || []).filter(h => h.server_side !== 'unsupported');
        res.json({ hits: hits.map(h => ({ ...h, source: 'modrinth' })), offset: data.offset ?? offset, limit: data.limit ?? limit, totalHits: data.total_hits ?? hits.length });
    } catch (e) {
        logger.error(`[pluginRoutes] Modrinth search error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, 'Failed to fetch from Modrinth');
    }
});

router.get('/modrinth/project/:projectId', authenticateToken, async (req, res) => {
    try {
        const project = await fetchJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(req.params.projectId)}`);
        res.json({ ...project, source: 'modrinth', modrinthUrl: `https://modrinth.com/${project.project_type || 'plugin'}/${project.slug || project.id}` });
    } catch (e) {
        logger.error(`[pluginRoutes] Modrinth project detail error:`, e);
        return sendError(res, E.PLUGIN_NOT_FOUND, 404);
    }
});

router.get('/modrinth/project/:projectId/versions', authenticateToken, async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const softwareLower = server.software.toLowerCase();
        const installed = await getInstalledItems(server);
        const versions = await fetchJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(req.params.projectId)}/version`);
        res.json(versions.map(v => ({
            ...v,
            source: 'modrinth',
            compatible: isVersionCompatible(v, server.version, softwareLower),
            installed: installed.some(i => i.modrinth?.versionId === v.id),
            installedProject: installed.some(i => i.modrinth?.projectId === v.project_id),
        })));
    } catch (e) {
        logger.error(`[pluginRoutes] Modrinth versions error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── Routes: Hangar ───────────────────────────────────────────────────────────

router.get('/hangar/search', authenticateToken, async (req, res) => {
    const { serverId } = req.params;
    const query = req.query.q || '';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 25);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    try {
        const server = await getServer(serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);

        if (!isHangarCompatible(server.software)) {
            return res.json({ hits: [], offset, limit, totalHits: 0, incompatible: true, reason: `Hangar only supports Paper/Purpur/Spigot servers. Your server runs ${server.software}.` });
        }

        // Correct Hangar API params: q, limit, offset, sort
        // sort options: -stars, -downloads, -views, -newest, -updated, relevance
        const sort = query ? 'relevance' : '-downloads';
        const params = new URLSearchParams({ q: query, limit, offset, sort });
        const data = await fetchJson(`https://hangar.papermc.io/api/v1/projects?${params}`);
        const hits = (data.result || []).map(normalizeHangarProject);
        // Hangar paginates via data.pagination.limit / data.pagination.offset / data.pagination.count
        const totalHits = data.pagination ? data.pagination.count : hits.length;
        res.json({ hits, offset, limit, totalHits });
    } catch (e) {
        logger.error(`[pluginRoutes] Hangar search error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, 'Failed to fetch from Hangar');
    }
});

router.get('/hangar/project/:owner/:slug', authenticateToken, async (req, res) => {
    try {
        const { owner, slug } = req.params;
        // Correct endpoint: /api/v1/projects/{author}/{slug}
        const project = await fetchJson(`https://hangar.papermc.io/api/v1/projects/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}`);
        const normalized = normalizeHangarProject(project);
        // Fetch main page content (markdown readme)
        // Correct endpoint: /api/v1/pages/main/{author}/{slug}
        let body = '';
        try {
            body = await fetchText(`https://hangar.papermc.io/api/v1/pages/main/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}`);
        } catch(_) {}
        res.json({ ...normalized, body, source: 'hangar' });
    } catch (e) {
        logger.error(`[pluginRoutes] Hangar project detail error:`, e);
        return sendError(res, E.PLUGIN_NOT_FOUND, 404);
    }
});

router.get('/hangar/project/:owner/:slug/versions', authenticateToken, async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const { owner, slug } = req.params;
        const platform = getHangarPlatform(server.software) || 'PAPER';
        // Correct endpoint: /api/v1/projects/{author}/{slug}/versions
        // Response: { result: [...], pagination: {...} }
        const data = await fetchJson(`https://hangar.papermc.io/api/v1/projects/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/versions?limit=25&offset=0`);
        const versions = (data.result || []).map(v => {
            const normalized = normalizeHangarVersion(v, platform);
            // Since game_versions is empty (API limitation), mark Release channel as compatible
            // Snapshot and Alpha are also shown but flagged
            const channel = normalized.channel || 'Release';
            const compatible = channel === 'Release';
            return { ...normalized, compatible };
        });
        res.json(versions);
    } catch (e) {
        logger.error(`[pluginRoutes] Hangar versions error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});


// ─── Routes: Shared (installed, install, uninstall, update-all) ───────────────

router.get('/installed', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        res.json(await getInstalledItems(server));
    } catch (e) {
        logger.error(`[pluginRoutes] List installed error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/install', authenticateToken, checkPermission('server.plugins.install'), async (req, res) => {
    const { source, projectId, versionId, allowIncompatible, hangarOwner, hangarSlug } = req.body;

    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const softwareLower = server.software.toLowerCase();
        const folderName = getManagedFolderName(softwareLower);
        const pluginsDir = path.join(getServerDir(server), folderName);
        if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

        // ── Hangar install ──
        if (source === 'hangar') {
            const owner = hangarOwner;
            const slug = hangarSlug;
            const platform = getHangarPlatform(softwareLower) || 'PAPER';

            let targetVersion = null;
            if (versionId) {
                // versionId is the version name string for Hangar
                const data = await fetchJson(`https://hangar.papermc.io/api/v1/projects/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/versions?limit=25&offset=0`);
                targetVersion = (data.result || []).find(v => v.name === versionId);
                if (!targetVersion) throw new Error(`Version ${versionId} not found`);
            } else {
                // Pick latest compatible
                const data = await fetchJson(`https://hangar.papermc.io/api/v1/projects/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/versions?limit=25&offset=0`);
                const versions = data.result || [];
                targetVersion = versions.find(v => {
                    const deps = v.platformDependencies ? (v.platformDependencies[platform] || []) : [];
                    return deps.length === 0 || deps.includes(server.version);
                });
                if (!targetVersion) return sendError(res, E.PLUGIN_INCOMPATIBLE, 404, `No compatible version found for Minecraft ${server.version}`);
            }

            const normalized = normalizeHangarVersion(targetVersion, platform);
            const primaryFile = normalized.files[0];
            if (!primaryFile || !primaryFile.url) throw new Error('No download URL available for this version');

            const safeFilename = primaryFile.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
            const dest = path.join(pluginsDir, safeFilename);
            const tempDest = `${dest}.download`;
            await downloadFile(primaryFile.url, tempDest);
            if (fs.existsSync(dest)) fs.unlinkSync(dest);
            fs.renameSync(tempDest, dest);

            return res.json({ message: `Installed ${slug} v${targetVersion.name} successfully.`, filename: safeFilename, dependencies: [] });
        }

        // ── Modrinth install ──
        let targetVersionId = versionId;
        if (!targetVersionId) {
            const versions = await fetchJson(`https://api.modrinth.com/v2/project/${projectId}/version`);
            const compatible = pickCompatibleVersion(versions, server.version, softwareLower);
            if (!compatible) return sendError(res, E.PLUGIN_INCOMPATIBLE, 404, `No compatible version found for ${server.software} ${server.version}.`);
            targetVersionId = compatible.id;
        } else {
            const vd = await fetchJson(`https://api.modrinth.com/v2/version/${targetVersionId}`);
            const compatible = isVersionCompatible(vd, server.version, softwareLower);
            if (!allowIncompatible && !compatible) {
                return sendError(res, E.PLUGIN_INCOMPATIBLE, 400, `This version does not support ${server.software} ${server.version}. Loaders: ${(vd.loaders || []).join(', ')}`);
            }
        }

        const versionData = await fetchJson(`https://api.modrinth.com/v2/version/${targetVersionId}`);
        const primaryFile = await installVersionData(server, versionData, { replaceProjectId: versionData.project_id });

        // Install required dependencies
        const requiredDeps = (versionData.dependencies || []).filter(d => d.dependency_type === 'required');
        const installedDeps = [];
        for (const dep of requiredDeps) {
            try {
                if (!dep.project_id) continue;
                let depVersionId = dep.version_id;
                if (!depVersionId) {
                    const depVersions = await fetchJson(`https://api.modrinth.com/v2/project/${dep.project_id}/version`);
                    const compatDep = pickCompatibleVersion(depVersions, server.version, softwareLower);
                    if (!compatDep) continue;
                    depVersionId = compatDep.id;
                }
                const depVersionData = await fetchJson(`https://api.modrinth.com/v2/version/${depVersionId}`);
                const depFile = depVersionData.files.find(f => f.primary) || depVersionData.files[0];
                if (!depFile) continue;
                const depPath = path.join(pluginsDir, depFile.filename);
                if (!fs.existsSync(depPath)) { await downloadFile(depFile.url, depPath); installedDeps.push(depFile.filename); }
            } catch (depErr) {
                logger.error(`[pluginRoutes] Failed to install dep ${dep.project_id}:`, depErr);
            }
        }

        const depMsg = installedDeps.length > 0 ? ` Also installed ${installedDeps.length} dep(s): ${installedDeps.join(', ')}` : '';
        res.json({ message: `Installed successfully.${depMsg}`, filename: primaryFile.filename, dependencies: installedDeps });
    } catch (e) {
        logger.error(`[pluginRoutes] Install error:`, e);
        return sendError(res, E.PLUGIN_INSTALL_FAILED, 500, e.message);
    }
});

router.post('/uninstall', authenticateToken, checkPermission('server.plugins.install'), async (req, res) => {
    const { filename } = req.body;
    if (!filename || !filename.endsWith('.jar')) return sendError(res, E.PLUGIN_INVALID_FILENAME, 400);
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const folderName = getManagedFolderName(server.software);
        const filePath = path.join(getServerDir(server), folderName, filename);
        const expectedDir = path.resolve(getServerDir(server), folderName);
        if (!path.resolve(filePath).startsWith(expectedDir)) return sendError(res, E.FILE_ACCESS_DENIED, 403);
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); res.json({ message: `Uninstalled ${filename}` }); }
        else return sendError(res, E.PLUGIN_NOT_FOUND, 404);
    } catch (e) {
        logger.error(`[pluginRoutes] Uninstall error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.post('/update-all', authenticateToken, checkPermission('server.plugins.install'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const softwareLower = server.software.toLowerCase();
        const loaders = getCompatibleLoaders(softwareLower);
        const platform = getHangarPlatform(softwareLower) || 'PAPER';
        const hangarOk = isHangarCompatible(softwareLower);
        const installed = await getInstalledItems(server);
        const results = [];
        const processedProjects = new Set();

        for (const item of installed) {
            // ── Try Modrinth first ─────────────────────────────────────────
            if (item.modrinth) {
                if (processedProjects.has(item.modrinth.projectId)) {
                    results.push({ filename: item.name, status: 'skipped', reason: 'Duplicate' });
                    continue;
                }
                processedProjects.add(item.modrinth.projectId);
                try {
                    const latest = await fetchJson(
                        `https://api.modrinth.com/v2/version_file/${item.sha1}/update?algorithm=sha1`,
                        { method: 'POST', body: { loaders, game_versions: [server.version] } }
                    );
                    if (!latest || latest.id === item.modrinth.versionId) {
                        results.push({ filename: item.name, status: 'current' });
                        continue;
                    }
                    if (!isVersionCompatible(latest, server.version, softwareLower)) {
                        results.push({ filename: item.name, status: 'skipped', reason: 'Latest incompatible' });
                        continue;
                    }
                    const pf = await installVersionData(server, latest, { replaceProjectId: latest.project_id, oldFilename: item.name });
                    results.push({ filename: item.name, newFilename: pf.filename, status: 'updated', newVersionNumber: latest.version_number, source: 'modrinth' });
                    continue;
                } catch (_) {
                    // Modrinth failed — fall through to Hangar below
                }
            }

            // ── Fallback: try Hangar by filename (slug guess) ──────────────
            if (!hangarOk) {
                results.push({ filename: item.name, status: 'skipped', reason: 'Not found on any source' });
                continue;
            }
            try {
                // Guess the plugin name from filename: strip version suffixes & .jar
                const guess = item.name.replace(/[-_][\d].*$/, '').replace(/\.jar$/, '');
                const searchData = await fetchJson(
                    `https://hangar.papermc.io/api/v1/projects?q=${encodeURIComponent(guess)}&limit=5&offset=0&sort=-downloads`
                );
                const match = (searchData.result || []).find(p =>
                    (p.name || '').toLowerCase() === guess.toLowerCase() ||
                    (p.namespace && p.namespace.slug && p.namespace.slug.toLowerCase() === guess.toLowerCase())
                );
                if (!match) {
                    results.push({ filename: item.name, status: 'skipped', reason: 'Not found on any source' });
                    continue;
                }
                const owner = match.namespace.owner;
                const slug  = match.namespace.slug;
                const versionsData = await fetchJson(
                    `https://hangar.papermc.io/api/v1/projects/${encodeURIComponent(owner)}/${encodeURIComponent(slug)}/versions?limit=10&offset=0`
                );
                const latestRelease = (versionsData.result || []).find(v => {
                    const channel = v.channel ? v.channel.name : 'Release';
                    return channel === 'Release';
                });
                if (!latestRelease) {
                    results.push({ filename: item.name, status: 'skipped', reason: 'No release version on Hangar' });
                    continue;
                }
                const normalized = normalizeHangarVersion(latestRelease, platform);
                const primaryFile = normalized.files[0];
                if (!primaryFile || !primaryFile.url) {
                    results.push({ filename: item.name, status: 'skipped', reason: 'No download URL on Hangar' });
                    continue;
                }
                const folderName = getManagedFolderName(softwareLower);
                const pluginsDir = path.join(getServerDir(server), folderName);
                const safeFilename = primaryFile.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
                const dest = path.join(pluginsDir, safeFilename);
                const tempDest = `${dest}.download`;
                await downloadFile(primaryFile.url, tempDest);
                // Remove old file if different name
                if (item.name !== safeFilename) {
                    const oldPath = path.join(pluginsDir, item.name);
                    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
                }
                if (fs.existsSync(dest)) fs.unlinkSync(dest);
                fs.renameSync(tempDest, dest);
                results.push({ filename: item.name, newFilename: safeFilename, status: 'updated', newVersionNumber: latestRelease.name, source: 'hangar' });
            } catch (e) {
                results.push({ filename: item.name, status: 'skipped', reason: 'Not found on any source' });
            }
        }

        const updated = results.filter(r => r.status === 'updated').length;
        const current = results.filter(r => r.status === 'current').length;
        const skipped = results.filter(r => r.status === 'skipped').length;
        res.json({ message: `Updated ${updated} plugin${updated !== 1 ? 's' : ''}.`, updated, current, skipped, results });
    } catch (e) {
        logger.error(`[pluginRoutes] Update all error:`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});

// Keep old /search and /project/:id routes for backwards compat
router.get('/search', authenticateToken, async (req, res) => {
    req.url = '/modrinth/search' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');
    router.handle(req, res, () => {});
});

module.exports = router;
