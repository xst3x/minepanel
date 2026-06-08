/**
 * discord-bots.js — Frontend logic for the Discord Bots management page.
 * Handles: list bots, create/edit modal, toggle enable/disable, delete.
 */

const discordBots = (() => {
    let _allServers = [];
    let _editingBotId = null;
    let _initialized = false;

    // ── API helpers ───────────────────────────────────────────────────────────
    const botsApi = {
        list:           () => api.req('/discord/bots'),
        servers:        () => api.req('/discord/bots/servers'),
        validate:       (token) => api.req('/discord/bots/validate-token', { method: 'POST', body: JSON.stringify({ botToken: token }) }),
        create:         (data) => api.req('/discord/bots', { method: 'POST', body: JSON.stringify(data) }),
        update:         (id, data) => api.req(`/discord/bots/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        toggle:         (id, enabled) => api.req(`/discord/bots/${id}/toggle`, { method: 'POST', body: JSON.stringify({ enabled }) }),
        delete:         (id) => api.req(`/discord/bots/${id}`, { method: 'DELETE' }),
    };

    // ── Render the bots grid ──────────────────────────────────────────────────
    async function load() {
        const grid = document.getElementById('discord-bots-grid');
        if (!grid) return;
        grid.innerHTML = '<p style="color:var(--text-muted);font-size:0.875rem">Loading bots...</p>';
        try {
            const bots = await botsApi.list();
            if (bots.length === 0) {
                grid.innerHTML = `
                    <div style="grid-column:1/-1;text-align:center;padding:3rem 1rem;color:var(--text-muted)">
                        <svg viewBox="0 0 24 24" width="48" height="48" stroke="currentColor" fill="none" stroke-width="1.25" style="opacity:0.3;margin-bottom:1rem;display:block;margin-inline:auto"><path d="M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.36-.687.772-1.341 1.225-1.962a.077.077 0 0 0-.041-.104 13.175 13.175 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028z"/></svg>
                        <p style="margin:0;font-size:0.95rem">No Discord bots configured yet.</p>
                        <p style="margin:0.5rem 0 0;font-size:0.82rem">Click <strong>Add Bot</strong> to connect your first Discord bot.</p>
                    </div>`;
                return;
            }
            grid.innerHTML = '';
            bots.forEach(bot => grid.appendChild(_buildCard(bot)));
        } catch (e) {
            grid.innerHTML = `<p style="color:var(--danger)">${e.message}</p>`;
        }
    }

    function _buildCard(bot) {
        const card = document.createElement('div');
        card.className = 'card';
        card.style.cssText = 'display:flex;flex-direction:column;gap:1rem';

        const onlineColor = bot.online ? '#22c55e' : '#ef4444';
        const onlineLabel = bot.online ? 'Online' : 'Offline';
        const enabledLabel = bot.enabled ? 'Enabled' : 'Disabled';

        const serverCount = (bot.serverIds || []).length;

        card.innerHTML = `
            <!-- Bot identity row -->
            <div style="display:flex;align-items:center;gap:1rem">
                <div style="position:relative;flex-shrink:0">
                    <img src="${bot.avatar || ''}" alt="" 
                         style="width:52px;height:52px;border-radius:50%;border:2px solid var(--border-color);background:var(--bg-input)"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\' viewBox=\\'0 0 52 52\\'><rect width=\\'52\\' height=\\'52\\' fill=\\'%23333\\'><text x=\\'50%25\\' y=\\'55%25\\' dominant-baseline=\\'middle\\' text-anchor=\\'middle\\' font-size=\\'20\\' fill=\\'%23aaa\\'>${(bot.username || '?')[0].toUpperCase()}</text></rect></svg>'">
                    <span style="position:absolute;bottom:1px;right:1px;width:12px;height:12px;border-radius:50%;background:${onlineColor};border:2px solid var(--bg-card)" title="${onlineLabel}"></span>
                </div>
                <div style="flex:1;min-width:0">
                    <div style="font-weight:600;font-size:1rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(bot.username || 'Unknown Bot')}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px">Guild: <code style="font-family:var(--font-mono)">${bot.guildId}</code></div>
                </div>
                <span class="status-badge ${bot.enabled ? (bot.online ? 'online' : 'offline') : 'offline'}" style="flex-shrink:0">${enabledLabel}</span>
            </div>

            <!-- Stats row -->
            <div style="display:flex;gap:0.75rem;font-size:0.82rem;color:var(--text-secondary)">
                <div style="display:flex;align-items:center;gap:0.35rem">
                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="1.75"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>
                    ${serverCount} server${serverCount !== 1 ? 's' : ''}
                </div>
                <div style="display:flex;align-items:center;gap:0.35rem">
                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Added ${_timeAgo(bot.createdAt)}
                </div>
            </div>

            <!-- Toggle + Actions row -->
            <div style="display:flex;align-items:center;gap:0.5rem;margin-top:auto">
                <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;flex:1">
                    <label class="toggle-switch">
                        <input type="checkbox" class="bot-toggle" data-id="${bot.id}" ${bot.enabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <span style="font-size:0.82rem;color:var(--text-muted)">${bot.enabled ? 'Running' : 'Stopped'}</span>
                </label>
                <button class="btn outline small bot-edit-btn" data-id="${bot.id}" title="Edit bot">
                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="1.75"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                </button>
                <button class="btn danger small bot-delete-btn" data-id="${bot.id}" data-name="${escapeHtml(bot.username || 'Bot')}" title="Delete bot">
                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" fill="none" stroke-width="1.75"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    Delete
                </button>
            </div>
        `;

        // Toggle handler
        card.querySelector('.bot-toggle').addEventListener('change', async (e) => {
            const enabled = e.target.checked;
            const label = card.querySelector('span[style*="text-muted"]');
            try {
                await botsApi.toggle(bot.id, enabled);
                if (label) label.textContent = enabled ? 'Running' : 'Stopped';
                ui.toast(`Bot ${enabled ? 'enabled' : 'disabled'}`, 'success');
                // Reload after a second to get updated online status
                setTimeout(load, 2000);
            } catch (err) {
                e.target.checked = !enabled;
                ui.toast(err.message, 'error');
            }
        });

        // Edit
        card.querySelector('.bot-edit-btn').addEventListener('click', () => openEditor(bot));

        // Delete
        card.querySelector('.bot-delete-btn').addEventListener('click', async () => {
            const name = card.querySelector('.bot-delete-btn').dataset.name;
            if (!(await ui.confirm(`Delete bot "${name}"? This will remove all its Discord channels and roles.`, 'Delete Bot'))) return;
            try {
                await botsApi.delete(bot.id);
                ui.toast('Bot deleted', 'success');
                load();
            } catch (err) {
                ui.toast(err.message, 'error');
            }
        });

        return card;
    }

    // ── Modal helpers ─────────────────────────────────────────────────────────
    async function openEditor(bot = null) {
        _editingBotId = bot ? bot.id : null;
        document.getElementById('bot-editor-title').textContent = bot ? 'Edit Discord Bot' : 'Add Discord Bot';
        document.getElementById('be-bot-id').value = bot ? bot.id : '';
        document.getElementById('be-token').value = '';
        document.getElementById('be-guild-id').value = bot ? bot.guildId : '';
        document.getElementById('be-token-preview').style.display = 'none';
        document.getElementById('btn-be-save').disabled = bot ? false : true;

        // Always reload servers fresh (don't cache — user may have added servers)
        _allServers = [];
        const container = document.getElementById('be-servers-list');
        container.innerHTML = '<p style="font-size:0.82rem;color:var(--text-muted)">Loading servers...</p>';

        try { _allServers = await botsApi.servers(); } catch (_) { _allServers = []; }

        container.innerHTML = '';
        if (_allServers.length === 0) {
            container.innerHTML = '<p style="font-size:0.82rem;color:var(--text-muted)">No servers found. Create a Minecraft server first.</p>';
        } else {
            _allServers.forEach(sv => {
                const checked = bot && bot.serverIds && bot.serverIds.includes(sv.id);
                const row = document.createElement('label');
                row.style.cssText = 'display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0.75rem;border:1px solid var(--border-color);border-radius:var(--radius);cursor:pointer;font-size:0.875rem;background:var(--bg-input)';
                row.innerHTML = `
                    <input type="checkbox" data-server-id="${sv.id}" ${checked ? 'checked' : ''} style="accent-color:var(--accent)">
                    <span style="flex:1">${escapeHtml(sv.name)}</span>
                    <span style="font-size:0.75rem;color:var(--text-muted)">${sv.software} ${sv.version}</span>
                `;
                container.appendChild(row);
            });
        }

        ui.showModal('modal-bot-editor');
    }

    function _getSelectedServerIds() {
        return Array.from(document.querySelectorAll('#be-servers-list input[type=checkbox]:checked'))
            .map(cb => parseInt(cb.dataset.serverId));
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    function init() {
        if (_initialized) return; // nu atașa listeneri de mai multe ori
        _initialized = true;
        // Back button
        document.getElementById('btn-back-from-discord-bots')?.addEventListener('click', () => {
            document.getElementById('sidebar-discord-bots-btn')?.classList.remove('active');
            ui.showView('view-server-list');
            server.loadList();
        });

        // Open create modal
        document.getElementById('btn-create-bot')?.addEventListener('click', () => {
            openEditor(null).catch(e => {
                console.error('[discordBots] openEditor error:', e);
                ui.toast('Error: ' + e.message, 'error');
            });
        });

        // Modal close/cancel
        document.getElementById('modal-bot-editor-close')?.addEventListener('click', () => ui.closeModals());
        document.getElementById('modal-bot-editor-cancel')?.addEventListener('click', () => ui.closeModals());

        // Validate token button
        document.getElementById('btn-be-validate')?.addEventListener('click', async () => {
            const token = document.getElementById('be-token').value.trim();
            if (!token) return ui.toast('Paste a bot token first', 'error');
            const btn = document.getElementById('btn-be-validate');
            btn.disabled = true;
            btn.textContent = 'Checking...';
            try {
                const res = await botsApi.validate(token);
                if (res.valid && res.bot) {
                    document.getElementById('be-preview-avatar').src = res.bot.avatar || '';
                    document.getElementById('be-preview-name').textContent = res.bot.username || res.bot.id;
                    document.getElementById('be-token-preview').style.display = 'block';
                    document.getElementById('btn-be-save').disabled = false;
                    ui.toast('Token valid ✅', 'success');
                }
            } catch (e) {
                document.getElementById('be-token-preview').style.display = 'none';
                ui.toast('Invalid token: ' + e.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Validate';
            }
        });

        // Save bot
        document.getElementById('btn-be-save')?.addEventListener('click', async () => {
            const botId = document.getElementById('be-bot-id').value;
            const token = document.getElementById('be-token').value.trim();
            const guildId = document.getElementById('be-guild-id').value.trim();
            const serverIds = _getSelectedServerIds();

            if (!guildId) return ui.toast('Guild ID is required', 'error');
            if (!botId && !token) return ui.toast('Bot token is required for new bots', 'error');

            const saveBtn = document.getElementById('btn-be-save');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            try {
                if (botId) {
                    // Edit existing
                    const payload = { guildId, serverIds };
                    if (token) payload.botToken = token;
                    await botsApi.update(botId, payload);
                    ui.toast('Bot updated successfully', 'success');
                } else {
                    // Create new
                    await botsApi.create({ botToken: token, guildId, serverIds });
                    ui.toast('Bot added and started!', 'success');
                }
                ui.closeModals();
                load();
            } catch (e) {
                ui.toast(e.message, 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Bot';
            }
        });
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    function escapeHtml(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function _timeAgo(dateStr) {
        if (!dateStr) return '—';
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    }

    return { init, load };
})();
