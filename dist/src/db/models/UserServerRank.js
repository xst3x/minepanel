"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const UserServerRank = sequelize.define('UserServerRank', {
    user_id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    server_id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    rank_id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    }
}, {
    tableName: 'user_server_ranks'
});
module.exports = UserServerRank;
//# sourceMappingURL=UserServerRank.js.map