"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const AccountCreationToken = sequelize.define('AccountCreationToken', {
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    token: {
        type: sequelize_1.DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    created_by: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    expires_at: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false
    },
    permissions: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false
    },
    ranks: {
        type: sequelize_1.DataTypes.TEXT,
        allowNull: false
    },
    used: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'account_creation_tokens'
});
module.exports = AccountCreationToken;
//# sourceMappingURL=AccountCreationToken.js.map