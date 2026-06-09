/**
 * dockerRoutes.js — REMOVED.
 * Docker support has been removed from MinePanel.
 * Returns 410 Gone for all endpoints so any stale frontend calls get a clear error.
 */

const express = require('express');
const router  = express.Router();

router.all('*', (_req, res) => {
    res.status(410).json({ error: 'Docker support has been removed from MinePanel.' });
});

module.exports = router;
