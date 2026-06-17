/**
 * cache.js
 * ────────
 * Shared file-based cache helpers for all bedrock/* resolvers.
 * Each resolver gets its own JSON file under /cache/resolvers/.
 *
 * Usage:
 *   const { makeCache } = require('./cache');
 *   const cache = makeCache('pocketmine', 45 * 60 * 1000);
 *
 *   const hit = cache.read();          // null | object
 *   cache.isFresh(hit)                 // bool
 *   cache.write({ version, ... });
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '../../../../cache/resolvers');

function ensureDir() {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Create a cache handle for a named resolver.
 * @param {string} name    - filename stem, e.g. 'pocketmine'  → cache/resolvers/pocketmine.json
 * @param {number} ttlMs   - freshness window in milliseconds
 */
function makeCache(name, ttlMs) {
    const file = path.join(CACHE_DIR, `${name}.json`);

    return {
        read() {
            try {
                if (!fs.existsSync(file)) return null;
                return JSON.parse(fs.readFileSync(file, 'utf8'));
            } catch {
                return null;
            }
        },

        write(data) {
            try {
                ensureDir();
                fs.writeFileSync(file, JSON.stringify({ ...data, _cachedAt: Date.now() }, null, 2), 'utf8');
            } catch (e) {
                console.warn(`[cache:${name}] Write failed: ${e.message}`);
            }
        },

        isFresh(cached) {
            if (!cached?._cachedAt) return false;
            return Date.now() - cached._cachedAt < ttlMs;
        }
    };
}

module.exports = { makeCache };
