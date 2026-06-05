// src/core/diskUsage.js
// Calculates disk usage for a server directory (recursive, non-blocking).

const fs   = require('fs');
const path = require('path');

/**
 * Returns total size in bytes of all files under `dirPath`.
 * Returns 0 if the directory doesn't exist or can't be read.
 */
async function getDirSize(dirPath) {
    let total = 0;
    try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        const tasks = entries.map(async (entry) => {
            const full = path.join(dirPath, entry.name);
            if (entry.isSymbolicLink()) return 0;
            if (entry.isDirectory()) return getDirSize(full);
            try {
                const stat = await fs.promises.stat(full);
                return stat.size;
            } catch (_) { return 0; }
        });
        const sizes = await Promise.all(tasks);
        total = sizes.reduce((a, b) => a + b, 0);
    } catch (_) {}
    return total;
}

module.exports = { getDirSize };
