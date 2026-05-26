const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { dbGet } = require('../db/database');
const { authenticateToken } = require('../core/auth');
const { checkPermission } = require('../core/permissions');
const { getServer, getServerDir } = require('../core/serverHelper');

const router = express.Router({ mergeParams: true });

const fetchJson = (url, options = {}) => new Promise((resolve, reject) => {
    const body = options.body ? JSON.stringify(options.body) : null;
    const req = https.request(url, {
        method: options.method || 'GET',
        headers: {
            'User-Agent': 'MinePanel/1.0',
            ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {})
        }
    }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
                try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('Invalid JSON')); }
            } else { reject(new Error(`HTTP ${res.statusCode}`)); }
        });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
});

const downloadFile = (url, dest) => new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'MinePanel/1.0' } }, (response) => {
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

// ─── Compatibility Helpers ────────────────────────────────────────────────────

// Map server software to Modrinth loader category name
const getModrinthLoader = (software) => {
    const map = {
        'paper':    'paper',
        'purpur':   'purpur',
        'spigot':   'spigot',
        'bukkit':   'bukkit',
        'fabric':   'fabric',
        'quilt':    'quilt',
        'forge':    'forge',
        'neoforge': 'neoforge',
        'magma':    'forge',
    };
    return map[software.toLowerCase()] || null;
};

// Returns true if software supports Bukkit-style plugins
const isPluginBased = (software) =>
    ['paper', 'purpur', 'spigot', 'bukkit', 'magma'].includes(software.toLowerCase());

// Returns true if software supports mods
const isModBased = (software) =>
    ['fabric', 'quilt', 'forge', 'neoforge'].includes(software.toLowerCase());

const getCompatibleLoaders = (software) => {
    const lower = software.toLowerCase();
    const map = {
        paper: ['paper', 'spigot', 'bukkit'],
        purpur: ['purpur', 'paper', 'spigot', 'bukkit'],
        spigot: ['spigot', 'bukkit'],
        bukkit: ['bukkit'],
        fabric: ['fabric'],
        quilt: ['quilt'],
        forge: ['forge'],
        neoforge: ['neoforge'],
        magma: ['spigot', 'bukkit', 'forge']
    };
    return map[lower] || [getModrinthLoader(lower)].filter(Boolean);
};

const getManagedFolderName = (software) => isModBased(software) ? 'mods' : 'plugins';

const sha1File = (filePath) =>
    crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');

const buildServerFacets = (server) => {
    const softwareLower = server.software.toLowerCase();
    const loader = getModrinthLoader(softwareLower);
    const facets = [];

    if (isModBased(softwareLower)) {
        facets.push(['project_type:mod']);
        if (loader) facets.push([`categories:${loader}`]);
        facets.push([`versions:${server.version}`]);
    } else if (isPluginBased(softwareLower)) {
        facets.push(['project_type:plugin']);
        facets.push([`versions:${server.version}`]);
    } else {
        facets.push(['project_type:plugin']);
        facets.push([`versions:${server.version}`]);
    }

    return facets;
};

const isVersionCompatible = (version, serverVersion, softwareLower) => {
    const gameOk = version.game_versions && version.game_versions.includes(serverVersion);
    if (!gameOk) return false;

    const compatibleLoaders = getCompatibleLoaders(softwareLower);
    if (isModBased(softwareLower)) {
        return version.loaders && version.loaders.some(l => compatibleLoaders.includes(l));
    }
    if (isPluginBased(softwareLower)) {
        return version.loaders && version.loaders.some(l => compatibleLoaders.includes(l));
    }
    return true;
};

const getInstalledItems = async (server, { includeModrinth = true } = {}) => {
    const folderName = getManagedFolderName(server.software);
    const pluginsDir = path.join(getServerDir(server), folderName);
    if (!fs.existsSync(pluginsDir)) return [];

    const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.jar'));
    const items = [];

    for (const f of files) {
        const filePath = path.join(pluginsDir, f);
        const stats = fs.statSync(filePath);
        const item = {
            name: f,
            size: stats.size,
            modifiedAt: stats.mtime,
            sha1: sha1File(filePath),
            folder: folderName
        };

        if (includeModrinth) {
            try {
                const version = await fetchJson(`https://api.modrinth.com/v2/version_file/${item.sha1}?algorithm=sha1`);
                item.modrinth = {
                    projectId: version.project_id,
                    versionId: version.id,
                    versionNumber: version.version_number,
                    versionName: version.name,
                    loaders: version.loaders || [],
                    gameVersions: version.game_versions || []
                };
            } catch (_) {
                item.modrinth = null;
            }
        }

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
        if (path.resolve(oldPath).startsWith(expectedDir) && fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
        }
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

// Pick the best compatible version from a Modrinth versions array
// Must match BOTH game version AND loader (for mod-based servers)
const pickCompatibleVersion = (versions, serverVersion, softwareLower) => {
    const matches = versions.filter(v => isVersionCompatible(v, serverVersion, softwareLower));

    // Prefer newest match (Modrinth returns newest first)
    return matches[0] || null;
};

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get('/search', authenticateToken, async (req, res) => {
    const { serverId } = req.params;
    const query = req.query.q || '';
    const category = req.query.category || '';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 24, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    try {
        const server = await getServer(serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        const facets = buildServerFacets(server);
        if (category) facets.push([`categories:${category}`]);

        const indexSort = query ? 'relevance' : 'downloads';
        const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&index=${indexSort}&facets=${encodeURIComponent(JSON.stringify(facets))}`;
        const data = await fetchJson(url);
        const hits = data.hits || [];

        // Extra client-side filter: skip client-only items
        const filtered = hits.filter(h => h.server_side !== 'unsupported');
        res.json({
            hits: filtered,
            offset: data.offset ?? offset,
            limit: data.limit ?? limit,
            totalHits: data.total_hits ?? filtered.length
        });
    } catch (e) {
        console.error(`[pluginRoutes] Search error (Server: ${serverId}, User: ${req.user.id}, Query: ${query}):`, e);
        res.status(500).json({ error: 'Failed to fetch from Modrinth' });
    }
});

router.get('/project/:projectId', authenticateToken, async (req, res) => {
    try {
        const project = await fetchJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(req.params.projectId)}`);
        res.json({
            ...project,
            modrinthUrl: `https://modrinth.com/${project.project_type || 'plugin'}/${project.slug || project.id}`
        });
    } catch (e) {
        console.error(`[pluginRoutes] Project detail error (Server: ${req.params.serverId}, User: ${req.user.id}, Project: ${req.params.projectId}):`, e);
        res.status(500).json({ error: 'Failed to fetch project details from Modrinth' });
    }
});

router.get('/project/:projectId/versions', authenticateToken, async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        const softwareLower = server.software.toLowerCase();
        const installed = await getInstalledItems(server);
        const versions = await fetchJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(req.params.projectId)}/version`);
        res.json(versions.map(v => ({
            ...v,
            compatible: isVersionCompatible(v, server.version, softwareLower),
            installed: installed.some(item => item.modrinth?.versionId === v.id),
            installedProject: installed.some(item => item.modrinth?.projectId === v.project_id),
            serverVersion: server.version,
            serverLoader: getModrinthLoader(softwareLower)
        })));
    } catch (e) {
        console.error(`[pluginRoutes] Project versions error (Server: ${req.params.serverId}, User: ${req.user.id}, Project: ${req.params.projectId}):`, e);
        res.status(500).json({ error: 'Failed to fetch project versions from Modrinth' });
    }
});

router.get('/installed', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        res.json(await getInstalledItems(server));
    } catch (e) {
        console.error(`[pluginRoutes] List installed error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to list installed plugins' });
    }
});

router.post('/update-all', authenticateToken, checkPermission('server.plugins.install'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        const softwareLower = server.software.toLowerCase();
        const loaders = getCompatibleLoaders(softwareLower);
        const installed = await getInstalledItems(server);
        const results = [];
        const processedProjects = new Set();

        for (const item of installed) {
            if (!item.modrinth) {
                results.push({ filename: item.name, status: 'skipped', reason: 'Not recognized on Modrinth' });
                continue;
            }
            if (processedProjects.has(item.modrinth.projectId)) {
                results.push({ filename: item.name, status: 'skipped', reason: 'Duplicate installed project' });
                continue;
            }
            processedProjects.add(item.modrinth.projectId);

            try {
                const latest = await fetchJson(`https://api.modrinth.com/v2/version_file/${item.sha1}/update?algorithm=sha1`, {
                    method: 'POST',
                    body: { loaders, game_versions: [server.version] }
                });

                if (!latest || latest.id === item.modrinth.versionId) {
                    results.push({
                        filename: item.name,
                        projectId: item.modrinth.projectId,
                        versionId: item.modrinth.versionId,
                        versionNumber: item.modrinth.versionNumber,
                        status: 'current'
                    });
                    continue;
                }

                if (!isVersionCompatible(latest, server.version, softwareLower)) {
                    results.push({
                        filename: item.name,
                        projectId: item.modrinth.projectId,
                        status: 'skipped',
                        reason: 'Latest response was not compatible'
                    });
                    continue;
                }

                const primaryFile = await installVersionData(server, latest, {
                    replaceProjectId: latest.project_id,
                    oldFilename: item.name
                });

                results.push({
                    filename: item.name,
                    newFilename: primaryFile.filename,
                    projectId: latest.project_id,
                    oldVersionId: item.modrinth.versionId,
                    newVersionId: latest.id,
                    oldVersionNumber: item.modrinth.versionNumber,
                    newVersionNumber: latest.version_number,
                    status: 'updated'
                });
            } catch (e) {
                results.push({ filename: item.name, status: 'skipped', reason: e.message });
            }
        }

        const updated = results.filter(r => r.status === 'updated').length;
        const current = results.filter(r => r.status === 'current').length;
        const skipped = results.filter(r => r.status === 'skipped').length;
        res.json({
            message: `Update complete: ${updated} updated, ${current} already current, ${skipped} skipped.`,
            updated,
            current,
            skipped,
            results
        });
    } catch (e) {
        console.error(`[pluginRoutes] Update all error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to update plugins: ' + e.message });
    }
});

router.post('/uninstall', authenticateToken, checkPermission('server.plugins.install'), async (req, res) => {
    const { filename } = req.body;
    if (!filename || !filename.endsWith('.jar')) return res.status(400).json({ error: 'Invalid filename' });
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const folderName = isModBased(server.software) ? 'mods' : 'plugins';
        const filePath = path.join(getServerDir(server), folderName, filename);
        const expectedDir = path.resolve(getServerDir(server), folderName);
        if (!path.resolve(filePath).startsWith(expectedDir)) return res.status(403).json({ error: 'Access denied' });
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); res.json({ message: `Uninstalled ${filename}` }); }
        else res.status(404).json({ error: 'Plugin not found' });
    } catch (e) {
        console.error(`[pluginRoutes] Uninstall error (Server: ${req.params.serverId}, User: ${req.user.id}, File: ${filename}):`, e);
        res.status(500).json({ error: 'Failed to uninstall' });
    }
});

router.post('/install', authenticateToken, checkPermission('server.plugins.install'), async (req, res) => {
    const { projectId, versionId, allowIncompatible } = req.body;
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });

        const softwareLower = server.software.toLowerCase();
        const folderName = getManagedFolderName(softwareLower);
        const pluginsDir = path.join(getServerDir(server), folderName);
        if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

        let targetVersionId = versionId;

        if (!targetVersionId) {
            // Auto-select the best compatible version
            const versions = await fetchJson(`https://api.modrinth.com/v2/project/${projectId}/version`);
            const compatible = pickCompatibleVersion(versions, server.version, softwareLower);

            if (!compatible) {
                return res.status(404).json({
                    error: `No compatible version found for ${server.software} ${server.version}. ` +
                           `This mod/plugin may not support your server's software or Minecraft version.`
                });
            }
            targetVersionId = compatible.id;
        } else {
            // If caller provided a specific versionId, still validate it is compatible
            const vd = await fetchJson(`https://api.modrinth.com/v2/version/${targetVersionId}`);
            const compatible = isVersionCompatible(vd, server.version, softwareLower);

            if (!allowIncompatible && !(vd.game_versions && vd.game_versions.includes(server.version))) {
                return res.status(400).json({
                    error: `This version does not support Minecraft ${server.version}. ` +
                           `Supported versions: ${(vd.game_versions || []).join(', ')}`
                });
            }
            if (!allowIncompatible && !compatible) {
                return res.status(400).json({
                    error: `This version does not support ${server.software}. ` +
                           `Supported loaders: ${(vd.loaders || []).join(', ')}`
                });
            }
        }

        const versionData = await fetchJson(`https://api.modrinth.com/v2/version/${targetVersionId}`);
        const primaryFile = await installVersionData(server, versionData, { replaceProjectId: versionData.project_id });

        // Install required dependencies (also validated for compatibility)
        const requiredDeps = (versionData.dependencies || []).filter(d => d.dependency_type === 'required');
        const installedDeps = [];
        for (const dep of requiredDeps) {
            try {
                if (!dep.project_id) continue;
                let depVersionId = dep.version_id;
                if (!depVersionId) {
                    const depVersions = await fetchJson(`https://api.modrinth.com/v2/project/${dep.project_id}/version`);
                    const compatDep = pickCompatibleVersion(depVersions, server.version, softwareLower);
                    if (!compatDep) {
                        console.warn(`[pluginRoutes] No compatible version for dependency ${dep.project_id} on ${server.software} ${server.version}`);
                        continue;
                    }
                    depVersionId = compatDep.id;
                }
                const depVersionData = await fetchJson(`https://api.modrinth.com/v2/version/${depVersionId}`);
                const depFile = depVersionData.files.find(f => f.primary) || depVersionData.files[0];
                if (!depFile) continue;
                const depPath = path.join(pluginsDir, depFile.filename);
                if (!fs.existsSync(depPath)) {
                    await downloadFile(depFile.url, depPath);
                    installedDeps.push(depFile.filename);
                }
            } catch (depErr) {
                console.error(`[pluginRoutes] Failed to install dep ${dep.project_id}:`, depErr.message);
            }
        }

        const depMsg = installedDeps.length > 0
            ? ` Also installed ${installedDeps.length} dep(s): ${installedDeps.join(', ')}`
            : '';
        res.json({
            message: `Installed successfully.${depMsg}`,
            filename: primaryFile.filename,
            dependencies: installedDeps
        });
    } catch (e) {
        console.error(`[pluginRoutes] Install error (Server: ${req.params.serverId}, User: ${req.user.id}, Project: ${projectId}):`, e);
        res.status(500).json({ error: 'Failed to install: ' + e.message });
    }
});

module.exports = router;
