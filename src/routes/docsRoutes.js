const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { authenticateToken } = require('../core/auth');
const logger = require('../core/utils/logger');

const router = express.Router();

const DOCS_DIR = path.resolve(__dirname, '../docs');

/**
 * Default category display order. Lower number = appears first in sidebar.
 * Can be overridden per-file via frontmatter: category_order: <number>
 * Categories not listed here fall back to order 999 (alphabetical at the end).
 */
const CATEGORY_ORDER = {
    'getting-started': 1,
    'servers':         2,
    'users':           3,
    'discord':         4,
    'advanced':        5,
};

/**
 * Parse YAML-style frontmatter from a markdown string.
 * Returns { meta, content } where content has the frontmatter block stripped.
 */
function parseFrontmatter(raw) {
    const fm = {};
    if (!raw.startsWith('---')) return { meta: fm, content: raw };

    const end = raw.indexOf('\n---', 3);
    if (end === -1) return { meta: fm, content: raw };

    const block = raw.slice(3, end).trim();
    const content = raw.slice(end + 4).trimStart();

    for (const line of block.split('\n')) {
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        const key = line.slice(0, colon).trim();
        let value = line.slice(colon + 1).trim();
        if (value === 'true') value = true;
        else if (value === 'false') value = false;
        else if (!isNaN(value) && value !== '') value = Number(value);
        fm[key] = value;
    }

    return { meta: fm, content };
}

/**
 * Recursively scan a directory and return all .md file paths.
 */
async function scanDocs(dir) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const nested = await scanDocs(fullPath);
            files.push(...nested);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push(fullPath);
        }
    }
    return files;
}

/**
 * Build a slug from a file path relative to DOCS_DIR.
 * e.g.  getting-started/welcome.md  →  getting-started/welcome
 */
function toSlug(filePath) {
    return path.relative(DOCS_DIR, filePath)
        .replace(/\\/g, '/')
        .replace(/\.md$/, '');
}

// GET /api/docs — return full doc tree (meta + content)
router.get('/', authenticateToken, async (req, res) => {
    try {
        if (!fs.existsSync(DOCS_DIR)) {
            return res.json([]);
        }

        const files = await scanDocs(DOCS_DIR);
        const docs = [];

        for (const filePath of files) {
            try {
                const raw = await fsp.readFile(filePath, 'utf8');
                const { meta, content } = parseFrontmatter(raw);
                const slug = toSlug(filePath);
                const parts = slug.split('/');
                const category = meta.category || parts[0] || 'general';

                docs.push({
                    slug,
                    folder: parts.slice(0, -1).join('/') || '',
                    filename: parts[parts.length - 1],
                    title: meta.title || parts[parts.length - 1],
                    category,
                    type: meta.type || 'doc',
                    order: meta.order ?? 999,
                    // category_order: from frontmatter, fallback to CATEGORY_ORDER map, fallback to 999
                    category_order: meta.category_order ?? CATEGORY_ORDER[category] ?? 999,
                    content
                });
            } catch (fileErr) {
                logger.warn(`[docsRoutes] Could not read doc file: ${filePath}`, fileErr.message);
            }
        }

        // Sort: first by category_order, then by order within category
        docs.sort((a, b) => {
            if (a.category_order !== b.category_order) return a.category_order - b.category_order;
            if (a.category < b.category) return -1;
            if (a.category > b.category) return 1;
            return a.order - b.order;
        });

        res.json(docs);
    } catch (err) {
        logger.error('[docsRoutes] Error scanning docs:', err);
        res.status(500).json({ error: 'Failed to load documentation' });
    }
});

// GET /api/docs/:category/:page — return a single doc by slug
router.get('/:category/:page', authenticateToken, async (req, res) => {
    const { category, page } = req.params;
    const slug = `${category}/${page}`;

    if (slug.includes('..') || slug.includes('\\')) {
        return res.status(400).json({ error: 'Invalid path' });
    }

    const filePath = path.join(DOCS_DIR, `${slug}.md`);
    const resolved = path.resolve(filePath);

    if (!resolved.startsWith(DOCS_DIR)) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    if (!fs.existsSync(resolved)) {
        return res.status(404).json({ error: 'Doc not found' });
    }

    try {
        const raw = await fsp.readFile(resolved, 'utf8');
        const { meta, content } = parseFrontmatter(raw);
        const parts = slug.split('/');
        const category_name = meta.category || parts[0] || 'general';

        res.json({
            slug,
            folder: parts.slice(0, -1).join('/') || '',
            filename: parts[parts.length - 1],
            title: meta.title || parts[parts.length - 1],
            category: category_name,
            type: meta.type || 'doc',
            order: meta.order ?? 999,
            category_order: meta.category_order ?? CATEGORY_ORDER[category_name] ?? 999,
            content
        });
    } catch (err) {
        logger.error(`[docsRoutes] Error reading doc ${slug}:`, err);
        res.status(500).json({ error: 'Failed to load document' });
    }
});

module.exports = router;
