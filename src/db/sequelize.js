const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');
const logger = require('../core/utils/logger');

// Must mirror the path logic in database.js exactly so both connections
// (Sequelize ORM + raw sqlite3) target the same physical file.
const dbDir = process.env.DATA_DIR
    ? path.join(process.env.DATA_DIR, 'db')
    : path.join(__dirname, '../../data');
if (process.env.NODE_ENV !== 'test' && !fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

if (process.env.NODE_ENV === 'test' && !process.env.MINEPANEL_TEST_DB) {
    process.env.MINEPANEL_TEST_DB = `file:memdb-${process.pid}-${Math.random().toString(36).substring(7)}?mode=memory&cache=shared`;
}
const dbPath = process.env.NODE_ENV === 'test' ? process.env.MINEPANEL_TEST_DB : path.join(dbDir, 'minepanel.db');

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    dialectOptions: process.env.NODE_ENV === 'test' ? {
        mode: 0x00000004 | 0x00000002 | 0x00000040 // OPEN_READWRITE | OPEN_CREATE | OPEN_URI
    } : undefined,
    logging: process.env.NODE_ENV === 'test' ? false : (msg) => logger.debug(`[Sequelize] ${msg}`),
    define: {
        timestamps: false, // Maintain matches with existing schema (no automatic createdAt/updatedAt columns unless specified)
        underscored: true  // Match snake_case columns
    }
});

module.exports = sequelize;
