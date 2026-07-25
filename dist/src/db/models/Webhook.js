"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const Webhook = sequelize.define('Webhook', {
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    server_id: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    event: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    url: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    active: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 1
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    }
}, {
    tableName: 'webhooks'
});
module.exports = Webhook;
//# sourceMappingURL=Webhook.js.map