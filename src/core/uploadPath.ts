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
