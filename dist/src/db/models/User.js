"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const User = sequelize.define('User', {
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    username: {
        type: sequelize_1.DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    password: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    role: {
        type: sequelize_1.DataTypes.STRING,
        defaultValue: 'user'
    },
    disabled: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    },
    global_permissions: {
        type: sequelize_1.DataTypes.TEXT,
        defaultValue: '[]'
    },
    rank_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
    totp_secret: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    totp_enabled: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    },
    valid_tokens_from: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true
    },
    totp_backup_codes: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true
    },
    avatar_url: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    totp_verified: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'users'
});
module.exports = User;
//# sourceMappingURL=User.js.map