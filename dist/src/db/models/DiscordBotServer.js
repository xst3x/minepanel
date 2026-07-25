"use strict";
const sequelize_1 = require("sequelize");
const sequelize = require("../sequelize");
const DiscordBotServer = sequelize.define('DiscordBotServer', {
    bot_id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    },
    server_id: {
        type: sequelize_1.DataTypes.INTEGER,
        primaryKey: true
    }
}, {
    tableName: 'discord_bot_servers'
});
module.exports = DiscordBotServer;
//# sourceMappingURL=DiscordBotServer.js.map