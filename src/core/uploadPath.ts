import { safeServerPath } from './safeServerPath';

/** A leading slash denotes the server root, never the host filesystem root. */
export function uploadDirectory(root: string, value: unknown): string {
    if (typeof value !== 'string' || /[\\:\x00-\x1f]/.test(value) || value.startsWith('//') || value.split('/').includes('..')) {
        throw new Error('Invalid upload path');
    }
    return safeServerPath(root, value);
}

export function validateUploadName(name: unknown): asserts name is string {
    if (typeof name !== 'string' || !name || name === '.' || name === '..' || /[/\\:\x00-\x1f]/.test(name) || /[. ]$/.test(name)) {
        throw new Error('Invalid filename');
    }
}

/** Folder upload names are relative to the chosen directory, never absolute. */
export function uploadRelativePath(value: unknown, name: string): string {
    if (value === undefined) return name;
    if (typeof value !== 'string' || !value || value.startsWith('/')) throw new Error('Invalid upload path');
    const parts = value.split('/');
    for (const part of parts) validateUploadName(part);
    if (parts[parts.length - 1] !== name) throw new Error('Invalid upload path');
    return parts.join('/');
}
