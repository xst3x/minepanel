/**
 * Discord Integration — Frontend module
 * Manages the Discord tab UI: status display, connect/disconnect, toggle, token validation.
 * Relies on global: api, sid, ui, state
 */
const discord = {
    _connected: false,
    _tokenValid: false,

    async load() {
        const serverId = sid();
        if (!serverId) return;

        try {
            const data = await api.req(`/servers/${serverId}/discord/status`);
            this._connected = data.connected;
            this.render(data);
        } catch (e) {
            this._connected = false;
            this.render({ connected: false });
        }
    },

    render(data) {
        const badge = document.getElementById('discord-status-badge');
        const connectedInfo = document.getElementById('discord-connected-info');
        const disconnectedInfo = document.getElementById('discord-disconnected-info');
        const connectCard = document.getElementById('discord-connect-card');

        if (data.connected && data.botOnline) {
            // ── Connected & Online ──
            if (badge) {
                badge.textContent = 'ONLINE';
                badge.className = 'status-badge online';
            }
            if (connectedInfo) connectedInfo.style.display = '';
            if (disconnectedInfo) disconnectedInfo.style.display = 'none';
            if (connectCard) connectCard.style.display = 'none';

            // Bot info
            const avatar = document.getElementById('discord-bot-avatar');
            if (avatar && data.botUser?.avatar) {
                avatar.src = data.botUser.avatar;
                avatar.style.display = '';
            }
            const name = document.getElementById('discord-bot-name');
            if (name) name.textContent = data.botUser?.username || 'Bot';
            const guild = document.getElementById('discord-bot-guild');
            if (guild) guild.textContent = `Guild: ${data.guildId}`;

            // Resource IDs
            const provisioned = document.getElementById('discord-provisioned');
            if (provisioned) provisioned.textContent = data.provisioned ? '✅ Yes' : '⏳ Pending...';
            const consoleCh = document.getElementById('discord-console-ch');
            if (consoleCh) consoleCh.textContent = data.channels?.console || '—';
            const logCh = document.getElementById('discord-log-ch');
            if (logCh) logCh.textContent = data.channels?.logs || '—';
            const statusCh = document.getElementById('discord-status-ch');
            if (statusCh) statusCh.textContent = data.channels?.status || '—';

            // Toggle
            const toggle = document.getElementById('discord-toggle');
            if (toggle) toggle.checked = data.enabled;

        } else if (data.connected && !data.botOnline) {
            // ── Connected but offline ──
            if (badge) {
                badge.textContent = 'OFFLINE';
                badge.className = 'status-badge offline';
            }
            if (connectedInfo) connectedInfo.style.display = '';
            if (disconnectedInfo) disconnectedInfo.style.display = 'none';
            if (connectCard) connectCard.style.display = 'none';

            const toggle = document.getElementById('discord-toggle');
            if (toggle) toggle.checked = data.enabled;

        } else {
            // ── Not connected ──
            if (badge) {
                badge.textContent = 'NOT CONNECTED';
                badge.className = 'status-badge offline';
            }
            if (connectedInfo) connectedInfo.style.display = 'none';
            if (disconnectedInfo) disconnectedInfo.style.display = '';
            if (connectCard) connectCard.style.display = '';

            // Reset form
            this._tokenValid = false;
            const connectBtn = document.getElementById('btn-discord-connect');
            if (connectBtn) connectBtn.disabled = true;
            const preview = document.getElementById('discord-token-preview');
            if (preview) preview.style.display = 'none';
        }
    },

    async validateToken() {
        const tokenInput = document.getElementById('discord-bot-token');
        const token = tokenInput?.value?.trim();
        if (!token) return ui.toast('Please enter a bot token', 'error');

        try {
            ui.toast('Validating token...', 'info');
            const data = await api.req(`/servers/${sid()}/discord/validate-token`, {
                method: 'POST',
                body: JSON.stringify({ botToken: token })
            });

            if (data.valid) {
                this._tokenValid = true;
                const connectBtn = document.getElementById('btn-discord-connect');
                if (connectBtn) connectBtn.disabled = false;

                // Show preview
                const preview = document.getElementById('discord-token-preview');
                if (preview) preview.style.display = '';
                const avatarEl = document.getElementById('discord-preview-avatar');
                if (avatarEl && data.bot?.avatar) {
                    avatarEl.src = data.bot.avatar;
                    avatarEl.style.display = '';
                }
                const nameEl = document.getElementById('discord-preview-name');
                if (nameEl) nameEl.textContent = data.bot?.username || 'Bot';

                ui.toast('Token is valid!', 'success');
            }
        } catch (e) {
            this._tokenValid = false;
            const connectBtn = document.getElementById('btn-discord-connect');
            if (connectBtn) connectBtn.disabled = true;
            const preview = document.getElementById('discord-token-preview');
            if (preview) preview.style.display = 'none';
            ui.toast(e.message || 'Invalid token', 'error');
        }
    },

    async connect() {
        if (!this._tokenValid) return ui.toast('Please validate your token first', 'error');

        const token = document.getElementById('discord-bot-token')?.value?.trim();
        const guildId = document.getElementById('discord-guild-id')?.value?.trim();

        if (!token || !guildId) return ui.toast('Both bot token and guild ID are required', 'error');
        if (!/^\d{17,20}$/.test(guildId)) return ui.toast('Invalid Guild ID format (should be 17-20 digits)', 'error');

        try {
            ui.toast('Connecting bot...', 'info');
            await api.req(`/servers/${sid()}/discord/connect`, {
                method: 'POST',
                body: JSON.stringify({ botToken: token, guildId })
            });

            ui.toast('Discord bot connected! Provisioning channels & roles...', 'success');

            // Clear form
            document.getElementById('discord-bot-token').value = '';
            document.getElementById('discord-guild-id').value = '';

            // Reload status after a short delay to allow provisioning
            setTimeout(() => this.load(), 3000);
        } catch (e) {
            ui.toast(e.message || 'Failed to connect bot', 'error');
        }
    },

    async disconnect() {
        const confirmed = await ui.confirm(
            'This will remove the Discord bot, delete auto-created channels and roles, and unregister all slash commands. Continue?',
            'Disconnect Discord Bot'
        );
        if (!confirmed) return;

        try {
            await api.req(`/servers/${sid()}/discord/disconnect`, { method: 'POST' });
            ui.toast('Discord bot disconnected', 'success');
            this.load();
        } catch (e) {
            ui.toast(e.message || 'Failed to disconnect', 'error');
        }
    },

    async toggle(enabled) {
        try {
            await api.req(`/servers/${sid()}/discord/toggle`, {
                method: 'POST',
                body: JSON.stringify({ enabled })
            });
            ui.toast(enabled ? 'Discord bot enabled' : 'Discord bot disabled', 'success');
            setTimeout(() => this.load(), 1500);
        } catch (e) {
            ui.toast(e.message || 'Failed to toggle', 'error');
            // Revert checkbox
            const toggle = document.getElementById('discord-toggle');
            if (toggle) toggle.checked = !enabled;
        }
    },

    init() {
        // Validate button
        document.getElementById('btn-discord-validate')?.addEventListener('click', () => this.validateToken());

        // Connect button
        document.getElementById('btn-discord-connect')?.addEventListener('click', () => this.connect());

        // Disconnect button
        document.getElementById('btn-discord-disconnect')?.addEventListener('click', () => this.disconnect());

        // Toggle switch
        document.getElementById('discord-toggle')?.addEventListener('change', (e) => this.toggle(e.target.checked));
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => discord.init());
