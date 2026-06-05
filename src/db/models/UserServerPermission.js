const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const UserServerPermission = sequelize.define('UserServerPermission', {
    user_id: {
        type: DataTypes.INTEGER,
        primaryKey: true
    },
    server_id: {
        type: DataTypes.INTEGER,
        primaryKey: true
    },
    permission: {
        type: DataTypes.STRING,
        primaryKey: true
    }
}, {
    tableName: 'user_server_permissions'
});

module.exports = UserServerPermission;
