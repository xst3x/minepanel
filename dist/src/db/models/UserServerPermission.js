"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const UserServerPermission = sequelize.define('UserServerPermission', {
    user_id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    server_id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    permission: {
        type: sequelize_1.DataTypes.STRING,
        primaryKey: true
    }
}, {
    tableName: 'user_server_permissions'
});
module.exports = UserServerPermission;
//# sourceMappingURL=UserServerPermission.js.map