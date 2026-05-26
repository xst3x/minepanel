const express = require('express');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const multer = require('multer');
const { authenticateToken } = require('../core/auth');
const { checkPermission } = require('../core/permissions');
const { getServer, getServerDir } = require('../core/serverHelper');

const router = express.Router({ mergeParams: true });

// Icon upload — accepts a pre-processed PNG from the browser (already 64x64)
const iconUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/png') cb(null, true);
        else cb(new Error('Only PNG files are accepted for server icons'));
    }
});

router.get('/', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const propsPath = path.join(getServerDir(server), 'server.properties');
        try {
            await fsp.access(propsPath);
        } catch {
            return res.json({});
        }
        const content = await fsp.readFile(propsPath, 'utf8');
        const properties = {};
        content.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const parts = line.split('=');
                if (parts.length >= 2) properties[parts[0]] = parts.slice(1).join('=');
            }
        });
        res.json(properties);
    } catch (e) {
        console.error(`[propertiesRoutes] Read properties error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to read server.properties' });
    }
});

router.post('/', authenticateToken, checkPermission('server.files.write'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const propsPath = path.join(getServerDir(server), 'server.properties');
        const newProps = req.body;
        let content = '';
        try {
            await fsp.access(propsPath);
            content = await fsp.readFile(propsPath, 'utf8');
        } catch {}
        const lines = content.split('\n');
        const updatedLines = [];
        const processedKeys = new Set();
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const key = trimmed.split('=')[0];
                if (newProps[key] !== undefined) {
                    updatedLines.push(`${key}=${newProps[key]}`);
                    processedKeys.add(key);
                } else {
                    updatedLines.push(line);
                }
            } else {
                updatedLines.push(line);
            }
        });
        Object.keys(newProps).forEach(key => {
            if (!processedKeys.has(key)) updatedLines.push(`${key}=${newProps[key]}`);
        });
        await fsp.writeFile(propsPath, updatedLines.join('\n'));
        res.json({ message: 'Properties saved successfully' });
    } catch (e) {
        console.error(`[propertiesRoutes] Save properties error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to save server.properties' });
    }
});

// GET /icon — serve the current server icon (or 404)
router.get('/icon', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const iconPath = path.join(getServerDir(server), 'server-icon.png');
        try {
            await fsp.access(iconPath);
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'no-cache');
            return res.sendFile(iconPath);
        } catch {
            return res.status(404).json({ error: 'No server icon set' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /icon — save uploaded PNG as server-icon.png (browser already resized to 64x64)
router.post('/icon', authenticateToken, checkPermission('server.files.write'), iconUpload.single('icon'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No icon file uploaded' });
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const iconPath = path.join(getServerDir(server), 'server-icon.png');
        await fsp.writeFile(iconPath, req.file.buffer);
        res.json({ message: 'Server icon updated successfully' });
    } catch (e) {
        console.error(`[propertiesRoutes] Icon upload error:`, e);
        res.status(500).json({ error: e.message });
    }
});

// DELETE /icon — remove server-icon.png
router.delete('/icon', authenticateToken, checkPermission('server.files.delete'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const iconPath = path.join(getServerDir(server), 'server-icon.png');
        try {
            await fsp.unlink(iconPath);
        } catch {
            return res.status(404).json({ error: 'No icon to remove' });
        }
        res.json({ message: 'Server icon removed' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
