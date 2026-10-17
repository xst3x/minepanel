import fs = require('fs');
import os = require('os');
import path = require('path');
import { Readable, Writable } from 'stream';
import { pipeline } from 'stream/promises';
import { EventEmitter } from 'events';
import { safeBytes, requireDiskSpace, ImportByteGuard, DISK_RESERVE } from '../src/core/importResources';
import { extractServerImport, validateImportEntry, validateImportPath } from '../src/core/serverImportArchive';
import { createImportStorage } from '../src/middleware/serverImportUpload';
import { setImportedServerPort } from '../src/core/importServerProperties';

const yazl = require('yazl');
let directory: string;
beforeEach(async () => { directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'minepanel-import-test-')); });
afterEach(async () => { jest.restoreAllMocks(); await fs.promises.rm(directory, { recursive: true, force: true }); });

async function archive(files: Record<string, Buffer | string>, options = {}, compress = true): Promise<Buffer> {
    const zip = new yazl.ZipFile();
    for (const [name, data] of Object.entries(files)) zip.addBuffer(Buffer.isBuffer(data) ? data : Buffer.from(data), name, { compress, ...options });
    const chunks = [];
    const done = new Promise<Buffer>((resolve, reject) => {
        zip.outputStream.on('data', chunk => chunks.push(chunk));
        zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
        zip.outputStream.on('error', reject);
    });
    zip.end(options);
    return done;
}

async function extract(buffer: Buffer, root = '', signal?: AbortSignal) {
    const zipPath = path.join(directory, 'input.zip');
    const out = path.join(directory, 'server');
    await fs.promises.writeFile(zipPath, buffer);
    await fs.promises.mkdir(out, { recursive: true });
    return extractServerImport(zipPath, out, root, signal);
}

describe('large import byte accounting', () => {
    test.each([2 ** 31, 2 ** 32, 10 * 2 ** 30, 50 * 2 ** 30, 100 * 2 ** 30, 1024 * 2 ** 30, Number.MAX_SAFE_INTEGER])('accepts %s bytes without 32-bit truncation', size => {
        expect(safeBytes(size)).toBe(size);
        expect(() => validateImportEntry({ name: 'world/region/file.mca', size, compressedSize: Math.ceil(size / 2), offset: 0, attr: 0, method: 8 } as any, Number.MAX_SAFE_INTEGER)).not.toThrow();
    });
    test.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe byte count %s', size => {
        expect(() => safeBytes(size)).toThrow();
    });
    test('keeps disk capacity exact above Number.MAX_SAFE_INTEGER', async () => {
        const capacity = BigInt(Number.MAX_SAFE_INTEGER) + 1000n;
        jest.spyOn(fs.promises, 'statfs').mockResolvedValue({ bsize: 1n, bavail: capacity } as any);
        await expect(requireDiskSpace(directory, capacity - DISK_RESERVE)).resolves.toBeUndefined();
        await expect(requireDiskSpace(directory, capacity - DISK_RESERVE + 1n)).rejects.toMatchObject({ code: 'ENOSPC' });
    });
    test('stream counter crosses 100 GiB using a simulated starting offset', async () => {
        const guard = new ImportByteGuard(directory);
        guard.bytes = 100 * 2 ** 30 - 8;
        await pipeline(Readable.from([Buffer.alloc(16)]), guard, new Writable({ write(_chunk, _encoding, cb) { cb(); } }));
        expect(guard.bytes).toBe(100 * 2 ** 30 + 8);
    });
    test('actual output cannot exceed or fall short of declared size', async () => {
        for (const size of [1, 3]) {
            await expect(pipeline(Readable.from([Buffer.alloc(2)]), new ImportByteGuard(directory, size),
                new Writable({ write(_chunk, _encoding, cb) { cb(); } }))).rejects.toThrow(/declared size/);
        }
    });
});

describe('streaming ZIP import', () => {
    test('reads ZIP64 headers and payload at a virtual 100 GiB offset using only a tiny fixture', async () => {
        const data = await archive({ 'config/a': 'large-offset-data' }, { forceZip64Format: true }, false);
        const shift = 100 * 2 ** 30;
        const central = data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
        const extra = central + 46 + data.readUInt16LE(central + 28);
        data.writeBigUInt64LE(BigInt(shift), extra + 20);
        const footer = data.indexOf(Buffer.from([0x50, 0x4b, 0x06, 0x06]));
        data.writeBigUInt64LE(BigInt(shift + central), footer + 48);
        const locator = data.indexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
        data.writeBigUInt64LE(BigInt(shift + footer), locator + 8);
        const virtualRead = (buffer: Buffer, offset: number, length: number, position: number) => {
            buffer.fill(0, offset, offset + length);
            const from = Math.max(position, shift);
            const until = Math.min(position + length, shift + data.length);
            if (until > from) data.copy(buffer, offset + from - position, from - shift, until - shift);
            return length;
        };
        const StreamZip = require('node-stream-zip');
        const originalOpen = fs.promises.open.bind(fs.promises);
        const open = jest.spyOn(fs.promises, 'open').mockImplementation(async (file, flags, mode) => {
            if (file !== 'virtual.zip') return originalOpen(file, flags, mode);
            return { stat: async () => ({ size: shift + data.length }), close: async () => {},
                read: async (buffer, offset, length, position) => ({ bytesRead: virtualRead(buffer, offset, length, position) }) } as any;
        });
        const originalReadStream = fs.createReadStream.bind(fs);
        const reads = jest.spyOn(fs, 'createReadStream').mockImplementation((file, options: any) => {
            if (file !== 'virtual.zip') return originalReadStream(file, options);
            expect(options.start).toBeGreaterThan(shift);
            return Readable.from([data.subarray(options.start - shift, options.end - shift + 1)]) as any;
        });
        StreamZip.setFs({ ...fs,
            open: (_file, _flags, cb) => setImmediate(() => cb(null, 999)),
            fstat: (_fd, cb) => setImmediate(() => cb(null, { size: shift + data.length })),
            read: (_fd, buffer, offset, length, position, cb) => setImmediate(() => cb(null, virtualRead(buffer, offset, length, position), buffer)),
            close: (_fd, cb) => setImmediate(() => cb(null)),
        });
        try {
            expect((await extractServerImport('virtual.zip', directory)).copiedFiles).toBe(1);
            expect(await fs.promises.readFile(path.join(directory, 'config/a'), 'utf8')).toBe('large-offset-data');
        } finally { StreamZip.setFs(fs); open.mockRestore(); reads.mockRestore(); }
    });
    test.each([false, true])('imports ordinary/ZIP64 ZIP (ZIP64=%s), selecting custom worlds and preserving exclusions', async forceZip64Format => {
        const result = await extract(await archive({
            'backup/custom/level.dat': 'world', 'backup/custom/region/r.0.0.mca': 'regions',
            'backup/plugins/plugin.jar': 'plugin', 'backup/server.properties': 'server-port=25565',
            'backup/server.jar': 'old binary', 'backup/logs/latest.log': 'old log',
        }, { forceZip64Format }), 'backup');
        expect(result.copiedFiles).toBe(4);
        expect([...result.skippedTopLevel]).toEqual(['server.jar', 'logs']);
        expect(await fs.promises.readFile(path.join(directory, 'server/custom/region/r.0.0.mca'), 'utf8')).toBe('regions');
    });
    test('stored entries and empty files work', async () => {
        expect((await extract(await archive({ 'config/a': 'data', 'config/empty': '' }, {}, false))).copiedFiles).toBe(2);
    });
    test('rejects a ZIP bomb before writing output', async () => {
        await expect(extract(await archive({ 'config/bomb': Buffer.alloc(4 * 1024 * 1024) }))).rejects.toThrow(/compression ratio/);
        expect(await fs.promises.readdir(path.join(directory, 'server'))).toEqual([]);
    });
    test('rejects malformed footer and ZIP64 locator without crashing or large allocation', async () => {
        await expect(extract(Buffer.from('not a zip'))).rejects.toThrow();
        const data = await archive({ 'config/a': 'data' }, { forceZip64Format: true });
        const locator = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
        data.writeBigUInt64LE(2n ** 63n, locator + 8);
        await expect(extract(data)).rejects.toThrow(/safe numeric range/);
    });
    test('rejects excessive metadata before parsing entries', async () => {
        const data = await archive({ 'config/a': 'data' });
        data.writeUInt32LE(33 * 1024 * 1024, data.length - 22 + 12);
        await expect(extract(data)).rejects.toThrow(/complexity limit/);
    });
    test('CRC errors are detected even when the entry uses a data descriptor', async () => {
        const data = await archive({ 'config/a': 'data' }, {}, false);
        const central = data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
        data.writeUInt32LE(12345, central + 16);
        await expect(extract(data)).rejects.toThrow(/checksum/);
    });
    test('symlinks and duplicate files are rejected', async () => {
        const data = await archive({ 'config/a': 'data' });
        const central = data.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
        data.writeUInt32LE(0xa1ff0000, central + 38);
        await expect(extract(data)).rejects.toThrow(/links/);
        const duplicate = await archive({ 'config/a': 'one', 'config/b': 'two' });
        const changed = Buffer.from(duplicate.toString('latin1').replaceAll('config/b', 'config/a'), 'latin1');
        await expect(extract(changed)).rejects.toMatchObject({ code: 'EEXIST' });
    });
    test('disk-space failures and cancellation reject cleanly', async () => {
        const data = await archive({ 'config/a': 'data' });
        const controller = new AbortController();
        controller.abort();
        await expect(extract(data, '', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
        jest.spyOn(fs.promises, 'statfs').mockResolvedValue({ bsize: 4096n, bavail: 0n } as any);
        await expect(extract(data)).rejects.toMatchObject({ code: 'ENOSPC' });
    });
    test('write failure is handled by pipeline, not an unhandled stream error', async () => {
        const data = await archive({ 'config/a': 'data' });
        jest.spyOn(fs, 'createWriteStream').mockImplementation(() => new Writable({
            write(_chunk, _encoding, callback) { callback(Object.assign(new Error('Disk full'), { code: 'ENOSPC' })); },
        }) as any);
        await expect(extract(data)).rejects.toMatchObject({ code: 'ENOSPC' });
    });
    test.each(['../escape', '/absolute', 'config/../../escape', 'config\\..\\escape', 'C:\\escape', 'config/a:stream', 'config/NUL', 'config/a.'])('rejects unsafe path %s', name => {
        expect(() => validateImportPath(name)).toThrow(/Unsafe path/);
    });
});

describe('streaming imported server.properties update', () => {
    test.each([
        ['server-port=1\r\nmotd=test', 'server-port=25565\r\nmotd=test'],
        ['motd=test\rserver-port=1\rkept=yes', 'motd=test\rserver-port=25565\rkept=yes'],
        ['motd=test', 'motd=test\nserver-port=25565\n'],
        ['server-port=1\nserver-port=2', 'server-port=25565\nserver-port=2'],
        ['server-po', 'server-po\nserver-port=25565\n'],
        ['x'.repeat(65530) + '\nserver-port=1\n', 'x'.repeat(65530) + '\nserver-port=25565\n'],
        ['server-port=' + 'x'.repeat(131072) + '\nkept=yes', 'server-port=25565\nkept=yes'],
    ])('preserves content and handles stream boundaries (case %#)', async (before, after) => {
        await fs.promises.writeFile(path.join(directory, 'server.properties'), before);
        await setImportedServerPort(directory, 25565);
        expect(await fs.promises.readFile(path.join(directory, 'server.properties'), 'utf8')).toBe(after);
        expect(await fs.promises.readdir(directory)).toEqual(['server.properties']);
    });
});

describe('disk upload storage', () => {
    function upload(stream: Readable, controller = new AbortController(), length?: string) {
        const req = Object.assign(new EventEmitter(), { headers: { 'content-length': length }, importSignal: controller.signal });
        return new Promise<any>((resolve, reject) => createImportStorage(directory)._handleFile(req as any,
            { stream } as any, (error, file) => error ? reject(error) : resolve(file)));
    }
    test('accepts a 100 GiB content length without buffering it', async () => {
        jest.spyOn(fs.promises, 'statfs').mockResolvedValue({ bsize: 4096n, bavail: 2n ** 40n } as any);
        const result = await upload(Readable.from([Buffer.from('hello')]), undefined, String(100 * 2 ** 30));
        expect(result.size).toBe(5);
        expect(await fs.promises.readFile(result.path, 'utf8')).toBe('hello');
    });
    test('interrupted streams remove their partially written folder', async () => {
        const stream = Readable.from((async function* () { yield Buffer.alloc(65536); throw new Error('connection lost'); })());
        await expect(upload(stream)).rejects.toThrow(/connection lost/);
        expect(await fs.promises.readdir(directory)).toEqual([]);
    });
    test('cancellation during a chunked upload removes partial files', async () => {
        const controller = new AbortController();
        const stream = Readable.from((async function* () { yield Buffer.alloc(65536); controller.abort(); yield Buffer.alloc(1); })());
        await expect(upload(stream, controller)).rejects.toMatchObject({ name: 'AbortError' });
        expect(await fs.promises.readdir(directory)).toEqual([]);
    });
    test('disk full before upload creates no temporary files', async () => {
        jest.spyOn(fs.promises, 'statfs').mockResolvedValue({ bsize: 4096n, bavail: 0n } as any);
        await expect(upload(Readable.from([Buffer.alloc(1)]))).rejects.toMatchObject({ code: 'ENOSPC' });
        expect(await fs.promises.readdir(directory)).toEqual([]);
    });
});
