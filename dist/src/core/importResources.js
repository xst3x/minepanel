"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImportByteGuard = exports.DISK_CHECK_INTERVAL = exports.DISK_RESERVE = void 0;
exports.safeBytes = safeBytes;
exports.requireDiskSpace = requireDiskSpace;
const fs = require("fs");
const stream_1 = require("stream");
// Resource protections, not an archive-size ceiling. Keep headroom for the
// database, logs and the freshly downloaded server binary on the same volume.
exports.DISK_RESERVE = 256n * 1024n * 1024n;
exports.DISK_CHECK_INTERVAL = 64 * 1024 * 1024;
function safeBytes(value) {
    if (!Number.isSafeInteger(value) || value < 0)
        throw new Error('Invalid or unsafe byte count');
    return value;
}
async function requireDiskSpace(directory, bytes) {
    const required = typeof bytes === 'bigint' ? bytes : BigInt(safeBytes(bytes));
    const stat = await fs.promises.statfs(directory, { bigint: true });
    if (required < 0n || stat.bavail * stat.bsize < required + exports.DISK_RESERVE) {
        throw Object.assign(new Error('Insufficient disk space for server import'), { code: 'ENOSPC' });
    }
}
/** Backpressure is preserved while checking the actual bytes, including for
 * chunked uploads and archives with dishonest size metadata. */
class ImportByteGuard extends stream_1.Transform {
    constructor(directory, expected) {
        super();
        this.directory = directory;
        this.expected = expected;
        this.bytes = 0;
        this.nextCheck = 0;
        if (expected !== undefined)
            safeBytes(expected);
    }
    _transform(chunk, _encoding, callback) {
        try {
            this.bytes = safeBytes(this.bytes + chunk.length);
            if (this.expected !== undefined && this.bytes > this.expected) {
                throw new Error('Archive entry exceeds its declared size');
            }
        }
        catch (error) {
            callback(error);
            return;
        }
        if (this.bytes >= this.nextCheck) {
            this.nextCheck = this.bytes + exports.DISK_CHECK_INTERVAL;
            requireDiskSpace(this.directory, chunk.length).then(() => callback(null, chunk), error => callback(error));
        }
        else
            callback(null, chunk);
    }
    _flush(callback) {
        callback(this.expected !== undefined && this.bytes !== this.expected
            ? new Error('Archive entry does not match its declared size') : undefined);
    }
}
exports.ImportByteGuard = ImportByteGuard;
//# sourceMappingURL=importResources.js.map