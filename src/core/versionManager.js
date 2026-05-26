const fs = require('fs');
const path = require('path');
const { fetchAllVersions } = require('./versionFetcher');

const CACHE_FILE = path.resolve(__dirname, '../../cache/versions.json');

// Default fallbacks in case APIs fail and we have no cache yet
const DEFAULTS = {
    vanilla: ['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2'],
    snapshots: ['24w30a', '24w29a', '24w14a'],
    paper: ['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2'],
    purpur: ['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2'],
    fabric: ['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2'],
    forge: ['1.21.1', '1.21', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2'],
    quilt: ['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.18.2', '1.16.5'],
    magma: ['1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.3', '1.18.2', '1.12.2']
};

let cachedVersions = { ...DEFAULTS };
let lastFetchTime = 0;

// Load cache from disk
function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
            // Validate structure
            if (data && typeof data === 'object' && data.vanilla) {
                cachedVersions = data;
                // If it contains only the default fallback list, force fetch by setting lastFetchTime to 0
                const isDefaultList = data.vanilla.length === DEFAULTS.vanilla.length && data.vanilla[0] === DEFAULTS.vanilla[0];
                if (isDefaultList) {
                    lastFetchTime = 0;
                    console.log('[VersionManager] Loaded default versions list. Will fetch updates.');
                } else {
                    const stats = fs.statSync(CACHE_FILE);
                    lastFetchTime = stats.mtimeMs;
                    console.log('[VersionManager] Loaded versions cache from disk.');
                }
                return;
            }
        }
    } catch (e) {
        console.error('[VersionManager] Failed to read version cache:', e.message);
    }
    // If no cache, write defaults to disk but set lastFetchTime to 0 so it forces a fetch!
    saveCache(DEFAULTS, true);
}

function saveCache(data, isDefault = false) {
    try {
        const dir = path.dirname(CACHE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
        lastFetchTime = isDefault ? 0 : Date.now();
    } catch (e) {
        console.error('[VersionManager] Failed to save version cache to disk:', e.message);
    }
}

async function updateVersions(force = false) {
    const now = Date.now();
    const oneHourMs = 1 * 60 * 60 * 1000;
    
    // Check if we need to fetch
    if (!force && (now - lastFetchTime < oneHourMs) && lastFetchTime > 0) {
        console.log('[VersionManager] Version list is up to date (less than 1 hour old).');
        return;
    }

    try {
        console.log('[VersionManager] Fetching fresh versions...');
        const newVersions = await fetchAllVersions();
        
        // Merge with defaults/current if any API failed and returned empty
        for (const key of Object.keys(DEFAULTS)) {
            if (!newVersions[key] || newVersions[key].length === 0) {
                newVersions[key] = cachedVersions[key] || DEFAULTS[key];
                console.warn(`[VersionManager] API for ${key} returned empty, using cached/default versions.`);
            }
        }

        cachedVersions = newVersions;
        saveCache(cachedVersions);
        console.log('[VersionManager] Successfully updated version list cache.');
    } catch (e) {
        console.error('[VersionManager] Failed to update versions:', e.message);
    }
}

function getVersions() {
    return cachedVersions;
}

function init() {
    loadCache();
    // Run async update on startup
    updateVersions().catch(err => console.error('[VersionManager] Startup version update failed:', err.message));
    
    // Schedule update every 1 hour
    setInterval(() => {
        updateVersions().catch(err => console.error('[VersionManager] Scheduled version update failed:', err.message));
    }, 1 * 60 * 60 * 1000);
}

module.exports = {
    init,
    getVersions,
    updateVersions
};
