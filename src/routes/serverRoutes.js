const express = require('express');
const serverManagementRoutes = require('./modules/serverManagementRoutes');
const serverLifecycleRoutes = require('./modules/serverLifecycleRoutes');
const serverFtpRoutes = require('./modules/serverFtpRoutes');
const serverUpdateRoutes = require('./modules/serverUpdateRoutes');

const router = express.Router();

// Mount domain-based route modules
router.use('/', serverManagementRoutes);
router.use('/', serverLifecycleRoutes);
router.use('/', serverFtpRoutes);
router.use('/', serverUpdateRoutes);

module.exports = router;
