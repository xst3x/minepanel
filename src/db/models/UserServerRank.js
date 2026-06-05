const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const UserServerRank = sequelize.define('UserServerRank', {
    user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true
    },
    server_id: {
        type: DataTypes.INTEGER,
        primaryKey: true
    },
    rank_id: {
        type: DataTypes.INTEGER,
        primaryKey: true
    }
}, {
    tableName: 'user_server_ranks'
});

module.exports = UserServerRank;
