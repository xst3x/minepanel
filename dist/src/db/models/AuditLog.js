"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const AuditLog = sequelize.define('AuditLog', {
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    event: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    user_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true
    },
    username: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    ip: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    detail: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    }
}, {
    tableName: 'audit_log'
});
module.exports = AuditLog;
//# sourceMappingURL=AuditLog.js.map