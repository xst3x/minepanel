const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');
const { ZipArchive } = require('archiver');
const { authenticateToken } = require('../core/auth');
const { checkPermission } = require('../core/permissions');
const { getServer, getServerDir } = require('../core/serverHelper');
const { validate } = require('../middleware/validation');
const V = require('../middleware/validators');
const { E, sendError } = require('../core/errors');
const logger = require('../core/utils/logger');

const router = express.Router({ mergeParams: true });

// In-memory store for one-time download tokens: token -> { file, deleteAfter, expires }
const _dlTokens = new Map();

// Purge expired tokens every 2 minutes
if (process.env.NODE_ENV !== 'test') {
    setInterval(() => {
        const now = Date.now();
        for (const [token, entry] of _dlTokens) {
            if (entry.expires < now) {
                if (entry.deleteAfter) fsp.unlink(entry.file).catch(() => {});
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

const upload = multer({
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            try {
                const server = await getServer(req.params.serverId);
                if (!server) return cb(new Error('Server not found'));
                const safePath = getSafePath(getServerDir(server), req.body.path || '');
                cb(null, safePath);
            } catch (e) { cb(e); }
        },
        filename: (req, file, cb) => {
            const safeName = path.basename(file.originalname).replace(/[^\w.\-]/g, '_');
            if (!safeName || safeName === '.' || safeName === '..') {
                return cb(new Error('Invalid filename'));
            }
            const ext = path.extname(safeName).toLowerCase();
            if (BLOCKED_EXTENSIONS.has(ext)) {
                return cb(Object.assign(new Error(`File extension '${ext}' is blocked for security reasons`), { code: 'BLOCKED_EXTENSION' }));
            }
            cb(null, safeName);
        }
    }),
    limits: { fileSize: 100 * 1024 * 1024 }
});

// List directory
router.get('/list', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
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
router.get('/read', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
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
router.post('/write', authenticateToken, checkPermission('server.files.write'), validate(V.fileWrite), async (req, res) => {
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
router.post('/rename', authenticateToken, checkPermission('server.files.write'), validate(V.fileRenameBody), async (req, res) => {
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
router.post('/delete', authenticateToken, checkPermission('server.files.delete'), validate(V.fileDelete), async (req, res) => {
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
router.post('/mkdir', authenticateToken, checkPermission('server.files.write'), validate(V.mkdirSimple), async (req, res) => {
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
router.post('/create', authenticateToken, checkPermission('server.files.write'), validate(V.fileCreate), async (req, res) => {
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

// ── Download ──────────────────────────────────────────────────────────────────
router.get('/download', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
    if (!req.query.path) return sendError(res, E.FILE_PATH_REQUIRED, 400);
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return sendError(res, E.SERVER_NOT_FOUND, 404);
        const safePath = getSafePath(getServerDir(server), req.query.path);
        try { await fsp.access(safePath); } catch { return sendError(res, E.FILE_NOT_FOUND, 404); }
        const stats = await fsp.stat(safePath);

        if (!stats.isDirectory()) {
            return res.download(safePath);
        }

        const folderName = path.basename(safePath);
        const tmpFile = path.join(os.tmpdir(), `minepanel-dl-${crypto.randomBytes(8).toString('hex')}.zip`);

        await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(tmpFile);
            const archive = new ZipArchive({ zlib: { level: 6 } });
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);
            archive.directory(safePath, folderName);
            archive.finalize();
        });

        const token = crypto.randomBytes(24).toString('hex');
        _dlTokens.set(token, {
            file: tmpFile,
            name: `${folderName}.zip`,
            deleteAfter: true,
            expires: Date.now() + 5 * 60 * 1000
        });

        res.json({ downloadUrl: `/api/files/dl/${token}` });
    } catch (e) {
        logger.error('[fileRoutes] download error:', e);
        return sendError(res, E.INTERNAL_ERROR, 500, e.message);
    }
});

// ── One-time token download (no auth needed — token IS the credential) ────────
router.get('/dl/:token', async (req, res) => {
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
        if (entry.deleteAfter) fsp.unlink(entry.file).catch(() => {});
        if (err && !res.headersSent) sendError(res, E.INTERNAL_ERROR, 500);
    });
});

// Upload
router.post('/upload', authenticateToken, checkPermission('server.files.write'), (req, res, next) => {
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

module.exports = router;
