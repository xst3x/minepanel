"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const Setting = sequelize.define('Setting', {
    key: {
        type: sequelize_1.DataTypes.STRING,
        primaryKey: true
    },
    value: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'settings'
});
module.exports = Setting;
//# sourceMappingURL=Setting.js.map