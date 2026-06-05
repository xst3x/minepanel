const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const ServerStats = sequelize.define('ServerStats', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    server_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    ram_bytes: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    cpu_percent: {
        type: DataTypes.DOUBLE,
        defaultValue: 0
    },
    tps: {
        type: DataTypes.DOUBLE,
        allowNull: true
    },
    players: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    collected_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    disk_bytes: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'server_stats'
});

module.exports = ServerStats;
