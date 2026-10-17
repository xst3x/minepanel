import fs = require('fs');
import { Transform, TransformCallback } from 'stream';

// Resource protections, not an archive-size ceiling. Keep headroom for the
// database, logs and the freshly downloaded server binary on the same volume.
export const DISK_RESERVE = 256n * 1024n * 1024n;
export const DISK_CHECK_INTERVAL = 64 * 1024 * 1024;

export function safeBytes(value: number): number {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid or unsafe byte count');
    return value;
}

export async function requireDiskSpace(directory: string, bytes: number | bigint): Promise<void> {
    const required = typeof bytes === 'bigint' ? bytes : BigInt(safeBytes(bytes));
    const stat = await fs.promises.statfs(directory, { bigint: true });
    if (required < 0n || stat.bavail * stat.bsize < required + DISK_RESERVE) {
        throw Object.assign(new Error('Insufficient disk space for server import'), { code: 'ENOSPC' });
    }
}

/** Backpressure is preserved while checking the actual bytes, including for
 * chunked uploads and archives with dishonest size metadata. */
export class ImportByteGuard extends Transform {
    bytes = 0;
    private nextCheck = 0;
    constructor(private directory: string, private expected?: number) {
        super();
        if (expected !== undefined) safeBytes(expected);
    }
    _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
        try {
            this.bytes = safeBytes(this.bytes + chunk.length);
            if (this.expected !== undefined && this.bytes > this.expected) {
                throw new Error('Archive entry exceeds its declared size');
            }
        } catch (error) { callback(error as Error); return; }
        if (this.bytes >= this.nextCheck) {
            this.nextCheck = this.bytes + DISK_CHECK_INTERVAL;
            requireDiskSpace(this.directory, chunk.length).then(
                () => callback(null, chunk), error => callback(error));
        } else callback(null, chunk);
    }
    _flush(callback: TransformCallback) {
        callback(this.expected !== undefined && this.bytes !== this.expected
            ? new Error('Archive entry does not match its declared size') : undefined);
    }
}
