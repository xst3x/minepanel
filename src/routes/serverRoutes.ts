import express = require('express')
import serverManagementRoutes = require('./modules/serverManagementRoutes')
import serverLifecycleRoutes = require('./modules/serverLifecycleRoutes')
import serverFtpRoutes = require('./modules/serverFtpRoutes')
import serverUpdateRoutes = require('./modules/serverUpdateRoutes')

const router = express.Router();

// Mount domain-based route modules
router.use('/', serverManagementRoutes);
router.use('/', serverLifecycleRoutes);
router.use('/', serverFtpRoutes);
router.use('/', serverUpdateRoutes);

export = router;
