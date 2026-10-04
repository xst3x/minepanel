import fs = require('fs');
import { SETTINGS_FILE } from '../paths';

// Deliberately exclude URL syntax, encoded characters and Express path patterns.
export function normalizeBasePath(value: string): string {
    const input = value.trim();
    if (input === '/') return '/';
    if (input.length > 256 || !/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\/?$/.test(input)) {
        throw new Error('Base path must be / or a path such as /panel/ (letters, numbers, hyphens and underscores).');
    }
    return input.replace(/\/$/, '') + '/';
}

export function configuredBasePath(): string {
    if (process.env.BASE_PATH !== undefined) return normalizeBasePath(process.env.BASE_PATH);
    let settings: { basePath?: string } = {};
    try { settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch (_) {}
    return normalizeBasePath(settings.basePath ?? '/');
}
