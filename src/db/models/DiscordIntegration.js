"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const DiscordIntegration = sequelize.define('DiscordIntegration', {
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    bot_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true
    },
    server_id: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false
    },
    guild_id: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    admin_role_id: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    viewer_role_id: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    category_id: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    log_channel_id: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    console_channel_id: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    status_channel_id: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    provisioned: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 0
    },
    created_at: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    },
    updated_at: {
        type: sequelize_1.DataTypes.DATE,
        defaultValue: sequelize_1.DataTypes.NOW
    }
}, {
    tableName: 'discord_integrations'
});
module.exports = DiscordIntegration;
//# sourceMappingURL=DiscordIntegration.js.map