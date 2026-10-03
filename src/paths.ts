import fs = require('fs');
import path = require('path');
import dotenv = require('dotenv');

// Resolve the installation from this module, never from the caller's working
// directory. The same lookup works in src/ and dist/src/, including services.
function findProjectRoot(): string {
    let directory = __dirname;
    while (true) {
        const manifest = path.join(directory, 'package.json');
        if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).name === 'minepanel') {
            return directory;
        }
        const parent = path.dirname(directory);
        if (parent === directory) throw new Error('Cannot locate the MinePanel installation (package.json).');
        directory = parent;
    }
}

export const PROJECT_ROOT = findProjectRoot();
export const ENV_FILE = path.join(PROJECT_ROOT, '.env');
// Load before deriving paths so direct CLI, worker and launcher entrypoints all
// honor the same .env. Existing process environment values retain precedence.
dotenv.config({ path: ENV_FILE });

const configuredDataDir = process.env.DATA_DIR
    ? path.resolve(PROJECT_ROOT, process.env.DATA_DIR)
    : undefined;
export const DATA_DIR = configuredDataDir || path.join(PROJECT_ROOT, 'data');
export const DB_DIR = configuredDataDir ? path.join(DATA_DIR, 'db') : DATA_DIR;
export const SERVERS_DIR = configuredDataDir ? path.join(DATA_DIR, 'servers') : path.join(PROJECT_ROOT, 'servers');
export const SETTINGS_FILE = path.join(configuredDataDir || PROJECT_ROOT, 'settings.json');
export const AVATARS_DIR = path.join(DATA_DIR, 'avatars');
export const MODPACK_ICON_CACHE_DIR = configuredDataDir
    ? path.join(DATA_DIR, 'modpack-icon-cache')
    : path.join(PROJECT_ROOT, 'cache', 'modpack-icons');
// Preserve the pre-dist crash-recovery location (a sibling data directory).
// Do not silently relocate or discard existing running-server records.
export const PROCESS_DATA_DIR = configuredDataDir || path.resolve(PROJECT_ROOT, '..', 'data');
