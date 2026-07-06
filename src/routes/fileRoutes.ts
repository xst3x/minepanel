import express = require('express')
import fs = require('fs')
const fsp = require('fs').promises;
import path = require('path')
import os = require('os')
import crypto = require('crypto')
import multer = require('multer')
import AdmZip = require('adm-zip')
import authModule = require('../core/auth')
const { authenticateToken } = authModule;
import permissionsModule = require('../core/permissions')
const { checkPermission } = permissionsModule;
import serverHelperModule = require('../core/serverHelper')
const { getServer, getServerDir } = serverHelperModule;
import validationModule = require('../middleware/validation')
const { validate } = validationModule;
import V = require('../middleware/validators')
import errorsModule = require('../core/errors')
const { E, sendError } = errorsModule;
import logger = require('../core/utils/logger')

const router = express.Router({ mergeParams: true });

// In-memory store for one-time download tokens: token -> { file, deleteAfter, expires }
const _dlTokens = new Map();

// Purge expired tokens every 2 minutes
if (process.env.NODE_ENV !== 'test') {
    setInterval(() => {
        const now = Date.now();
        for (const [token, entry] of _dlTokens) {
            if (entry.expires < now) {                    if (entry.deleteAfter) fsp.unlink(entry.file as string).catch(() => {});
                _dlTokens.delete(token);
            }
        }
    }, 2 * 60 * 1000);
}

const getSafePath = (serverDir, targetPath) => {
    const cleaned = (targetPath || '').replace(/^[/\\]+/, '');
    const requestedPath = path.resolve(serverDir, cleaned);
    const rel = path.relative(serverDir, requestedPath);
    const isSafe = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    if (!isSafe) throw new Error('Access denied: Path is outside server directory');
    return requestedPath;
};

// Extensions blocked for security reasons (executables, scripts, etc.)
const BLOCKED_EXTENSIONS = new Set([
    '.exe', '.bat', '.cmd', '.com', '.msi', '.ps1', '.ps2', '.psm1',
    '.sh', '.bash', '.zsh', '.fish', '.csh',
    '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.scr',
    '.pif', '.reg', '.hta', '.cpl', '.dll', '.sys', '.drv',
    '.app', '.bin', '.run', '.elf',
]);

// ── Helper: create a zip buffer/file from an array of absolute paths ──────────
/**
 * Builds a zip archive synchronously using adm-zip.
 * @param {string[]} absPaths   - absolute filesystem paths to include
 * @param {string}   serverDir  - server root (used to compute relative names inside zip)
 * @returns {Buffer}            - zip file buffer
 */
function buildZipBuffer(absPaths, serverDir) {
    const zip = new AdmZip();
    for (const absPath of absPaths) {
        try {
            const stat = fs.statSync(absPath);
            if (stat.isDirectory()) {
                // addLocalFolder(localPath, zipPath)
                const relName = path.relative(serverDir, absPath).replace(/\\/g, '/');
                zip.addLocalFolder(absPath, relName);
            } else {
                const relName = path.relative(serverDir, path.dirname(absPath)).replace(/\\/g, '/');
                zip.addLocalFile(absPath, relName);
            }
        } catch (e) {
            logger.warn(`[fileRoutes] buildZipBuffer: skipping ${absPath}: ${e.message}`);
        }
    }
    return zip.toBuffer();
}

// ── Helper: write zip buffer to a temp file and return the path ───────────────
async function writeTempZip(buffer) {
    const tmpFile = path.join(os.tmpdir(), `minepanel-${crypto.randomBytes(8).toString('hex')}.zip`);
    await fsp.writeFile(tmpFile, buffer);
    return tmpFile;
}


const upload = multer({
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            try {
                const server = await getServer(req.params.serverId);
                if (!server) return cb(new Error('Server not found'), '');
                const safePath = getSafePath(getServerDir(server), req.body.path || '');
                cb(null, safePath);
            } catch (e) { cb(e as any, ''); }
        },
        filename: (req, file, cb) => {
            const safeName = path.basename(file.originalname).replace(/[^\w.\-]/g, '_');
            if (!safeName || safeName === '.' || safeName === '..') {
                return cb(new Error('Invalid filename'), '');
            }
            const ext = path.extname(safeName).toLowerCase();
            if (BLOCKED_EXTENSIONS.has(ext)) {
                return cb(Object.assign(new Error(`File extension '${ext}' is blocked for security reasons`), { code: 'BLOCKED_EXTENSION' }), '');
            }
            cb(null, safeName);
        }
    }),
    limits: { fileSize: 100 * 1024 * 1024 }
});

// List directory
router.get('/list', authenticateToken, checkPermission('server.files.read'), async (req: any, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const safePath = getSafePath(getServerDir(server), req.query.path || '');
        try { await fsp.access(safePath); } catch { return sendError(res, E.DIRECTORY_NOT_FOUND, 404); }
        const itemsRaw = await fsp.readdir(safePath, { withFileTypes: true });
        const items = await Promise.all(itemsRaw.map(async item => {
            const stats = await fsp.stat(path.join(safePath, item.name));
            return { name: item.name, isDirectory: item.isDirectory(), size: stats.size, modifiedAt: stats.mtime };
        }));
        res.json(items);
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) {
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        }
        logger.error(`[fileRoutes] list error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Read file
router.get('/read', authenticateToken, checkPermission('server.files.read'), async (req: any, res) => {
    if (!req.query.path) return sendError(res, E.FILE_PATH_REQUIRED, 400);
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const safePath = getSafePath(getServerDir(server), req.query.path);
        try { await fsp.access(safePath); } catch { return sendError(res, E.FILE_NOT_FOUND, 404); }
        const stats = await fsp.stat(safePath);
        if (stats.size > 5 * 1024 * 1024) return sendError(res, E.FILE_TOO_LARGE, 400);
        const content = await fsp.readFile(safePath, 'utf8');
        res.json({ content });
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) {
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        }
        logger.error(`[fileRoutes] read error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Write file
router.post('/write', authenticateToken, checkPermission('server.files.write'), validate(V.fileWrite), async (req: any, res) => {
    const { path: filePath, content } = req.body;
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const safePath = getSafePath(getServerDir(server), filePath);
        await fsp.writeFile(safePath, content, 'utf8');
        res.json({ message: 'File saved successfully' });
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) {
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        }
        logger.error(`[fileRoutes] write error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Rename
router.post('/rename', authenticateToken, checkPermission('server.files.write'), validate(V.fileRenameBody), async (req: any, res) => {
    const { oldPath, newPath } = req.body;
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        await fsp.rename(getSafePath(serverDir, oldPath), getSafePath(serverDir, newPath));
        res.json({ message: 'Renamed successfully' });
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) {
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        }
        logger.error(`[fileRoutes] rename error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Delete
router.post('/delete', authenticateToken, checkPermission('server.files.delete'), validate(V.fileDelete), async (req: any, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const safePath = getSafePath(getServerDir(server), req.body.path);
        await fsp.rm(safePath, { recursive: true, force: true });
        res.json({ message: 'Deleted successfully' });
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) {
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        }
        logger.error(`[fileRoutes] delete error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Create folder
router.post('/mkdir', authenticateToken, checkPermission('server.files.write'), validate(V.mkdirSimple), async (req: any, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        await fsp.mkdir(getSafePath(getServerDir(server), req.body.path), { recursive: true });
        res.json({ message: 'Folder created' });
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) {
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        }
        logger.error(`[fileRoutes] mkdir error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// Create file
router.post('/create', authenticateToken, checkPermission('server.files.write'), validate(V.fileCreate), async (req: any, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const safePath = getSafePath(getServerDir(server), req.body.path);
        try { await fsp.access(safePath); return sendError(res, E.FILE_ALREADY_EXISTS, 409); } catch {}
        await fsp.mkdir(path.dirname(safePath), { recursive: true });
        await fsp.writeFile(safePath, '', 'utf8');
        res.json({ message: 'File created' });
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) {
            return sendError(res, E.FILE_ACCESS_DENIED, 403);
        }
        logger.error(`[fileRoutes] create error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});


// ── Download (single file or folder-as-zip) ───────────────────────────────────
router.get('/download', authenticateToken, checkPermission('server.files.read'), async (req: any, res) => {
    if (!req.query.path) return sendError(res, E.FILE_PATH_REQUIRED, 400);
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const safePath = getSafePath(serverDir, req.query.path);
        try { await fsp.access(safePath); } catch { return sendError(res, E.FILE_NOT_FOUND, 404); }
        const stats = await fsp.stat(safePath);

        if (!stats.isDirectory()) {
            return res.download(safePath);
        }

        // Folder → zip it with adm-zip
        const folderName = path.basename(safePath);
        const buffer = buildZipBuffer([safePath], serverDir);
        const tmpFile = await writeTempZip(buffer);

        const token = crypto.randomBytes(24).toString('hex');
        _dlTokens.set(token, {
            file: tmpFile,
            name: `${folderName}.zip`,
            deleteAfter: true,
            expires: Date.now() + 5 * 60 * 1000
        });

        res.json({ downloadUrl: `/api/servers/${req.params.serverId}/files/dl/${token}` });
    } catch (e) {
        logger.error('[fileRoutes] download error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});

// ── One-time token download (no auth needed — token IS the credential) ────────
router.get('/dl/:token', async (req: any, res: any) => {
    const entry = _dlTokens.get(req.params.token);
    if (!entry || entry.expires < Date.now()) {
        _dlTokens.delete(req.params.token);
        return sendError(res, E.NOT_FOUND, 410);
    }

    _dlTokens.delete(req.params.token);

    try {
        await fsp.access(entry.file);
    } catch {
        return sendError(res, E.FILE_NOT_FOUND, 404);
    }

    res.download(entry.file, entry.name, err => {
        if (entry.deleteAfter) fsp.unlink(entry.file as string).catch(() => {});
        if (err && !res.headersSent) sendError(res, E.INTERNAL_ERROR, 500);
    });
});

// ── Batch delete ──────────────────────────────────────────────────────────────
router.post('/batch-delete', authenticateToken, checkPermission('server.files.delete'), async (req: any, res: any) => {
    const { paths } = req.body;
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
        return sendError(res, E.BAD_REQUEST, 400, 'paths array is required');
    }
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const results = [];
        for (const p of paths) {
            try {
                const safePath = getSafePath(serverDir, p);
                await fsp.rm(safePath, { recursive: true, force: true });
                results.push({ path: p, status: 'deleted' });
            } catch (err) {
                results.push({ path: p, status: 'error', error: err.message });
            }
        }
        res.json({ message: `Deleted ${results.filter(r => r.status === 'deleted').length} item(s).`, results });
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) return sendError(res, E.FILE_ACCESS_DENIED, 403);
        logger.error(`[fileRoutes] batch-delete error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Batch download (multiple items → single zip) ──────────────────────────────
router.post('/batch-download', authenticateToken, checkPermission('server.files.read'), async (req: any, res: any) => {
    const { paths } = req.body;
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
        return sendError(res, E.BAD_REQUEST, 400, 'paths array is required');
    }
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);

        // Validate all paths exist before building archive
        const absPaths = [];
        for (const p of paths) {
            const safePath = getSafePath(serverDir, p);
            if (!fs.existsSync(safePath)) {
                logger.warn(`[fileRoutes] batch-download: skipping missing path: ${p}`);
                continue;
            }
            absPaths.push(safePath);
        }

        const buffer = buildZipBuffer(absPaths, serverDir);
        const tmpFile = await writeTempZip(buffer);

        const token = crypto.randomBytes(24).toString('hex');
        _dlTokens.set(token, {
            file: tmpFile,
            name: `selection-${Date.now()}.zip`,
            deleteAfter: true,
            expires: Date.now() + 5 * 60 * 1000
        });

        res.json({ downloadUrl: `/api/servers/${req.params.serverId}/files/dl/${token}` });
    } catch (e) {
        logger.error('[fileRoutes] batch-download error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});

// ── Archive in-place (creates .zip in current directory from selected items) ──
router.post('/archive', authenticateToken, checkPermission('server.files.write'), async (req: any, res: any) => {
    const { paths, archiveName } = req.body;
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
        return sendError(res, E.BAD_REQUEST, 400, 'paths array is required');
    }
    const name = (archiveName || 'archive').replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/\.zip$/i, '') + '.zip';
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);

        // Validate paths and collect absolute paths
        const absPaths = [];
        for (const p of paths) {
            const safePath = getSafePath(serverDir, p);
            if (!fs.existsSync(safePath)) {
                return sendError(res, E.FILE_NOT_FOUND, 404, `Path not found: ${p}`);
            }
            absPaths.push(safePath);
        }

        // Resolve the common parent directory from the first path
        const firstSafe = absPaths[0];
        const parentDir = path.dirname(firstSafe);

        const archivePath = path.join(parentDir, name);
        if (fs.existsSync(archivePath)) {
            return sendError(res, E.FILE_ALREADY_EXISTS, 409, `Archive ${name} already exists`);
        }

        // Build zip and write to parent dir
        const buffer = buildZipBuffer(absPaths, serverDir);
        await fsp.writeFile(archivePath, buffer);

        res.json({ message: `Archive ${name} created with ${paths.length} item(s).`, archiveName: name });
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) return sendError(res, E.FILE_ACCESS_DENIED, 403);
        logger.error(`[fileRoutes] archive error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});


// ── Copy items ────────────────────────────────────────────────────────────────
router.post('/copy', authenticateToken, checkPermission('server.files.write'), async (req: any, res) => {
    const { paths, destination } = req.body;
    if (!paths || !Array.isArray(paths) || paths.length === 0 || !destination) {
        return sendError(res, E.BAD_REQUEST, 400, 'paths array and destination are required');
    }
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const destSafe = getSafePath(serverDir, destination);
        await fsp.mkdir(destSafe, { recursive: true });

        const results = [];
        for (const p of paths) {
            try {
                const srcSafe = getSafePath(serverDir, p);
                if (!fs.existsSync(srcSafe)) {
                    results.push({ path: p, status: 'error', error: 'Source not found' });
                    continue;
                }
                const baseName = path.basename(srcSafe);
                const destPath = path.join(destSafe, baseName);

                // Handle name conflicts
                let finalDest = destPath;
                let counter = 1;
                while (fs.existsSync(finalDest)) {
                    const ext = path.extname(baseName);
                    const stem = path.basename(baseName, ext);
                    finalDest = path.join(destSafe, `${stem} (${counter})${ext}`);
                    counter++;
                }

                await fsp.cp(srcSafe, finalDest, { recursive: true, force: false });
                results.push({ path: p, status: 'copied', dest: path.relative(serverDir, finalDest) });
            } catch (err) {
                results.push({ path: p, status: 'error', error: err.message });
            }
        }
        res.json({ message: `Copied ${results.filter(r => r.status === 'copied').length} item(s).`, results });
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) return sendError(res, E.FILE_ACCESS_DENIED, 403);
        logger.error(`[fileRoutes] copy error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Move items ────────────────────────────────────────────────────────────────
router.post('/move', authenticateToken, checkPermission('server.files.write'), async (req: any, res) => {
    const { paths, destination } = req.body;
    if (!paths || !Array.isArray(paths) || paths.length === 0 || !destination) {
        return sendError(res, E.BAD_REQUEST, 400, 'paths array and destination are required');
    }
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const destSafe = getSafePath(serverDir, destination);
        await fsp.mkdir(destSafe, { recursive: true });

        const results = [];
        for (const p of paths) {
            try {
                const srcSafe = getSafePath(serverDir, p);
                if (!fs.existsSync(srcSafe)) {
                    results.push({ path: p, status: 'error', error: 'Source not found' });
                    continue;
                }
                const baseName = path.basename(srcSafe);
                const destPath = path.join(destSafe, baseName);

                // Handle name conflicts
                let finalDest = destPath;
                let counter = 1;
                while (fs.existsSync(finalDest)) {
                    const ext = path.extname(baseName);
                    const stem = path.basename(baseName, ext);
                    finalDest = path.join(destSafe, `${stem} (${counter})${ext}`);
                    counter++;
                }

                await fsp.rename(srcSafe, finalDest);
                results.push({ path: p, status: 'moved', dest: path.relative(serverDir, finalDest) });
            } catch (err) {
                results.push({ path: p, status: 'error', error: err.message });
            }
        }
        res.json({ message: `Moved ${results.filter(r => r.status === 'moved').length} item(s).`, results });
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) return sendError(res, E.FILE_ACCESS_DENIED, 403);
        logger.error(`[fileRoutes] move error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Extract archive ───────────────────────────────────────────────────────────
router.post('/extract', authenticateToken, checkPermission('server.files.write'), async (req: any, res) => {
    const { path: archiveRelPath } = req.body;
    if (!archiveRelPath) return sendError(res, E.BAD_REQUEST, 400, 'path is required');
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const safePath = getSafePath(serverDir, archiveRelPath);

        if (!fs.existsSync(safePath)) return sendError(res, E.FILE_NOT_FOUND, 404);
        const ext = path.extname(safePath).toLowerCase();
        if (ext !== '.zip') return sendError(res, E.BAD_REQUEST, 400, 'Only .zip archives can be extracted');

        const parentDir = path.dirname(safePath);
        const zip = new AdmZip(safePath);
        zip.extractAllTo(parentDir, true);

        const count = zip.getEntries().length;
        res.json({ message: `Extracted ${count} entr${count === 1 ? 'y' : 'ies'} from ${path.basename(safePath)}.` });
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) return sendError(res, E.FILE_ACCESS_DENIED, 403);
        logger.error(`[fileRoutes] extract error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});

// ── Archive tree preview (list contents without extracting) ───────────────────
router.get('/archive-tree', authenticateToken, checkPermission('server.files.read'), async (req: any, res) => {
    if (!req.query.path) return sendError(res, E.BAD_REQUEST, 400, 'path query param is required');
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const serverDir = getServerDir(server);
        const safePath = getSafePath(serverDir, req.query.path);

        if (!fs.existsSync(safePath)) return sendError(res, E.FILE_NOT_FOUND, 404);
        const ext = path.extname(safePath).toLowerCase();
        if (ext !== '.zip') return sendError(res, E.BAD_REQUEST, 400, 'Not a .zip archive');

        const zip = new AdmZip(safePath);
        const entries = zip.getEntries().map(e => ({
            name: e.entryName,
            isDirectory: e.isDirectory,
            size: e.header.size,
            compressedSize: e.header.compressedSize,
        })).sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        res.json({ entries, totalEntries: entries.length, archiveName: path.basename(safePath) });
    } catch (e) {
        if (e.message && e.message.includes('Access denied')) return sendError(res, E.FILE_ACCESS_DENIED, 403);
        logger.error(`[fileRoutes] archive-tree error (Server: ${req.params.serverId}):`, e);
        return sendError(res, E.INTERNAL_ERROR, 500);
    }
});

// ── Upload ────────────────────────────────────────────────────────────────────
router.post('/upload', authenticateToken, checkPermission('server.files.write'), (req: any, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err.code === 'BLOCKED_EXTENSION' || (err.message && err.message.includes('blocked for security reasons'))) {
                return sendError(res, E.FILE_INVALID_NAME, 400, err.message);
            }
            if (err.message === 'Invalid filename') {
                return sendError(res, E.FILE_INVALID_NAME, 400, 'Invalid filename');
            }
            if (err.code === 'LIMIT_FILE_SIZE') {
                return sendError(res, E.FILE_TOO_LARGE, 400);
            }
            return sendError(res, E.INTERNAL_ERROR, 500, err.message);
        }
        if (!req.file) return sendError(res, E.BAD_REQUEST, 400, 'No file uploaded');
        res.json({ message: 'File uploaded', filename: req.file.originalname });
    });
});

export = router;
