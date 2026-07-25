"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const ServerApiKey = sequelize.define('ServerApiKey', {
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    server_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    name: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false,
        defaultValue: 'Unnamed Key'
    },
    key_hash: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    key_prefix: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    scopes: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false,
        defaultValue: '["server.everything"]'
    },
    expires_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true
    },
    last_used_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true
    },
    is_revoked: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    },
    created_by: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    }
}, {
    tableName: 'server_api_keys',
    timestamps: false
});
module.exports = ServerApiKey;
//# sourceMappingURL=ServerApiKey.js.map