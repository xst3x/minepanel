# Discord Bot Integration Guide

MinePanel features a multi-bot Discord integration that provides real-time server console streaming, live server status updates, and command execution directly from Discord channels.

---

## Features

- **Multi-Bot System**: Register multiple bots in the panel, each managing a specific list of game servers.
- **Dedicated Server Categories**: Each game server gets its own category containing:
  - `📟 console` — Live console stream (Admins can type commands here).
  - `⌨️ commands` — Dedicated input channel for running Minecraft commands.
  - `📊 status` — A pinned embed that auto-refreshes every 30 seconds showing status, port, version, and RAM usage.
- **Customizable Channels & Categories**: Users can freely rename, move, or edit descriptions of categories/channels on Discord. The bot tracks them by their ID, so it will continue working without duplicating or breaking.
- **Silent Logging (Zero-Spam)**: All messages sent by the bot (console stream, status updates, welcome embeds) suppress push notifications and unread badges.
- **Console Auto-Clear**: Automatically deletes all messages in the `#console` channel when the server starts, stops, or restarts, ensuring a fresh view.
- **Instant Commands**: Executing commands in `#console` or `#commands` forwards the input to the Minecraft stdin instantly and deletes the user's message immediately to keep the channel clean.
- **Self-Healing Provisioning**: If a channel is deleted or missing on Discord, the bot automatically detects it on the next write attempt, marks it as unprovisioned, and recreates it in the background.
- **Offline Cleanup**: When a server is unassigned or a bot is deleted, the panel automatically logs in temporarily (even if the bot was disabled) to clean up its channels, roles, and categories on Discord and leave the guild.

---

## Slash Commands

Authorized users can run the following slash commands:

- `/status` — Sends a status panel with **Start**, **Stop**, **Restart**, and **Refresh** buttons.
- `/console` `live:<true/false>` — Streams a live console interface inside any channel.
- `/stats` `live:<true/false>` — Streams live CPU and RAM resource usage graphs.
- `/players` — Lists online players.
- `/logs` — Browses, filters, and paginates log files.
- `/execute` `command:<cmd>` — Runs a console command.
- `/start` `/stop` `/restart` — Controls the server state.
- `/init` `server:[name/id]` — Manually initializes/recreates channels and roles.

---

## Step-by-Step Discord Setup Guide

To connect a bot to MinePanel, you must create and configure an application in the Discord Developer Portal.

### 1. Create the Application
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Log in with your Discord account.
3. Click the **New Application** button in the top right.
4. Give your application a name (e.g. `MinePanel Bot`) and click **Create**.

### 2. Configure the Bot & Get the Token
1. In the left sidebar, click on **Bot**.
2. Under the **Username** field, click the **Reset Token** button.
3. Copy the generated **Token** and store it securely (you will enter this token in the MinePanel interface).
4. *(Optional)* Scroll down to **Public Bot** and toggle it **OFF** if you only want your account to be able to invite this bot.

### 3. Enable Privileged Gateway Intents (CRITICAL!)
1. Scroll down on the **Bot** page to the **Privileged Gateway Intents** section.
2. Enable the **Message Content Intent** (This is **REQUIRED** for the bot to read messages typed in `#console` and `#commands` and forward them to Minecraft).
3. Enable the **Guild Members Intent** (Recommended for role and permission resolution).
4. Click **Save Changes** at the bottom of the screen.

### 4. Generate the Invite URL (OAuth2)
1. In the left sidebar, click on **OAuth2** and select **URL Generator**.
2. Under **Scopes**, select the following checkmarks:
   - `bot`
   - `applications.commands` (This is **REQUIRED** for slash commands like `/status` or `/init` to show up).
3. Under **Bot Permissions**, select:
   - `Administrator` (Recommended. The bot needs permissions to manage roles, create/delete channels, send messages, delete messages, and add reactions. Choosing Administrator simplifies permission management).
4. Copy the generated URL at the bottom of the page.
5. Paste the URL into your browser, choose the Discord server (guild) you want to manage, and authorize the bot.

---

## Connecting to MinePanel

1. Log in to your MinePanel dashboard.
2. In the sidebar, go to **Global** -> **Discord Bots** (or go to the **Discord** tab on a specific server).
3. Click **Add Bot** (or Connect).
4. Paste the **Bot Token** you copied in Step 2.
5. Paste the **Server ID (Guild ID)** of your Discord server.
   - *To get your Guild ID: Enable Developer Mode in Discord Settings -> Advanced, right-click your Discord server icon, and select Copy Server ID.*
6. Select the game servers you want this bot to manage.
7. Click **Save**.

The bot will automatically connect, register its slash commands, create the server categories, channels, and roles, and start bridging console output immediately!
