"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const Server = sequelize.define('Server', {
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    uuid: {
        type: sequelize_1.DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    name: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    software: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    version: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    ram_mb: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    port: {
        type: sequelize_1.DataTypes.INTEGER,
        unique: true,
        allowNull: false
    },
    owner_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true
    },
    auto_backup: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    },
    backup_interval: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 24
    },
    backup_includes: {
        type: sequelize_1.DataTypes.STRING,
        defaultValue: 'all'
    },
    directory_name: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    java_path: {
        type: sequelize_1.DataTypes.STRING,
        defaultValue: 'java'
    },
    log_retention_days: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 7
    },
    backup_retention_days: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 30
    },
    ftp_port: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true
    },
    ftp_username: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    ftp_password: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    ftp_password_plain: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    ftp_enabled: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
    throttle_config: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true
    },
    threshold_rules: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true
    },
    statistics_config: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true
    },
    autostart: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    },
    autostart_on_crash: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    },
    automation_enabled: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'servers'
});
module.exports = Server;
//# sourceMappingURL=Server.js.map