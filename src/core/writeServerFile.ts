import fs = require('fs');
import { createHash } from 'crypto';
import { safeServerPath } from './safeServerPath';

/** No await between compare and write: panel requests cannot interleave this critical section. */
export function writeServerFile(root: string, relative: string, content: string, expectedVersion?: string) {
    const target = safeServerPath(root, relative);
    if (expectedVersion && createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== expectedVersion) {
        const error = new Error('File changed; read it again before writing') as Error & { code: string };
        error.code = 'VERSION_CONFLICT';
        throw error;
    }
    fs.writeFileSync(target, content, 'utf8');
}
