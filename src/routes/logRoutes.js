const express = require('express');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');
const { authenticateToken } = require('../core/auth');
const { checkPermission } = require('../core/permissions');
const { getServer, getServerDir } = require('../core/serverHelper');

const router = express.Router({ mergeParams: true });
const gunzip = promisify(zlib.gunzip);

router.get('/', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const logsDir = path.join(getServerDir(server), 'logs');
        if (!fs.existsSync(logsDir)) return res.json([]);
        const files = await fsp.readdir(logsDir);
        const logFiles = [];
        for (const f of files) {
            if (f.endsWith('.log') || f.endsWith('.log.gz')) {
                const stats = await fsp.stat(path.join(logsDir, f));
                logFiles.push({ name: f, size: stats.size, date: stats.mtime });
            }
        }
        logFiles.sort((a, b) => b.date - a.date);
        res.json(logFiles);
    } catch (e) {
        console.error(`[logRoutes] List logs error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to list logs' });
    }
});

router.get('/read', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
    const { file, page, filter } = req.query;
    const LINES_PER_PAGE = 500;
    if (!file) return res.status(400).json({ error: 'File required' });
    if (file.includes('..') || file.includes('/') || file.includes('\\')) return res.status(400).json({ error: 'Invalid filename' });
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const logPath = path.join(getServerDir(server), 'logs', file);
        if (!fs.existsSync(logPath)) return res.status(404).json({ error: 'Log not found' });
        const buffer = await fsp.readFile(logPath);
        let content;
        if (file.endsWith('.log.gz')) { content = (await gunzip(buffer)).toString('utf8'); }
        else { content = buffer.toString('utf8'); }
        let lines = content.split('\n');
        if (filter) { const fl = filter.toLowerCase(); lines = lines.filter(l => l.toLowerCase().includes(fl)); }
        const totalLines = lines.length;
        const totalPages = Math.ceil(totalLines / LINES_PER_PAGE) || 1;
        const currentPage = Math.max(1, Math.min(parseInt(page) || totalPages, totalPages));
        const startIdx = (currentPage - 1) * LINES_PER_PAGE;
        const pageLines = lines.slice(startIdx, startIdx + LINES_PER_PAGE);
        res.json({ content: pageLines.join('\n'), page: currentPage, totalPages, totalLines, filtered: !!filter });
    } catch (e) {
        console.error(`[logRoutes] Read log file error (Server: ${req.params.serverId}, User: ${req.user.id}, File: ${file}):`, e);
        res.status(500).json({ error: 'Failed to read log file' });
    }
});

router.get('/tail', authenticateToken, checkPermission('server.files.read'), async (req, res) => {
    const lines = parseInt(req.query.lines) || 100;
    try {
        const server = await getServer(req.params.serverId);
        if (!server) return res.status(404).json({ error: 'Server not found' });
        const logPath = path.join(getServerDir(server), 'logs', 'latest.log');
        if (!fs.existsSync(logPath)) return res.json({ content: '', lines: 0 });
        const content = await fsp.readFile(logPath, 'utf8');
        const allLines = content.split('\n');
        const tailLines = allLines.slice(Math.max(0, allLines.length - lines));
        res.json({ content: tailLines.join('\n'), lines: tailLines.length, totalLines: allLines.length });
    } catch (e) {
        console.error(`[logRoutes] Tail log error (Server: ${req.params.serverId}, User: ${req.user.id}):`, e);
        res.status(500).json({ error: 'Failed to tail log' });
    }
});

module.exports = router;
