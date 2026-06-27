/**
 * Modpack browser API — Modrinth search, detail, versions, and server creation.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { authenticateToken } = require('../core/auth');
const { dbGet } = require('../db/database');
const { E, sendError } = require('../core/errors');
const { validate } = require('../middleware/validation');
const V = require('../middleware/validators');
const logger = require('../core/utils/logger');
const {
    MODPACK_CATEGORIES,
    LOADERS,
    searchModpacks,
    getGameVersions,
    getProject,
    getProjectVersions,
} = require('../core/services/modpackService');
const { createModpackServer } = require('../core/services/modpackInstaller');

const router = express.Router();

const ICON_CACHE_DIR = process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'modpack-icon-cache')
    : path.resolve(__dirname, '../../cache/modpack-icons');

if (!fs.existsSync(ICON_CACHE_DIR)) {
    try { fs.mkdirSync(ICON_CACHE_DIR, { recursive: true }); } catch (_) {}
}

/** Proxy and cache modpack icons to reduce repeat CDN requests (no auth — img tags cannot send JWT). */
router.get('/icon', async (req, res) => {
    const rawUrl = req.query.url;
    if (!rawUrl || !/^https:\/\/cdn\.modrinth\.com\//.test(rawUrl)) {
        return sendError(res, E.BAD_REQUEST, 400, 'Invalid icon URL');
    }

    const hash = crypto.createHash('sha256').update(rawUrl).digest('hex');
    const cachePath = path.join(ICON_CACHE_DIR, hash);

    try {
        if (fs.existsSync(cachePath)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
            return res.sendFile(cachePath);
        }

        const parsed = new URL(rawUrl);
        const lib = parsed.protocol === 'https:' ? https : http;

        lib.get(rawUrl, { headers: { 'User-Agent': 'MinePanel/1.0' } }, (response) => {
            if (response.statusCode !== 200) {
                return sendError(res, E.INTERNAL_ERROR, 502, 'Failed to fetch icon');
            }
            const chunks = [];
            response.on('data', c => chunks.push(c));
            response.on('end', () => {
                const buf = Buffer.concat(chunks);
                try { fs.writeFileSync(cachePath, buf); } catch (_) {}
                res.setHeader('Content-Type', response.headers['content-type'] || 'image/png');
                res.setHeader('Cache-Control', 'public, max-age=86400');
                res.send(buf);
            });
        }).on('error', () => sendError(res, E.INTERNAL_ERROR, 502, 'Failed to fetch icon'));
    } catch (e) {
        logger.error('[modpackRoutes] icon proxy error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

router.get('/categories', authenticateToken, (_req, res) => {
    res.json({ categories: MODPACK_CATEGORIES, loaders: LOADERS });
});

router.get('/game-versions', authenticateToken, async (_req, res) => {
    try {
        const versions = await getGameVersions();
        res.json({ versions });
    } catch (e) {
        logger.error('[modpackRoutes] game-versions error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, 'Failed to fetch Minecraft versions');
    }
});

router.get('/search', authenticateToken, async (req, res) => {
    const query = req.query.q || '';
    const mcVersion = req.query.mcVersion || '';
    const loader = req.query.loader || '';
    const category = req.query.category || 'popular';
    const sort = req.query.sort || '';
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    try {
        const data = await searchModpacks({ query, mcVersion, loader, category, sort, limit, offset });
        res.json(data);
    } catch (e) {
        logger.error('[modpackRoutes] search error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, 'Failed to search modpacks');
    }
});

router.get('/project/:projectId', authenticateToken, async (req, res) => {
    try {
        const project = await getProject(req.params.projectId);
        res.json(project);
    } catch (e) {
        logger.error('[modpackRoutes] project detail error:', e);
        return sendError(res, E.PLUGIN_NOT_FOUND, 404, 'Modpack not found');
    }
});

/**
 * GET /api/modpacks/version/:versionId/contents
 * Resolves all dependencies of a modpack version and groups them into
 * mods, resource_packs, and shaders lists. Used for the "Included Content" tab.
 */
router.get('/version/:versionId/contents', authenticateToken, async (req, res) => {
    try {
        const { fetchJson } = require('../core/services/modrinthHttp');
        const MODRINTH_BASE = 'https://api.modrinth.com/v2';

        const version = await fetchJson(`${MODRINTH_BASE}/version/${encodeURIComponent(req.params.versionId)}`);
        const deps = (version.dependencies || []).filter(d => d.project_id && d.dependency_type !== 'incompatible');

        if (!deps.length) {
            return res.json({ mods: [], resource_packs: [], shaders: [] });
        }

        // Batch-fetch project info for all dependency project IDs (Modrinth supports up to 1000 IDs).
        const ids = [...new Set(deps.map(d => d.project_id))];
        let projects = [];
        try {
            const idsParam = encodeURIComponent(JSON.stringify(ids));
            projects = await fetchJson(`${MODRINTH_BASE}/projects?ids=${idsParam}`);
        } catch (_) {}

        const projectMap = {};
        for (const p of (projects || [])) projectMap[p.id] = p;

        const mods = [], resource_packs = [], shaders = [];

        for (const dep of deps) {
            const proj = projectMap[dep.project_id];
            const entry = {
                project_id: dep.project_id,
                version_id: dep.version_id || null,
                dependency_type: dep.dependency_type,
                name: proj?.title || dep.project_id,
                slug: proj?.slug || dep.project_id,
                icon_url: proj?.icon_url || null,
                project_type: proj?.project_type || 'mod',
            };
            const type = proj?.project_type || 'mod';
            if (type === 'resourcepack' || type === 'resource_pack') {
                resource_packs.push(entry);
            } else if (type === 'shader') {
                shaders.push(entry);
            } else {
                mods.push(entry);
            }
        }

        res.json({ mods, resource_packs, shaders });
    } catch (e) {
        logger.error('[modpackRoutes] version contents error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, 'Failed to fetch version contents');
    }
});

router.get('/project/:projectId/versions', authenticateToken, async (req, res) => {
    try {
        const versions = await getProjectVersions(req.params.projectId);
        res.json(versions);
    } catch (e) {
        logger.error('[modpackRoutes] versions error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, 'Failed to fetch modpack versions');
    }
});

router.post('/create-server', authenticateToken, validate(V.createModpackServer), async (req, res) => {
    const { name, ram_mb, port, projectId, versionId } = req.body;
    const userId = req.user.id;

    try {
        const user = await dbGet('SELECT role FROM users WHERE id = ?', [userId]);
        if (!user || user.role !== 'admin') {
            return sendError(res, E.FORBIDDEN_ADMIN_ONLY, 403);
        }

        const result = await createModpackServer({
            name,
            ram_mb,
            port,
            projectId,
            versionId: versionId || null,
            userId,
        });

        res.json({
            message: `Modpack server "${name}" created successfully.`,
            ...result,
        });
    } catch (e) {
        logger.error('[modpackRoutes] create-server error:', e);
        if (e.message?.includes('SQLITE_CONSTRAINT')) {
            if (e.message.includes('servers.name')) return sendError(res, E.SERVER_NAME_TAKEN, 409);
            if (e.message.includes('servers.port')) return sendError(res, E.SERVER_PORT_TAKEN, 409);
        }
        return sendError(res, E.INTERNAL_ERROR, 500, e.message || 'Modpack server creation failed');
    }
});

module.exports = router;
