const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const DiscordIntegration = sequelize.define('DiscordIntegration', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    bot_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    server_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    guild_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    admin_role_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    viewer_role_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    category_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    log_channel_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    console_channel_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status_channel_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    provisioned: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'discord_integrations'
});

module.exports = DiscordIntegration;
