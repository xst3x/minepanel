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

const router = express.Router({ mergeParams: true });

// In-memory store for one-time download tokens: token -> { file, deleteAfter, expires }
const _dlTokens = new Map();

// Purge expired tokens every 2 minutes
setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of _dlTokens) {
        if (entry.expires < now) {
            if (entry.deleteAfter) {
                fsp.unlink(entry.file).catch(() => {});
            }
            _dlTokens.delete(token);
        }
    }
}, 2 * 60 * 1000);

const getSafePath = (serverDir, targetPath) => {
    const cleaned = (targetPath || '').replace(/^[/\\]+/, '');
    const requestedPath = path.resolve(serverDir, cleaned);
    const rel = path.relative(serverDir, requestedPath);
    const isSafe = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    if (!isSafe) throw new Error('Access denied: Path is outside server directory');
    return requestedPath;
};

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
        filename: (req, file, cb) => cb(null, file.originalname)
    }),
    limits: { fileSize: 100 * 1024 * 1024 }
});

// List directory
router.get('/list', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const safePath = getSafePath(getServerDir(server), req.query.path || '');
        try { await fsp.access(safePath); } catch { return res.status(404).json({ error: 'Directory not found' }); }
        const itemsRaw = await fsp.readdir(safePath, { withFileTypes: true });
        const items = await Promise.all(itemsRaw.map(async item => {
            const stats = await fsp.stat(path.join(safePath, item.name));
            return { name: item.name, isDirectory: item.isDirectory(), size: stats.size, modifiedAt: stats.mtime };
        }));
        res.json(items);
    } catch (e) { res.status(403).json({ error: e.message }); }
});

// Read file
router.get('/read', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
    if (!req.query.path) return res.status(400).json({ error: 'Path required' });
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const safePath = getSafePath(getServerDir(server), req.query.path);
        try { await fsp.access(safePath); } catch { return res.status(404).json({ error: 'File not found' }); }
        const stats = await fsp.stat(safePath);
        if (stats.size > 5 * 1024 * 1024) return res.status(400).json({ error: 'File too large. Use download.' });
        const content = await fsp.readFile(safePath, 'utf8');
        res.json({ content });
    } catch (e) { res.status(403).json({ error: e.message }); }
});

// Write file
router.post('/write', authenticateToken, checkPermission('server.files.write'), async (req, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath || content === undefined) return res.status(400).json({ error: 'Path and content required' });
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const safePath = getSafePath(getServerDir(server), filePath);
        await fsp.writeFile(safePath, content, 'utf8');
        res.json({ message: 'File saved' });
    } catch (e) { res.status(403).json({ error: e.message }); }
});

// Rename
router.post('/rename', authenticateToken, checkPermission('server.files.write'), async (req, res) => {
    const { oldPath, newPath } = req.body;
    if (!oldPath || !newPath) return res.status(400).json({ error: 'Old and new path required' });
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const serverDir = getServerDir(server);
        await fsp.rename(getSafePath(serverDir, oldPath), getSafePath(serverDir, newPath));
        res.json({ message: 'Renamed successfully' });
    } catch (e) { res.status(403).json({ error: e.message }); }
});

// Delete
router.post('/delete', authenticateToken, checkPermission('server.files.delete'), async (req, res) => {
    if (!req.body.path) return res.status(400).json({ error: 'Path required' });
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const safePath = getSafePath(getServerDir(server), req.body.path);
        await fsp.rm(safePath, { recursive: true, force: true });
        res.json({ message: 'Deleted successfully' });
    } catch (e) { res.status(403).json({ error: e.message }); }
});

// Create folder
router.post('/mkdir', authenticateToken, checkPermission('server.files.write'), async (req, res) => {
    if (!req.body.path) return res.status(400).json({ error: 'Path required' });
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        await fsp.mkdir(getSafePath(getServerDir(server), req.body.path), { recursive: true });
        res.json({ message: 'Folder created' });
    } catch (e) { res.status(403).json({ error: e.message }); }
});

// Create file
router.post('/create', authenticateToken, checkPermission('server.files.write'), async (req, res) => {
    if (!req.body.path) return res.status(400).json({ error: 'Path required' });
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const safePath = getSafePath(getServerDir(server), req.body.path);
        try { await fsp.access(safePath); return res.status(409).json({ error: 'File already exists' }); } catch {}
        await fsp.mkdir(path.dirname(safePath), { recursive: true });
        await fsp.writeFile(safePath, '', 'utf8');
        res.json({ message: 'File created' });
    } catch (e) { res.status(403).json({ error: e.message }); }
});

// ── Download ──────────────────────────────────────────────────────────────────
// For plain files  → streams the file directly (unchanged behaviour).
// For directories  → zips into a temp file, returns a one-time token URL that
//                    the frontend opens in a new tab; the temp file is deleted
//                    immediately after the browser has downloaded it.
router.get('/download', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
    if (!req.query.path) return res.status(400).json({ error: 'Path required' });
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const safePath = getSafePath(getServerDir(server), req.query.path);
        try { await fsp.access(safePath); } catch { return res.status(404).json({ error: 'Not found' }); }
        const stats = await fsp.stat(safePath);

        if (!stats.isDirectory()) {
            // Plain file — stream directly
            return res.download(safePath);
        }

        // ── Folder: build temp zip then issue a one-time token ──────────────
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

        // Mint a single-use token valid for 5 minutes
        const token = crypto.randomBytes(24).toString('hex');
        _dlTokens.set(token, {
            file: tmpFile,
            name: `${folderName}.zip`,
            deleteAfter: true,
            expires: Date.now() + 5 * 60 * 1000
        });

        // Return the token URL — frontend will window.open() it
        res.json({ downloadUrl: `/api/files/dl/${token}` });

    } catch (e) {
        console.error('[fileRoutes] download error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ── One-time token download (no auth needed — token IS the credential) ────────
router.get('/dl/:token', async (req, res) => {
    const entry = _dlTokens.get(req.params.token);
    if (!entry || entry.expires < Date.now()) {
        _dlTokens.delete(req.params.token);
        return res.status(410).json({ error: 'Download link expired or already used' });
    }

    // Consume token immediately so it can only be used once
    _dlTokens.delete(req.params.token);

    try {
        await fsp.access(entry.file);
    } catch {
        return res.status(404).json({ error: 'Temp file not found' });
    }

    res.download(entry.file, entry.name, err => {
        // Delete temp file after transfer completes (or fails)
        if (entry.deleteAfter) {
            fsp.unlink(entry.file).catch(() => {});
        }
        if (err && !res.headersSent) {
            res.status(500).json({ error: 'Download failed' });
        }
    });
});
// ── End Download ──────────────────────────────────────────────────────────────

// Upload
router.post('/upload', authenticateToken, checkPermission('server.files.write'), upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    res.json({ message: 'File uploaded', filename: req.file.originalname });
});

module.exports = router;
