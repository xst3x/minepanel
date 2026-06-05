const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Setting = sequelize.define('Setting', {
    key: {
        type: DataTypes.STRING,
        primaryKey: true
    },
    value: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'settings'
});

module.exports = Setting;
