const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const AccountCreationToken = sequelize.define('AccountCreationToken', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    token: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: false
    },
    created_by: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false
    },
    permissions: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    ranks: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    used: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'account_creation_tokens'
});

module.exports = AccountCreationToken;
