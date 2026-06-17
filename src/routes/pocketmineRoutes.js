/**
 * pocketmineRoutes.js
 * ────────────────────
 * All PocketMine-MP plugin endpoints, backed exclusively by the Poggit API.
 *
 * Mounted at:  /api/servers/:serverId/pocketmine
 *
 * SECURITY RULE: every route validates that server.software === 'pocketmine'.
 * If the server runs any other software the request is rejected with 403
 * POCKETMINE_WRONG_SOFTWARE.  This is enforced in the requirePocketMine()
 * middleware below — it runs before any handler touches Poggit.
 *
 * Routes
 * ──────
 * GET  /search                    — search Poggit plugin list (name/tag filter)
 * GET  /plugin/:name              — full plugin detail (latest release)
 * GET  /plugin/:name/releases     — all releases for a plugin
 * POST /install                   — download .phar into /plugins folder
 * POST /uninstall                 — delete a .phar from /plugins folder
 * GET  /installed                 — list .phar files in /plugins folder
 *
 * Data source: https://poggit.pmmp.io/releases.min.json  (public, no auth)
 */

'use strict';

const express  = require('express');
const https    = require('https');
const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const { authenticateToken }    = require('../core/auth');
const { checkPermission }      = require('../core/permissions');
const { getServer, getServerDir } = require('../core/serverHelper');
const { E, sendError }         = require('../core/errors');
const logger = require('../core/utils/logger');

const router = express.Router({ mergeParams: true });

// ─── Constants ────────────────────────────────────────────────────────────────

const POGGIT_RELEASES_URL = 'https://poggit.pmmp.io/releases.min.json';
const POGGIT_PLUGIN_URL   = (name) => `https://poggit.pmmp.io/releases.min.json?name=${encodeURIComponent(name)}`;
const PLUGINS_FOLDER      = 'plugins';

// In-memory cache so we don't hammer Poggit on every keystroke
const _cache = { data: null, fetchedAt: 0 };
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

/** Fetch JSON from a URL, following one redirect. */
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        lib.get(url, {
            headers: {
                'User-Agent': 'MinePanel/1.0 (PocketMine-Plugin-Resolver)',
                'Accept': 'application/json',
            },
            timeout: 15000,
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchJson(res.headers.location).then(resolve).catch(reject);
            }
            let body = '';
            res.on('data', chunk => (body += chunk));
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(body)); }
                    catch (e) { reject(new Error('Invalid JSON from Poggit')); }
                } else {
                    reject(new Error(`Poggit HTTP ${res.statusCode}`));
                }
            });
        }).on('error', reject)
          .on('timeout', function () { this.destroy(); reject(new Error('Poggit request timeout')); });
    });
}

/** Download a binary file, following redirects. */
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const attempt = (targetUrl) => {
            const parsed = new URL(targetUrl);
            const lib = parsed.protocol === 'https:' ? https : http;
            const fileStream = fs.createWriteStream(dest);
            lib.get(targetUrl, { headers: { 'User-Agent': 'MinePanel/1.0' }, timeout: 60000 }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    fileStream.close();
                    try { fs.unlinkSync(dest); } catch (_) {}
                    return attempt(res.headers.location);
                }
                if (res.statusCode !== 200) {
                    fileStream.close();
                    try { fs.unlinkSync(dest); } catch (_) {}
                    return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
                }
                res.pipe(fileStream);
                fileStream.on('finish', () => { fileStream.close(); resolve(); });
            }).on('error', (err) => {
                fileStream.close();
                try { fs.unlinkSync(dest); } catch (_) {}
                reject(err);
            });
        };
        attempt(url);
    });
}

// ─── Poggit data helpers ──────────────────────────────────────────────────────

/**
 * Returns the full Poggit releases list, using the in-memory cache.
 * The list contains one entry per release; multiple entries share the same
 * plugin name.
 */
async function getAllReleases() {
    const now = Date.now();
    if (_cache.data && (now - _cache.fetchedAt) < CACHE_TTL_MS) {
        return _cache.data;
    }
    const data = await fetchJson(POGGIT_RELEASES_URL);
    _cache.data = Array.isArray(data) ? data : [];
    _cache.fetchedAt = Date.now();
    return _cache.data;
}

/**
 * Normalize a raw Poggit release entry into a consistent shape.
 */
function normalizeRelease(entry) {
    return {
        name:        entry.name        || '',
        version:     entry.version     || '',
        api:         entry.api         || [],
        description: entry.tagline     || entry.description || '',
        icon:        entry.icon        || null,
        downloads:   entry.downloads   || 0,
        score:       entry.score       || 0,
        artifact:    entry.artifact_url || null,  // direct .phar download URL
        license:     entry.license     || '',
        state:       entry.state       || 0,
        authors:     Array.isArray(entry.authors) ? entry.authors : [],
        mainAuthor:  (Array.isArray(entry.authors) && entry.authors[0])
                        ? entry.authors[0].name : (entry.author || ''),
        repo:        entry.repo_name   || null,
        repoUrl:     entry.repo_name   ? `https://github.com/${entry.repo_name}` : null,
        poggitUrl:   entry.name        ? `https://poggit.pmmp.io/p/${encodeURIComponent(entry.name)}` : null,
        submittedAt: entry.submission_date || null,
    };
}

/**
 * Collapse multiple releases for the same plugin into a single entry
 * that carries the latest version plus a `releases` array.
 */
function collapseByPlugin(releases) {
    const map = new Map();
    for (const rel of releases) {
        const key = rel.name.toLowerCase();
        if (!map.has(key)) {
            map.set(key, { ...rel, releases: [rel] });
        } else {
            map.get(key).releases.push(rel);
        }
    }
    // Sort releases within each plugin newest-first (by version semver-ish)
    for (const entry of map.values()) {
        entry.releases.sort((a, b) => {
            const av = a.version.split('.').map(n => parseInt(n, 10) || 0);
            const bv = b.version.split('.').map(n => parseInt(n, 10) || 0);
            for (let i = 0; i < Math.max(av.length, bv.length); i++) {
                const d = (bv[i] || 0) - (av[i] || 0);
                if (d !== 0) return d;
            }
            return 0;
        });
        // Promote newest release's fields to the top-level entry
        Object.assign(entry, entry.releases[0]);
        entry.releases = entry.releases; // keep reference clean
    }
    return [...map.values()];
}

// ─── Middleware: require PocketMine ──────────────────────────────────────────

/**
 * Blocks access to every route in this router unless the server's software
 * is 'pocketmine'.  This is the primary architectural guard.
 */
async function requirePocketMine(req, res, next) {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        if (server.software.toLowerCase() !== 'pocketmine') {
            return sendError(res, E.POCKETMINE_WRONG_SOFTWARE, 403,
                `This endpoint is only available for PocketMine-MP servers. ` +
                `Your server runs '${server.software}'.`);
        }
        req._server = server; // cache so handlers don't re-query
        next();
    } catch (e) {
        logger.error('[pocketmineRoutes] requirePocketMine error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
}

// ─── GET /search ─────────────────────────────────────────────────────────────

router.get('/search', authenticateToken, requirePocketMine, async (req, res) => {
    const query  = (req.query.q || '').toLowerCase().trim();
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10)  || 24, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    try {
        const all      = await getAllReleases();
        const normalized = all.map(normalizeRelease);
        const collapsed  = collapseByPlugin(normalized);

        // Filter: only "approved" (state >= 2) plugins
        let filtered = collapsed.filter(p => p.state >= 2);

        if (query) {
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(query) ||
                p.description.toLowerCase().includes(query) ||
                p.mainAuthor.toLowerCase().includes(query)
            );
            // Relevance sort: exact name match first, then starts-with, then contains
            filtered.sort((a, b) => {
                const an = a.name.toLowerCase();
                const bn = b.name.toLowerCase();
                if (an === query && bn !== query) return -1;
                if (bn === query && an !== query) return 1;
                if (an.startsWith(query) && !bn.startsWith(query)) return -1;
                if (bn.startsWith(query) && !an.startsWith(query)) return 1;
                return (b.downloads || 0) - (a.downloads || 0);
            });
        } else {
            // Default sort: most downloaded
            filtered.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
        }

        const total = filtered.length;
        const page  = filtered.slice(offset, offset + limit);

        res.json({ hits: page, total, offset, limit });
    } catch (e) {
        logger.error('[pocketmineRoutes] /search error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, 'Failed to fetch from Poggit');
    }
});

// ─── GET /plugin/:name ───────────────────────────────────────────────────────

router.get('/plugin/:name', authenticateToken, requirePocketMine, async (req, res) => {
    try {
        const name = req.params.name;
        const all  = await getAllReleases();
        const normalized = all.map(normalizeRelease);
        const collapsed  = collapseByPlugin(normalized);
        const plugin = collapsed.find(p => p.name.toLowerCase() === name.toLowerCase());
        if (!plugin) return sendError(res, E.POCKETMINE_PLUGIN_NOT_FOUND, 404);
        res.json(plugin);
    } catch (e) {
        logger.error('[pocketmineRoutes] /plugin/:name error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── GET /plugin/:name/releases ──────────────────────────────────────────────

router.get('/plugin/:name/releases', authenticateToken, requirePocketMine, async (req, res) => {
    try {
        const name = req.params.name;
        const all  = await getAllReleases();
        const releases = all
            .map(normalizeRelease)
            .filter(r => r.name.toLowerCase() === name.toLowerCase())
            .sort((a, b) => {
                const av = a.version.split('.').map(n => parseInt(n, 10) || 0);
                const bv = b.version.split('.').map(n => parseInt(n, 10) || 0);
                for (let i = 0; i < Math.max(av.length, bv.length); i++) {
                    const d = (bv[i] || 0) - (av[i] || 0);
                    if (d !== 0) return d;
                }
                return 0;
            });
        if (!releases.length) return sendError(res, E.POCKETMINE_PLUGIN_NOT_FOUND, 404);
        res.json(releases);
    } catch (e) {
        logger.error('[pocketmineRoutes] /plugin/:name/releases error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── GET /installed ──────────────────────────────────────────────────────────

router.get('/installed', authenticateToken, checkPermission('server.files.read'), requirePocketMine, async (req, res) => {
    try {
        const server     = req._server;
        const pluginsDir = path.join(getServerDir(server), PLUGINS_FOLDER);
        if (!fs.existsSync(pluginsDir)) return res.json([]);

        const files = fs.readdirSync(pluginsDir)
            .filter(f => f.endsWith('.phar'))
            .map(f => {
                const filePath = path.join(pluginsDir, f);
                const stats    = fs.statSync(filePath);
                return { name: f, size: stats.size, modifiedAt: stats.mtime };
            });

        res.json(files);
    } catch (e) {
        logger.error('[pocketmineRoutes] /installed error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ─── POST /install ───────────────────────────────────────────────────────────

router.post('/install', authenticateToken, checkPermission('server.plugins.install'), requirePocketMine, async (req, res) => {
    const { pluginName, version } = req.body;
    if (!pluginName || typeof pluginName !== 'string') {
        return sendError(res, E.POCKETMINE_PLUGIN_NOT_FOUND, 400, 'pluginName is required');
    }

    try {
        const server = req._server;
        const all    = await getAllReleases();
        const normalized = all.map(normalizeRelease);

        // Find the requested release
        let release;
        if (version) {
            release = normalized.find(r =>
                r.name.toLowerCase() === pluginName.toLowerCase() &&
                r.version === version
            );
        } else {
            // Pick newest approved release
            const candidates = normalized
                .filter(r => r.name.toLowerCase() === pluginName.toLowerCase() && r.state >= 2)
                .sort((a, b) => {
                    const av = a.version.split('.').map(n => parseInt(n, 10) || 0);
                    const bv = b.version.split('.').map(n => parseInt(n, 10) || 0);
                    for (let i = 0; i < Math.max(av.length, bv.length); i++) {
                        const d = (bv[i] || 0) - (av[i] || 0);
                        if (d !== 0) return d;
                    }
                    return 0;
                });
            release = candidates[0] || null;
        }

        if (!release) return sendError(res, E.POCKETMINE_PLUGIN_NOT_FOUND, 404, `Plugin "${pluginName}" not found on Poggit`);
        if (!release.artifact) return sendError(res, E.POCKETMINE_INSTALL_FAILED, 500, 'No download URL available for this plugin');

        const pluginsDir = path.join(getServerDir(server), PLUGINS_FOLDER);
        if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

        // Sanitize filename: PluginName_1.2.3.phar
        const safeFilename = `${release.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}_${release.version}.phar`;
        const dest     = path.join(pluginsDir, safeFilename);
        const tempDest = `${dest}.download`;

        await downloadFile(release.artifact, tempDest);

        // Remove existing .phar files for the same plugin (different version)
        const existing = fs.readdirSync(pluginsDir).filter(f =>
            f.endsWith('.phar') &&
            f.toLowerCase().startsWith(release.name.toLowerCase().replace(/[^a-zA-Z0-9.\-_]/g, '_')) &&
            f !== safeFilename
        );
        for (const old of existing) {
            try { fs.unlinkSync(path.join(pluginsDir, old)); } catch (_) {}
        }

        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        fs.renameSync(tempDest, dest);

        logger.info(`[pocketmineRoutes] Installed ${safeFilename} for server ${server.id}`);
        res.json({ message: `Installed ${release.name} v${release.version} successfully.`, filename: safeFilename });
    } catch (e) {
        logger.error('[pocketmineRoutes] /install error:', e);
        return sendError(res, E.POCKETMINE_INSTALL_FAILED, 500, e.message);
    }
});

// ─── POST /uninstall ─────────────────────────────────────────────────────────

router.post('/uninstall', authenticateToken, checkPermission('server.plugins.install'), requirePocketMine, async (req, res) => {
    const { filename } = req.body;
    if (!filename || typeof filename !== 'string' || !filename.endsWith('.phar')) {
        return sendError(res, E.POCKETMINE_INVALID_FILENAME, 400, 'A valid .phar filename is required');
    }

    try {
        const server     = req._server;
        const pluginsDir = path.join(getServerDir(server), PLUGINS_FOLDER);
        const filePath   = path.join(pluginsDir, filename);

        // Path-traversal guard
        const expectedDir = path.resolve(pluginsDir);
        if (!path.resolve(filePath).startsWith(expectedDir)) {
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        }

        if (!fs.existsSync(filePath)) {
            return sendError(res, E.POCKETMINE_PLUGIN_NOT_FOUND, 404, `${filename} not found in plugins folder`);
        }

        fs.unlinkSync(filePath);
        logger.info(`[pocketmineRoutes] Uninstalled ${filename} from server ${server.id}`);
        res.json({ message: `Uninstalled ${filename}` });
    } catch (e) {
        logger.error('[pocketmineRoutes] /uninstall error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

module.exports = router;
