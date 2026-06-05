const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Server = sequelize.define('Server', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    uuid: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    software: {
        type: DataTypes.STRING,
        allowNull: false
    },
    version: {
        type: DataTypes.STRING,
        allowNull: false
    },
    ram_mb: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    port: {
        type: DataTypes.INTEGER,
        unique: true,
        allowNull: false
    },
    owner_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    auto_backup: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    backup_interval: {
        type: DataTypes.INTEGER,
        defaultValue: 24
    },
    backup_includes: {
        type: DataTypes.STRING,
        defaultValue: 'all'
    },
    directory_name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    java_path: {
        type: DataTypes.STRING,
        defaultValue: 'java'
    },
    log_retention_days: {
        type: DataTypes.INTEGER,
        defaultValue: 7
    },
    backup_retention_days: {
        type: DataTypes.INTEGER,
        defaultValue: 30
    },
    ftp_port: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    ftp_username: {
        type: DataTypes.STRING,
        allowNull: true
    },
    ftp_password: {
        type: DataTypes.STRING,
        allowNull: true
    },
    ftp_password_plain: {
        type: DataTypes.STRING,
        allowNull: true
    },
    ftp_enabled: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    throttle_config: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    threshold_rules: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    statistics_config: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    autostart: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    autostart_on_crash: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'servers'
});

module.exports = Server;
