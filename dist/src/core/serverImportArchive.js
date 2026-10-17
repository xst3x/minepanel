"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_IMPORT_RATIO = exports.MAX_IMPORT_METADATA = exports.MAX_IMPORT_ENTRIES = void 0;
exports.validateImportPath = validateImportPath;
exports.validateImportEntry = validateImportEntry;
exports.extractServerImport = extractServerImport;
const fs = require("fs");
const path = require("path");
const stream_1 = require("stream");
const promises_1 = require("stream/promises");
const zlib_1 = require("zlib");
const StreamZip = require("node-stream-zip");
const importResources_1 = require("./importResources");
// Limits on archive complexity and amplification, never on archive/file bytes.
exports.MAX_IMPORT_ENTRIES = 100000;
exports.MAX_IMPORT_METADATA = 32 * 1024 * 1024;
exports.MAX_IMPORT_RATIO = 1000;
const ALLOWED_TOP_LEVEL = new Set([
    'plugins', 'mods', 'config', 'server.properties', 'eula.txt', 'ops.json', 'whitelist.json',
    'banned-players.json', 'banned-ips.json', 'permissions.yml', 'usercache.json', 'help.yml',
    'commands.yml', 'bukkit.yml', 'spigot.yml', 'paper.yml', 'paper-global.yml', 'paper-world-defaults.yml',
]);
async function readAt(file, position, length) {
    (0, importResources_1.safeBytes)(position);
    const buffer = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
        const { bytesRead } = await file.read(buffer, offset, length - offset, position + offset);
        if (!bytesRead)
            throw new Error('Truncated ZIP archive');
        offset += bytesRead;
    }
    return buffer;
}
function uint64(buffer, offset) {
    const value = buffer.readBigUInt64LE(offset);
    if (value > BigInt(Number.MAX_SAFE_INTEGER))
        throw new Error('ZIP64 value exceeds the safe numeric range');
    return Number(value);
}
/** Validate the footer before passing it to the dependency. In particular, a
 * forged ZIP64 locator must not make its backwards scanner buffer a whole ZIP. */
async function checkDirectory(file, size) {
    const tailSize = Math.min(size, 65557);
    const tail = await readAt(file, size - tailSize, tailSize);
    const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (end < 0 || end + 22 > tail.length || end + 22 + tail.readUInt16LE(end + 20) !== tail.length)
        throw new Error('Invalid ZIP footer');
    if (tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6))
        throw new Error('Multi-volume ZIP archives are not supported');
    let count = tail.readUInt16LE(end + 10);
    let directorySize = tail.readUInt32LE(end + 12);
    let directoryOffset = tail.readUInt32LE(end + 16);
    let directoryEnd = size - tailSize + end;
    if (count === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
        const locator = await readAt(file, directoryEnd - 20, 20);
        if (locator.readUInt32LE(0) !== 0x07064b50 || locator.readUInt32LE(4) !== 0 || locator.readUInt32LE(16) !== 1)
            throw new Error('Invalid ZIP64 locator');
        const offset = uint64(locator, 8);
        if (offset > directoryEnd - 76 || directoryEnd - offset > exports.MAX_IMPORT_METADATA)
            throw new Error('Invalid ZIP64 footer offset');
        const record = await readAt(file, offset, directoryEnd - offset);
        if (record.readUInt32LE(0) !== 0x06064b50 || uint64(record, 4) < 44 || uint64(record, 4) + 12 !== record.length - 20 ||
            record.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06])) !== 0 ||
            record.readUInt32LE(16) || record.readUInt32LE(20))
            throw new Error('Invalid ZIP64 footer');
        count = uint64(record, 32);
        if (uint64(record, 24) !== count)
            throw new Error('Invalid ZIP64 entry count');
        directorySize = uint64(record, 40);
        directoryOffset = uint64(record, 48);
        directoryEnd = offset;
    }
    else if (tail.readUInt16LE(end + 8) !== count)
        throw new Error('Invalid ZIP entry count');
    if (count > exports.MAX_IMPORT_ENTRIES || directorySize > exports.MAX_IMPORT_METADATA)
        throw new Error('Archive metadata exceeds the import complexity limit');
    if ((0, importResources_1.safeBytes)(directoryOffset + directorySize) !== directoryEnd || count * 46 > directorySize)
        throw new Error('Invalid ZIP directory bounds');
    return { count, directoryOffset, directorySize };
}
function validateImportPath(name) {
    const normalized = name.replace(/\\/g, '/');
    const parts = normalized.replace(/\/$/, '').split('/');
    if (!normalized || normalized.startsWith('/') || parts.some(part => !part || part === '.' || part === '..' ||
        /[\x00-\x1f<>:"|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
        throw new Error('Unsafe path in server import archive');
    }
    return normalized;
}
function validateImportEntry(entry, directoryOffset) {
    validateImportPath(entry.name);
    (0, importResources_1.safeBytes)(entry.size);
    (0, importResources_1.safeBytes)(entry.compressedSize);
    (0, importResources_1.safeBytes)(entry.offset);
    if ((0, importResources_1.safeBytes)(entry.offset + 30 + entry.compressedSize) > directoryOffset)
        throw new Error('Invalid ZIP entry bounds');
    const kind = (entry.attr >>> 16) & 0xf000;
    if (kind && kind !== 0x8000 && kind !== 0x4000)
        throw new Error('Archive links and special files are not allowed');
    if (entry.encrypted || (entry.method !== 0 && entry.method !== 8))
        throw new Error('Encrypted or unsupported ZIP entry');
    if (entry.size / Math.max(1, entry.compressedSize) > exports.MAX_IMPORT_RATIO)
        throw new Error('Archive compression ratio exceeds the ZIP bomb protection limit');
    if (entry.isDirectory && (entry.size || entry.compressedSize))
        throw new Error('Invalid ZIP directory entry');
}
async function readEntries(zipPath, count, directoryOffset, directorySize, signal) {
    if (!count)
        return [];
    const zip = new StreamZip({ file: zipPath, storeEntries: false, chunkSize: 64 * 1024 });
    const entries = [];
    let metadataBytes = 0;
    try {
        await new Promise((resolve, reject) => {
            zip.on('error', reject);
            zip.on('entry', entry => {
                signal?.throwIfAborted();
                if (entries.length >= count)
                    throw new Error('Invalid ZIP entry count');
                const header = entry;
                const headerSize = 46 + header.fnameLen + header.extraLen + header.comLen;
                metadataBytes += headerSize;
                if (metadataBytes > directorySize || header.headerOffset + headerSize > directoryOffset + directorySize)
                    throw new Error('ZIP entry exceeds directory bounds');
                validateImportEntry(entry, directoryOffset);
                entries.push(entry);
            });
            zip.on('ready', resolve);
        });
        if (entries.length !== count)
            throw new Error('Invalid ZIP entry count');
        return entries;
    }
    finally {
        // The dependency's async.close() cannot close after a parsing rejection.
        await new Promise((resolve, reject) => zip.close(error => error ? reject(error) : resolve()));
    }
}
async function extractEntry(file, archivePath, entry, destination, directoryOffset, signal) {
    const local = await readAt(file, entry.offset, 30);
    if (local.readUInt32LE(0) !== 0x04034b50 || local.readUInt16LE(6) !== entry.flags || local.readUInt16LE(8) !== entry.method)
        throw new Error('Invalid ZIP local header');
    const nameLength = local.readUInt16LE(26);
    const dataOffset = (0, importResources_1.safeBytes)(entry.offset + 30 + nameLength + local.readUInt16LE(28));
    if ((0, importResources_1.safeBytes)(dataOffset + entry.compressedSize) > directoryOffset)
        throw new Error('Invalid ZIP data bounds');
    const name = await readAt(file, entry.offset + 30, nameLength);
    if (name.toString('utf8') !== entry.name)
        throw new Error('ZIP entry name does not match local header');
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await (0, importResources_1.requireDiskSpace)(path.dirname(destination), entry.size);
    let checksum = 0;
    const verify = new stream_1.Transform({
        transform(chunk, _encoding, callback) { checksum = (0, zlib_1.crc32)(chunk, checksum); callback(null, chunk); },
        flush(callback) { callback(checksum === entry.crc ? undefined : new Error('ZIP entry checksum mismatch')); },
    });
    // Own every stage of the pipeline so disk errors/cancellation destroy the
    // inflater AND the compressed input. No entryData/readFile/whole-file Buffer.
    const input = entry.compressedSize ? fs.createReadStream(archivePath, {
        start: dataOffset, end: dataOffset + entry.compressedSize - 1, highWaterMark: 64 * 1024,
    }) : stream_1.Readable.from([]);
    await (0, promises_1.pipeline)(input, entry.method === 8 ? (0, zlib_1.createInflateRaw)() : new stream_1.PassThrough(), new importResources_1.ImportByteGuard(path.dirname(destination), entry.size), verify, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 }), { signal });
}
async function extractServerImport(archivePath, serverDir, rootPath = '', signal) {
    const root = rootPath.replace(/^[/\\]+/, '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (root)
        validateImportPath(root);
    const file = await fs.promises.open(archivePath, 'r');
    try {
        signal?.throwIfAborted();
        const size = (0, importResources_1.safeBytes)((await file.stat()).size);
        const { count, directoryOffset, directorySize } = await checkDirectory(file, size);
        const entries = await readEntries(archivePath, count, directoryOffset, directorySize, signal);
        const prefix = root ? root + '/' : '';
        const relative = (entry) => {
            const name = validateImportPath(entry.name);
            return name.startsWith(prefix) ? name.slice(prefix.length) : '';
        };
        const worlds = new Set();
        let scoped = 0;
        for (const entry of entries) {
            const rel = relative(entry);
            if (!rel)
                continue;
            scoped++;
            const parts = rel.split('/');
            if (!entry.isDirectory && parts.length === 2 && parts[1].toLowerCase() === 'level.dat')
                worlds.add(parts[0].toLowerCase());
        }
        if (!scoped)
            throw new Error(`No files found under path "${root}" inside the zip. Check the Server Root Path.`);
        const importable = (rel) => ALLOWED_TOP_LEVEL.has(rel.split('/')[0].toLowerCase()) || worlds.has(rel.split('/')[0].toLowerCase());
        let total = 0n;
        for (const entry of entries)
            if (relative(entry) && importable(relative(entry)))
                total += BigInt(entry.size);
        await (0, importResources_1.requireDiskSpace)(serverDir, total);
        const skippedTopLevel = new Set();
        let copiedFiles = 0;
        for (const entry of entries) {
            signal?.throwIfAborted();
            const rel = relative(entry);
            if (!rel)
                continue;
            if (!importable(rel)) {
                skippedTopLevel.add(rel.split('/')[0]);
                continue;
            }
            const destination = path.resolve(serverDir, rel);
            const containment = path.relative(serverDir, destination);
            if (containment.startsWith('..') || path.isAbsolute(containment))
                throw new Error('Unsafe archive destination');
            if (entry.isDirectory)
                await fs.promises.mkdir(destination, { recursive: true });
            else {
                await extractEntry(file, archivePath, entry, destination, directoryOffset, signal);
                copiedFiles++;
            }
        }
        return { copiedFiles, skippedTopLevel };
    }
    finally {
        await file.close();
    }
}
//# sourceMappingURL=serverImportArchive.js.map