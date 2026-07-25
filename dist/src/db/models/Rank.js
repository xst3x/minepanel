"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const Rank = sequelize.define('Rank', {
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: sequelize_1.DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    permissions: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false
    },
    global_permissions: {
        type: sequelize_1.DataTypes.TEXT,
        defaultValue: '[]'
    },
    is_builtin: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    },
    color: {
        type: sequelize_1.DataTypes.STRING,
        defaultValue: '#3b82f6'
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    }
}, {
    tableName: 'ranks'
});
module.exports = Rank;
//# sourceMappingURL=Rank.js.map