"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const UserCustomAccent = sequelize.define('UserCustomAccent', {
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    user_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    label: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    value: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    }
}, {
    tableName: 'user_custom_accents'
});
module.exports = UserCustomAccent;
//# sourceMappingURL=UserCustomAccent.js.map