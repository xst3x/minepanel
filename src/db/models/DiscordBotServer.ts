import { DataTypes } from 'sequelize'
import sequelize = require('../sequelize')

const DiscordBotServer = sequelize.define('DiscordBotServer', {
    bot_id: {
        type: DataTypes.INTEGER,
        primaryKey: true
    },
    server_id: {
        type: DataTypes.INTEGER,
        primaryKey: true
    }
}, {
    tableName: 'discord_bot_servers'
});

export = DiscordBotServer;
