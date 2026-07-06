"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const DiscordBot = sequelize.define('DiscordBot', {
    id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    bot_token_encrypted: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    guild_id: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: false
    },
    enabled: {
        type: sequelize_1.DataTypes.INTEGER,
        defaultValue: 1
    },
    bot_user_id: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    bot_username: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
    },
    bot_avatar: {
        type: sequelize_1.DataTypes.STRING,
        allowNull: true
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
    tableName: 'discord_bots'
});
module.exports = DiscordBot;
//# sourceMappingURL=DiscordBot.js.map