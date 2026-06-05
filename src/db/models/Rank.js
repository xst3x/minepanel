const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Rank = sequelize.define('Rank', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    permissions: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    global_permissions: {
        type: DataTypes.TEXT,
        defaultValue: '[]'
    },
    is_builtin: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    color: {
        type: DataTypes.STRING,
        defaultValue: '#3b82f6'
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'ranks'
});

module.exports = Rank;
