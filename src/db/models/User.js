const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const User = sequelize.define('User', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    username: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: DataTypes.STRING,
        defaultValue: 'user'
    },
    disabled: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    global_permissions: {
        type: DataTypes.TEXT,
        defaultValue: '[]'
    },
    rank_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    totp_secret: {
        type: DataTypes.STRING,
        allowNull: true
    },
    totp_enabled: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    valid_tokens_from: {
        type: DataTypes.DATE,
        allowNull: true
    },
    totp_backup_codes: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    avatar_url: {
        type: DataTypes.STRING,
        allowNull: true
    },
    totp_verified: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'users'
});

module.exports = User;
