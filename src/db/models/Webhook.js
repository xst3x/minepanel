const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const Webhook = sequelize.define('Webhook', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    server_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    event: {
        type: DataTypes.STRING,
        allowNull: false
    },
    url: {
        type: DataTypes.STRING,
        allowNull: false
    },
    active: {
        type: DataTypes.INTEGER,
        defaultValue: 1
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'webhooks'
});

module.exports = Webhook;
