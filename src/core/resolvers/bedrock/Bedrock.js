/**
 * Bedrock.js  —  Vanilla Bedrock Dedicated Server (BDS)
 * ───────────────────────────────────────────────────────
 * Fetches the latest BDS version from the Minecraft Wiki API.
 * No minecraft.net scraping — pure API calls only.
 *
 * Data source:  https://minecraft.wiki/api.php
 * Cache file:   cache/resolvers/bds.json  (TTL 2 h)
 * Fallback:     stale cache → hardcoded constant
 */

'use strict';

const https = require('https');
const { makeCache } = require('./cache');

// ─── Config ───────────────────────────────────────────────────────────────────

const FALLBACK_VER = '1.26.23.1';
const cache        = makeCache('bds', 2 * 60 * 60 * 1000); // 2 h

const WIKI_REVISIONS_URL =
    'https://minecraft.wiki/api.php' +
    '?action=query' +
    '&titles=Bedrock_Dedicated_Server' +
    '&prop=revisions' +
    '&rvprop=content' +
    '&rvslots=main' +
    '&format=json' +
    '&formatversion=2';

const WIKI_PARSE_URL =
    'https://minecraft.wiki/api.php' +
    '?action=parse' +
    '&page=Bedrock_Dedicated_Server' +
    '&prop=wikitext' +
    '&format=json' +
    '&formatversion=2';

const WIKI_PAGEPROPS_URL =
    'https://minecraft.wiki/api.php' +
    '?action=query' +
    '&titles=Bedrock_Dedicated_Server' +
    '&prop=pageprops' +
    '&format=json' +
    '&formatversion=2';

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function fetchText(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            headers: {
                'User-Agent': 'MinePanel/1.0 (github.com/minepanel; version-resolver)',
                'Accept':     'application/json'
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => (body += chunk));
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
                else reject(new Error(`HTTP ${res.statusCode}`));
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

// ─── Version validation & extraction ─────────────────────────────────────────

function isValidBdsVersion(ver) {
    return /^\d+\.\d+\.\d+(\.\d+)?$/.test(ver);
}

/**
 * Extract the highest valid BDS version found in wikitext.
 *
 * Layer 1 — named infobox keys  (most specific)
 * Layer 2 — any param assignment whose value is a 4-part BDS version
 * Layer 3 — bare 4-part version anywhere in text  (last resort)
 *
 * All layers collect every match; we return the numerically highest one
 * so a page listing both "latest" and "previous" always resolves correctly.
 */
function extractVersionFromWikitext(wikitext) {
    const namedPatterns = [
        /\|\s*bedrock_version\s*=\s*([\d.]+)/gi,
        /\|\s*latest[_\s]bedrock[_\s]version\s*=\s*([\d.]+)/gi,
        /\|\s*latest[_\s]version\s*=\s*([\d.]+)/gi,
        /\|\s*version\s*=\s*([\d.]+)/gi,
    ];
    const assignmentPattern = /\|\s*[\w\s]+\s*=\s*(1\.\d{1,2}\.\d{1,3}\.\d{1,3})\b/g;
    const barePattern       = /\b(1\.\d{1,2}\.\d{1,3}\.\d{1,3})\b/g;

    const candidates = [];

    function collectAll(pattern) {
        pattern.lastIndex = 0;
        let m;
        while ((m = pattern.exec(wikitext)) !== null) {
            const v = m[1].trim();
            if (isValidBdsVersion(v)) candidates.push(v);
        }
    }

    for (const p of namedPatterns) collectAll(p);
    if (candidates.length === 0) collectAll(assignmentPattern);
    if (candidates.length === 0) collectAll(barePattern);
    if (candidates.length === 0) return null;

    return candidates.reduce((best, cur) => {
        const pb = best.split('.').map(Number);
        const pc = cur.split('.').map(Number);
        for (let i = 0; i < Math.max(pb.length, pc.length); i++) {
            const d = (pc[i] || 0) - (pb[i] || 0);
            if (d !== 0) return d > 0 ? cur : best;
        }
        return best;
    });
}

// ─── Wiki fetch strategies (pageprops → revisions → parse) ───────────────────

async function fetchFromPageProps() {
    const body  = await fetchText(WIKI_PAGEPROPS_URL);
    const json  = JSON.parse(body);
    const pages = json?.query?.pages;
    const page  = Array.isArray(pages) ? pages[0] : pages[Object.keys(pages)[0]];
    if (!page) throw new Error('No page in pageprops response');

    for (const [key, val] of Object.entries(page.pageprops || {})) {
        if (/version/i.test(key) && isValidBdsVersion(String(val).trim())) {
            return String(val).trim();
        }
    }
    throw new Error('No version-like pageprops found');
}

async function fetchFromRevisions() {
    const body  = await fetchText(WIKI_REVISIONS_URL);
    const json  = JSON.parse(body);
    const pages = json?.query?.pages;
    if (!pages) throw new Error('No pages in wiki response');

    const page = Array.isArray(pages) ? pages[0] : pages[Object.keys(pages)[0]];
    if (!page) throw new Error('No page in wiki response');

    const wikitext = page?.revisions?.[0]?.slots?.main?.content;
    if (!wikitext) throw new Error('No wikitext in revisions response');

    const version = extractVersionFromWikitext(wikitext);
    if (!version) throw new Error('Could not extract version from wikitext');
    return version;
}

async function fetchFromParse() {
    const body     = await fetchText(WIKI_PARSE_URL);
    const json     = JSON.parse(body);
    const wikitext = json?.parse?.wikitext;
    if (!wikitext) throw new Error('No wikitext in parse response');

    const version = extractVersionFromWikitext(wikitext);
    if (!version) throw new Error('Could not extract version from parse wikitext');
    return version;
}

// ─── Resolver ─────────────────────────────────────────────────────────────────

class BedrockResolver {
    /**
     * Returns:
     *   { version: string, source: 'minecraft-wiki'|'cache'|'fallback', lastUpdated: ISO }
     */
    async getLatestVersion() {
        const cached = cache.read();

        if (cache.isFresh(cached)) {
            return { version: cached.version, source: 'cache', lastUpdated: cached.lastUpdated };
        }

        // Try three strategies, most-stable first
        const strategies = [
            { name: 'pageprops', fn: fetchFromPageProps  },
            { name: 'revisions', fn: fetchFromRevisions  },
            { name: 'parse',     fn: fetchFromParse      },
        ];

        let version = null;
        for (const { name, fn } of strategies) {
            try {
                version = await fn();
                console.log(`[Bedrock] ${name} → ${version}`);
                break;
            } catch (e) {
                console.warn(`[Bedrock] ${name} failed: ${e.message}`);
            }
        }

        if (version) {
            const lastUpdated = new Date().toISOString();
            cache.write({ version, source: 'minecraft-wiki', lastUpdated });
            return { version, source: 'minecraft-wiki', lastUpdated };
        }

        // Stale cache fallback
        if (cached?.version) {
            console.warn(`[Bedrock] All live strategies failed — using stale cache ${cached.version}`);
            return { version: cached.version, source: 'cache', lastUpdated: cached.lastUpdated };
        }

        // Hard fallback
        console.warn(`[Bedrock] No cache available — returning hardcoded fallback ${FALLBACK_VER}`);
        return { version: FALLBACK_VER, source: 'fallback', lastUpdated: new Date().toISOString() };
    }
}

module.exports = new BedrockResolver();
