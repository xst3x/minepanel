const { DataTypes } = require('sequelize');
const sequelize = require('../sequelize');

const DiscordBot = sequelize.define('DiscordBot', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    bot_token_encrypted: {
        type: DataTypes.STRING,
        allowNull: false
    },
    guild_id: {
        type: DataTypes.STRING,
        allowNull: false
    },
    enabled: {
        type: DataTypes.INTEGER,
        defaultValue: 1
    },
    bot_user_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    bot_username: {
        type: DataTypes.STRING,
        allowNull: true
    },
    bot_avatar: {
        type: DataTypes.STRING,
        allowNull: true
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
    tableName: 'discord_bots'
});

module.exports = DiscordBot;
