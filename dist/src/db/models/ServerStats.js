"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const ServerStats = sequelize.define('ServerStats', {
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    server_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    ram_bytes: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    },
    cpu_percent: {
        type: sequelize_1.DataTypes.DOUBLE,
        defaultValue: 0
    },
    tps: {
        type: sequelize_1.DataTypes.DOUBLE,
        allowNull: true
    },
    players: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    },
    collected_at: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
    disk_bytes: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'server_stats'
});
module.exports = ServerStats;
//# sourceMappingURL=ServerStats.js.map