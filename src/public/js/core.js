let state = {
    token: localStorage.getItem('mp_token'),
    user: localStorage.getItem('mp_user'),
    role: localStorage.getItem('mp_role'),
    userId: localStorage.getItem('mp_userid'),
    currentServer: null,
    ws: null,
    perms: [],
    servers: []
};

// Back Navigation Stack
let navStack = [];

const ui = {
    toast(msg, type = 'info') {
        const c = document.getElementById('toast-container');
        const t = document.createElement('div');
        t.className = `toast toast-${type}`;
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => {
            t.style.animation = 'toastOut 0.25s cubic-bezier(0.4, 0, 0.2, 1) forwards';
            setTimeout(() => t.remove(), 250);
        }, 3500);
    },
    showView(id) {
        document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(id);
        if (target) {
            target.classList.add('active');
            // Manage back navigation stack
            if (id === 'view-server-list') {
                navStack = [];
            } else {
                if (navStack[navStack.length - 1] !== id) navStack.push(id);
            }
        }
    },
    showModal(id) { document.getElementById(id)?.classList.add('active'); },
    closeModals() { document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active')); },
    bytes(b, d = 1) {
        if (!+b) return '0 B';
        const k = 1024, s = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return `${parseFloat((b / Math.pow(k, i)).toFixed(d))} ${s[i]}`;
    },
    confirm(desc, title = 'Confirm') {
        return new Promise(resolve => {
            document.getElementById('ui-confirm-title').textContent = title;
            document.getElementById('ui-confirm-desc').textContent = desc;
            ui.showModal('modal-ui-confirm');
            
            const cleanup = () => {
                document.getElementById('modal-ui-confirm-ok').onclick = null;
                document.getElementById('modal-ui-confirm-cancel').onclick = null;
                document.getElementById('modal-ui-confirm-close').onclick = null;
                ui.closeModals();
            };

            document.getElementById('modal-ui-confirm-ok').onclick = () => { cleanup(); resolve(true); };
            const cancel = () => { cleanup(); resolve(false); };
            document.getElementById('modal-ui-confirm-cancel').onclick = cancel;
            document.getElementById('modal-ui-confirm-close').onclick = cancel;
        });
    },
    prompt(desc, defaultVal = '', title = 'Input Required') {
        return new Promise(resolve => {
            document.getElementById('ui-prompt-title').textContent = title;
            document.getElementById('ui-prompt-desc').textContent = desc;
            const inp = document.getElementById('ui-prompt-input');
            inp.value = defaultVal;
            ui.showModal('modal-ui-prompt');
            inp.focus();
            
            const cleanup = () => {
                document.getElementById('modal-ui-prompt-ok').onclick = null;
                document.getElementById('modal-ui-prompt-cancel').onclick = null;
                document.getElementById('modal-ui-prompt-close').onclick = null;
                inp.onkeydown = null;
                ui.closeModals();
            };

            const submit = () => { cleanup(); resolve(inp.value); };
            const cancel = () => { cleanup(); resolve(null); };

            document.getElementById('modal-ui-prompt-ok').onclick = submit;
            document.getElementById('modal-ui-prompt-cancel').onclick = cancel;
            document.getElementById('modal-ui-prompt-close').onclick = cancel;
            inp.onkeydown = e => { if (e.key === 'Enter') submit(); else if (e.key === 'Escape') cancel(); };
        });
    }
};

function hasPerm(perm) {
    if (state.role === 'admin') return true;
    return state.perms.includes('*') || state.perms.includes('root') || state.perms.includes(perm);
}

const api = {
    async req(endpoint, opts = {}) {
        const h = { 'Content-Type': 'application/json', ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {}) };
        if (opts.body instanceof FormData) delete h['Content-Type'];
        const r = await fetch(`/api${endpoint}`, { ...opts, headers: h });
        
        let d;
        const text = await r.text();
        const isHtml = text.trim().startsWith('<') || (r.headers.get('content-type') || '').includes('text/html');
        if (isHtml) {
            throw new Error(`Server error: Received HTML instead of JSON (HTTP ${r.status})`);
        }
        try {
            d = text ? JSON.parse(text) : {};
        } catch (e) {
            throw new Error('Invalid JSON response from server');
        }
        
        if (!r.ok) {
            if (r.status === 401 || r.status === 403) {
                // If it's auth related, we might want to log out or at least show a clean message
                if (d && d.error && d.error.toLowerCase().includes('disabled')) {
                    // Auto logout and show message
                    state.token = null; state.user = null; state.role = null; state.userId = null; state.currentServer = null;
                    localStorage.removeItem('mp_token'); localStorage.removeItem('mp_user'); localStorage.removeItem('mp_role'); localStorage.removeItem('mp_userid');
                    if (state.ws) { state.ws.close(); state.ws = null; }
                    ui.showView('auth-view');
                    document.getElementById('auth-view').classList.add('active');
                    document.getElementById('main-view').classList.remove('active');
                    ui.toast("Your account has been disabled", 'error');
                } else if (r.status === 401 || (d && d.error && (d.error.toLowerCase().includes('expired') || d.error.toLowerCase().includes('invalid token')))) {
                    if (state.token) {
                        document.getElementById('logout-btn')?.click(); // Auto logout on expire or invalid token
                    }
                }
            }
            throw new Error(d.error || 'API Error');
        }
        return d;
    },
    async download(endpoint, filename) {
        ui.toast(`Starting download: ${filename}...`, 'info');
        try {
            const h = { ...(state.token ? { 'Authorization': `Bearer ${state.token}` } : {}) };
            const r = await fetch(`/api${endpoint}`, { headers: h });
            if (!r.ok) {
                const text = await r.text();
                let err = 'Download failed';
                try { err = JSON.parse(text).error; } catch(e) {}
                throw new Error(err);
            }
            const blob = await r.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            ui.toast(`Successfully downloaded ${filename}`, 'success');
        } catch(e) {
            ui.toast(e.message, 'error');
        }
    }
};

function sid() { return state.currentServer?.id; }

// Tab-to-permission mapping for sub-navigation
const TAB_PERMS = {
    overview: null,
    console: 'server.console.read',
    files: 'server.files.read',
    plugins: 'server.plugins.read',
    players: 'server.players.read',
    properties: 'server.properties.read',
    backups: 'server.backups.read',
    logs: 'server.logs.read',
    settings: 'account.manage',
    ftp: 'server.ftp.access'
};

function applyPermissions() {
    // Show/hide sub-tabs based on permissions
    document.querySelectorAll('.sub-nav-item').forEach(btn => {
        const tab = btn.dataset.tab;
        const reqPerm = TAB_PERMS[tab];
        if (reqPerm === null) { btn.style.display = ''; return; }
        btn.style.display = hasPerm(reqPerm) ? '' : 'none';
    });

    // Show/hide server control buttons
    document.getElementById('btn-start').style.display = hasPerm('server.start') ? '' : 'none';
    document.getElementById('btn-stop').style.display = hasPerm('server.stop') ? '' : 'none';
    document.getElementById('btn-restart').style.display = hasPerm('server.stop') ? '' : 'none';
    document.getElementById('btn-kill').style.display = hasPerm('server.stop') ? '' : 'none';

    // Show/hide deploy buttons only for admins
    const deployBtn = document.getElementById('btn-deploy-server');
    if (deployBtn) deployBtn.style.display = (state.role === 'admin') ? '' : 'none';
    const deploySidebarBtn = document.getElementById('btn-sidebar-new-server');
    if (deploySidebarBtn) deploySidebarBtn.style.display = (state.role === 'admin') ? '' : 'none';
    const importBtn = document.getElementById('btn-import-server');
    if (importBtn) importBtn.style.display = (state.role === 'admin') ? '' : 'none';
    const importSidebarBtn = document.getElementById('btn-sidebar-import-server');
    if (importSidebarBtn) importSidebarBtn.style.display = (state.role === 'admin') ? '' : 'none';

    // Show/hide global sidebar links
    const usersBtn = document.getElementById('sidebar-users-btn');
    if (usersBtn) usersBtn.style.display = '';
    const ranksBtn = document.getElementById('sidebar-ranks-btn');
    if (ranksBtn) ranksBtn.style.display = hasPerm('account.manage') ? '' : 'none';
    const settingsBtn = document.getElementById('sidebar-settings-btn');
    if (settingsBtn) settingsBtn.style.display = (state.role === 'admin' || hasPerm('panel.settings')) ? '' : 'none';
}

function updateSidebarServerStatus(serverId, status) {
    const dot = document.getElementById(`sb-dot-${serverId}`);
    if (dot) dot.className = `sidebar-server-dot ${status}`;
    const label = dot?.parentElement?.querySelector('.sidebar-server-status');
    if (label) {
        label.className = `sidebar-server-status ${status}`;
        label.textContent = status === 'online' ? 'ONLINE' : status === 'starting' ? '...' : 'OFFLINE';
    }
}

// Server List and Sidebar Updates
const server = {
    async loadList() {
        try {
            const svs = await api.req('/servers');
            state.servers = svs;
            
            // Render main grid
            const g = document.getElementById('servers-grid');
            if (g) {
                g.innerHTML = '';
                if (!svs.length) {
                    g.innerHTML = '<p class="text-muted">No servers found.</p>';
                } else {
                    svs.forEach(sv => {
                        const c = document.createElement('div');
                        c.className = 'server-card';
                        c.innerHTML = `
                            <h4>${sv.name}</h4>
                            <p>${sv.software} ${sv.version}</p>
                            <span class="status-badge ${sv.status || 'offline'}">${(sv.status || 'offline').toUpperCase()}</span>
                        `;
                        c.onclick = () => server.open(sv);
                        g.appendChild(c);
                    });
                }
            }

            // Render sidebar listing
            const sb = document.getElementById('sidebar-servers-list');
            if (sb) {
                sb.innerHTML = '';
                svs.forEach(sv => {
                    const btn = document.createElement('button');
                    btn.className = `sidebar-item sidebar-server-item ${state.currentServer?.id === sv.id ? 'active' : ''}`;
                    btn.dataset.serverId = sv.id;
                    const status = sv.status || 'offline';
                    btn.innerHTML = `
                        <span>${sv.name}</span>
                        <span class="sidebar-server-status ${status}">${status === 'online' ? 'ONLINE' : status === 'starting' ? '...' : 'OFFLINE'}</span>
                        <span class="sidebar-server-dot ${status}" id="sb-dot-${sv.id}"></span>
                    `;
                    btn.onclick = () => server.open(sv);
                    sb.appendChild(btn);
                    if (window.serverIconHelper) {
                        serverIconHelper.mountSidebarIcon(btn, sv.id);
                    }
                });
            }
        } catch (e) { ui.toast(e.message, 'error'); }
    },

    async open(sv) {
        state.currentServer = sv;
        document.getElementById('sh-name').textContent = sv.name;
        document.getElementById('sh-software').textContent = sv.software;
        document.getElementById('sh-version').textContent = sv.version;

        // Update server icon in the header bar
        const shIcon = document.getElementById('sh-icon');
        if (shIcon && window.serverIconHelper) {
            const DEFAULT_ICON_SVG = `<svg viewBox="0 0 24 24" width="24" height="24" stroke="var(--accent)" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /><path d="M2 7v10" /><path d="M12 12v10" /><path d="M22 7v10" /></svg>`;
            shIcon.innerHTML = DEFAULT_ICON_SVG;
            serverIconHelper.fetchIconUrl(sv.id).then(url => {
                if (url && state.currentServer?.id === sv.id) {
                    shIcon.innerHTML = `<img src="${url}" alt="" style="width:44px;height:44px;image-rendering:pixelated;border-radius:6px;object-fit:contain;">`;
                }
            }).catch(() => {});
        }
        
        // Dynamically resolve public IP / Domain / Hostname
        const currentHost = window.location.hostname;
        document.getElementById('sh-address').textContent = `${currentHost}:${sv.port}`;
        
        // Settings Tab Inputs
        const currentSoftwareInput = document.getElementById('sv-current-software');
        if (currentSoftwareInput) currentSoftwareInput.value = sv.software;
        const currentVersionInput = document.getElementById('sv-current-version');
        if (currentVersionInput) currentVersionInput.value = sv.version;
        const newSoftwareSelect = document.getElementById('sv-new-software');
        if (newSoftwareSelect) newSoftwareSelect.value = sv.software.toLowerCase();
        const newVersionInput = document.getElementById('sv-new-version');
        if (newVersionInput) updateVersionDropdown('sv-new-software', 'sv-new-version', sv.version);

        // FTP Connection Info
        const ftpUsername = document.getElementById('ftp-username-display');
        if (ftpUsername) ftpUsername.textContent = state.user || 'admin';
        const ftpServer = document.getElementById('ftp-server-display');
        if (ftpServer) ftpServer.textContent = sv.id;
        const ftpHost = document.getElementById('ftp-host-display');
        if (ftpHost) {
            ftpHost.textContent = (currentHost === 'localhost' || currentHost === '127.0.0.1') ? '127.0.0.1' : currentHost;
        }

        // Pre-populate player count instantly (uses real online tracking, not playerdata files)
        try {
            const onlineData = await api.req(`/servers/${sv.id}/players/online`);
            const ovPlayers = document.getElementById('ov-players');
            if (ovPlayers) ovPlayers.textContent = `${onlineData.count} online`;
        } catch (_) {}

        // Fetch permissions for this server
        try {
            const p = await api.req(`/servers/${sv.id}/my-permissions`);
            state.perms = p.permissions || [];
            if (p.admin) state.role = 'admin';
        } catch (e) { state.perms = []; }

        applyPermissions();
        ui.showView('view-server-dashboard');

        // Active class in sidebar
        document.querySelectorAll('.sidebar-server-item').forEach(btn => btn.classList.remove('active'));
        const sidebarBtn = document.querySelector(`.sidebar-server-item[id="sb-dot-${sv.id}"]`)?.parentNode;
        if (sidebarBtn) sidebarBtn.classList.add('active');
        document.querySelectorAll('.sidebar-item').forEach(i => { if (!i.classList.contains('sidebar-server-item')) i.classList.remove('active'); });

        server.connectWS(sv.id);
        overview.reset();

        // Auto click the first visible subnav tab
        const firstTab = document.querySelector('.sub-nav-item[style=""], .sub-nav-item:not([style])');
        if (firstTab) firstTab.click();
        else document.querySelector('.sub-nav-item[data-tab="overview"]').click();

        const abt = document.getElementById('auto-backup-toggle');
        if (abt) abt.checked = !!sv.auto_backup;
    },

    connectWS(id) {
        if (state.ws) {
            state.ws.onclose = null;
            state.ws.onerror = null;
            state.ws.close();
        }

        let reconnectTimer = null;
        let reconnectAttempts = 0;

        const connect = () => {
            if (state.ws && state.ws.readyState !== WebSocket.CLOSED) {
                state.ws.onclose = null;
                state.ws.onerror = null;
                state.ws.close();
            }

            const pr = location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${pr}//${location.host}/ws?serverId=${id}`;
            state.ws = new WebSocket(wsUrl);
            const out = document.getElementById('terminal-output');

            state.ws.onopen = () => {
                state.ws.send(JSON.stringify({ type: 'auth', token: state.token }));
                reconnectAttempts = 0;
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
                const b = document.getElementById('sh-status');
                if (b && b.textContent.includes('DISCONNECTED')) {
                    b.textContent = 'CONNECTING...';
                }
            };

            state.ws.onmessage = e => {
                const m = JSON.parse(e.data);
                if (m.type === 'console') {
                    if (out) {
                        out.textContent += m.data;
                        out.scrollTop = out.scrollHeight;
                    }
                    // Feed activity feed line by line
                    m.data.split(/\r?\n/).forEach(line => { if (line.trim()) overview.processConsoleLine(line); });
                } else if (m.type === 'history') {
                    if (out) {
                        out.textContent = m.data.join('');
                        out.scrollTop = out.scrollHeight;
                    }
                    // Parse history for activity on load
                    m.data.forEach(line => { if (line.trim()) overview.processConsoleLine(line); });
                } else if (m.type === 'clear_console') {
                    if (out) out.textContent = '';
                } else if (m.type === 'status') {
                    const b = document.getElementById('sh-status');
                    if (b) {
                        b.textContent = m.data.toUpperCase();
                        b.className = `status-badge ${m.data}`;
                    }
                    updateSidebarServerStatus(id, m.data);
                    // Refresh players when status changes to online
                    if (m.data === 'online' || m.data === 'offline') {
                        setTimeout(() => overview.refreshPlayers(), 1500);
                    }
                } else if (m.type === 'stats') {
                    const ramMb = Math.round(m.data.ram / 1024 / 1024);
                    const maxRamMb = state.currentServer?.ram_mb || 2048;
                    const displayRamMb = Math.min(ramMb, maxRamMb);
                    const cpuVal = Math.min(100, m.data.cpu);

                    const cpu = document.getElementById('ov-cpu');
                    if (cpu) cpu.textContent = `${cpuVal.toFixed(1)}%`;
                    const mem = document.getElementById('ov-mem');
                    if (mem) mem.textContent = `${displayRamMb} / ${maxRamMb} MB`;
                    const tempEl = document.getElementById('ov-temp');
                    const tempText = document.getElementById('sys-temp')?.textContent || '--°C';
                    if (tempEl) tempEl.textContent = tempText;

                    // Feed the smooth chart
                    const ramPct = Math.min(100, (displayRamMb / maxRamMb) * 100);
                    resourceChart.push(cpuVal, ramPct);

                    // Update overview progress bars
                    const tempNum = parseFloat(tempText);
                    overview.updateStats(cpuVal, ramPct, 0, 20, isNaN(tempNum) ? null : tempNum);
                }
            };

            state.ws.onclose = (event) => {
                if (Number(state.currentServer?.id) !== Number(id)) return;

                const b = document.getElementById('sh-status');
                if (b) {
                    b.textContent = 'DISCONNECTED (RECONNECTING...)';
                    b.className = 'status-badge offline';
                }
                updateSidebarServerStatus(id, 'offline');

                reconnectAttempts++;
                const delay = Math.min(5000, 1000 * reconnectAttempts);
                reconnectTimer = setTimeout(connect, delay);
            };

            state.ws.onerror = () => {
                state.ws.close();
            };
        };

        connect();

        const inp = document.getElementById('terminal-input');
        const cl = inp.cloneNode(true);
        inp.parentNode.replaceChild(cl, inp);
        cl.addEventListener('keypress', e => {
            if (e.key === 'Enter' && cl.value && state.ws && state.ws.readyState === 1) {
                state.ws.send(JSON.stringify({ type: 'command', data: cl.value }));
                const out = document.getElementById('terminal-output');
                if (out) {
                    out.textContent += `> ${cl.value}\n`;
                    out.scrollTop = out.scrollHeight;
                }
                cl.value = '';
            }
        });
    }
};

// Theme Toggler Helper
const theme = {
    init() {
        const stored = localStorage.getItem('mp_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', stored);
        this.updateButtons(stored);

        document.getElementById('theme-toggle-btn').addEventListener('click', () => {
            const curr = document.documentElement.getAttribute('data-theme');
            const next = curr === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('mp_theme', next);
            this.updateButtons(next);
            // Update any open CodeMirror editors
            const cmTheme = next === 'light' ? 'default' : 'dracula';
            if (window.fm?.editor) fm.editor.setOption('theme', cmTheme);
            if (window.props?.editor) props.editor.setOption('theme', cmTheme);
        });
    },
    updateButtons(t) {
        const darkIcon = document.getElementById('theme-icon-dark');
        const lightIcon = document.getElementById('theme-icon-light');
        if (t === 'dark') {
            darkIcon.style.display = 'block';
            lightIcon.style.display = 'none';
        } else {
            darkIcon.style.display = 'none';
            lightIcon.style.display = 'block';
        }
    }
};

// ── Overview Module ───────────────────────────────────────────────────────────
const overview = {
    _activityLog: [],

    // Called when WebSocket receives a console line — pick out events
    processConsoleLine(line) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        let type = null, msg = null;

        if (/joined the game/i.test(line)) {
            const m = line.match(/(\S+)\s+joined the game/i);
            const name = m ? m[1] : 'Someone';
            type = 'ev-join'; msg = `<strong>${name}</strong> joined`;
        } else if (/left the game/i.test(line)) {
            const m = line.match(/(\S+)\s+left the game/i);
            const name = m ? m[1] : 'Someone';
            type = 'ev-leave'; msg = `<strong>${name}</strong> left`;
        } else if (/Done \(\d+\.\d+s\)!/i.test(line)) {
            type = 'ev-start'; msg = `Server <strong>started</strong>`;
        } else if (/Stopping the server|Stopping server/i.test(line)) {
            type = 'ev-stop'; msg = `Server <strong>stopped</strong>`;
        } else if (/\[WARN\].*crash|Exception in thread|java\.lang\.\w+Exception/i.test(line)) {
            type = 'ev-crash'; msg = `<strong>Error/Crash</strong> detected`;
        } else if (/<(\S+)>\s+(.+)/.test(line)) {
            const m = line.match(/<(\S+)>\s+(.+)/);
            if (m) { type = 'ev-chat'; msg = `<strong>${m[1]}</strong>: ${m[2].substring(0, 60)}`; }
        }

        if (type && msg) {
            this._activityLog.unshift({ type, msg, time: timeStr });
            if (this._activityLog.length > 50) this._activityLog.pop();
            this._renderActivity();
        }
    },

    _renderActivity() {
        const feed = document.getElementById('ov-activity-feed');
        if (!feed) return;
        if (this._activityLog.length === 0) {
            feed.innerHTML = `<div class="ov-empty-state"><svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>No activity yet</span></div>`;
            return;
        }
        feed.innerHTML = this._activityLog.map(e =>
            `<div class="ov-activity-item ${e.type}">
                <span class="ov-activity-time">${e.time}</span>
                <span class="ov-activity-msg">${e.msg}</span>
            </div>`
        ).join('');
    },

    async refreshPlayers() {
        const list = document.getElementById('ov-players-list');
        const badge = document.getElementById('ov-player-badge');
        if (!list || !sid()) return;
        try {
            const data = await api.req(`/servers/${sid()}/players/online`);
            const names = data.players || [];
            if (badge) badge.textContent = names.length;
            if (names.length === 0) {
                list.innerHTML = `<div class="ov-empty-state"><svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><span>No players online</span></div>`;
            } else {
                list.innerHTML = names.map(name =>
                    `<div class="ov-player-row">
                        <img class="ov-player-avatar" src="https://mc-heads.net/avatar/${encodeURIComponent(name)}/24" alt="" onerror="this.src='data:image/svg+xml,<svg xmlns=\\'http://www.w3.org/2000/svg\\'/>'" loading="lazy">
                        <span>${name}</span>
                    </div>`
                ).join('');
            }
        } catch (_) {}
    },

    async refreshBackups() {
        const list = document.getElementById('ov-backups-list');
        if (!list || !sid()) return;
        try {
            const backups = await api.req(`/servers/${sid()}/backups`);
            const recent = backups.slice(0, 5);
            if (recent.length === 0) {
                list.innerHTML = `<div class="ov-empty-state"><span>No backups yet</span></div>`;
            } else {
                list.innerHTML = recent.map(b => {
                    const date = new Date(b.date);
                    const ago = this._timeAgo(date);
                    const size = this._fmtSize(b.size);
                    return `<div class="ov-backup-row">
                        <svg class="ov-backup-icon" viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" fill="none" stroke-width="1.75"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                        <span class="ov-backup-name" title="${b.name}">${b.name}</span>
                        <span class="ov-backup-meta">${size} · ${ago}</span>
                    </div>`;
                }).join('');
            }
        } catch (_) {
            list.innerHTML = `<div class="ov-empty-state"><span>Could not load backups</span></div>`;
        }
    },

    updateStats(cpuPct, ramPct, playerCount, maxPlayers, tempVal) {
        // Progress bars
        const cpuBar = document.getElementById('ov-cpu-bar');
        if (cpuBar) cpuBar.style.width = Math.min(100, cpuPct) + '%';
        const ramBar = document.getElementById('ov-ram-bar');
        if (ramBar) ramBar.style.width = Math.min(100, ramPct) + '%';
        const playersBar = document.getElementById('ov-players-bar');
        if (playersBar && maxPlayers > 0) playersBar.style.width = Math.min(100, (playerCount / maxPlayers) * 100) + '%';
        // Temp bar (0-100°C range)
        const tempBar = document.getElementById('ov-temp-bar');
        if (tempBar && tempVal !== null) tempBar.style.width = Math.min(100, tempVal) + '%';
    },

    _timeAgo(date) {
        const diff = Date.now() - date.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        return `${Math.floor(hrs / 24)}d ago`;
    },

    _fmtSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    },

    reset() {
        this._activityLog = [];
        this._renderActivity();
        const badge = document.getElementById('ov-player-badge');
        if (badge) badge.textContent = '0';
        const list = document.getElementById('ov-players-list');
        if (list) list.innerHTML = `<div class="ov-empty-state"><svg viewBox="0 0 24 24" width="28" height="28" stroke="currentColor" fill="none" stroke-width="1.5" opacity="0.3"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg><span>No players online</span></div>`;
    },

    init() {
        this.reset();
        this.refreshPlayers();
        this.refreshBackups();
        // New backup button in overview
        document.getElementById('ov-btn-backup')?.addEventListener('click', async () => {
            try {
                ui.toast('Creating backup...', 'info');
                await api.req(`/servers/${sid()}/backups/create`, { method: 'POST', body: JSON.stringify({ includes: 'all' }) });
                ui.toast('Backup created!', 'success');
                this.refreshBackups();
            } catch (e) { ui.toast(e.message, 'error'); }
        });
        // Clear activity
        document.getElementById('ov-activity-clear')?.addEventListener('click', () => {
            this._activityLog = [];
            this._renderActivity();
        });
    }
};
// ── End Overview Module ───────────────────────────────────────────────────────

// ── Smooth Resource Chart ──────────────────────────────────────────────────────
const resourceChart = (() => {
    const MAX_POINTS = 30;
    let cpuData = [], ramData = [], animFrame = null;

    function getAccentColor() {
        return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6366f1';
    }

    function draw() {
        const canvas = document.getElementById('resource-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const w = rect.width, h = rect.height;
        ctx.clearRect(0, 0, w, h);
        const accent = getAccentColor();

        function drawLine(data, strokeAlpha, fillAlpha) {
            if (data.length < 2) return;
            const pts = data.map((v, i) => ({
                x: (i / (MAX_POINTS - 1)) * w,
                y: h - (Math.min(100, Math.max(0, v)) / 100) * h * 0.88 - h * 0.06
            }));

            // Build the smooth curve path
            const buildCurve = (ctx2) => {
                ctx2.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length - 1; i++) {
                    const cx = (pts[i].x + pts[i + 1].x) / 2;
                    const cy = (pts[i].y + pts[i + 1].y) / 2;
                    ctx2.quadraticCurveTo(pts[i].x, pts[i].y, cx, cy);
                }
                ctx2.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            };

            // Gradient fill
            ctx.save();
            ctx.beginPath();
            buildCurve(ctx);
            ctx.lineTo(pts[pts.length - 1].x, h);
            ctx.lineTo(pts[0].x, h);
            ctx.closePath();
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            const m = accent.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
            if (m) {
                grad.addColorStop(0, `hsla(${m[1]},${m[2]}%,${m[3]}%,${fillAlpha})`);
                grad.addColorStop(1, `hsla(${m[1]},${m[2]}%,${m[3]}%,0)`);
            } else {
                grad.addColorStop(0, accent);
                grad.addColorStop(1, 'transparent');
            }
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.restore();

            // Line
            ctx.save();
            ctx.beginPath();
            buildCurve(ctx);
            ctx.globalAlpha = strokeAlpha;
            ctx.strokeStyle = accent;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.restore();
        }

        drawLine(ramData, 0.35, 0.08);
        drawLine(cpuData, 1, 0.18);

        // Y labels
        const mutedColor = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#777';
        ctx.fillStyle = mutedColor;
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        [['100%', 0.06], ['50%', 0.5], ['0%', 0.94]].forEach(([label, frac]) => {
            ctx.fillText(label, w - 2, frac * h + 4);
        });
    }

    function schedDraw() {
        if (animFrame) cancelAnimationFrame(animFrame);
        animFrame = requestAnimationFrame(draw);
    }

    return {
        push(cpu, ram) {
            cpuData.push(cpu); ramData.push(ram);
            if (cpuData.length > MAX_POINTS) { cpuData.shift(); ramData.shift(); }
            schedDraw();
        },
        reset() { cpuData = []; ramData = []; schedDraw(); }
    };
})();

// ── FTP Tab Logic ──────────────────────────────────────────────────────────────
const ftpManager = {
    _password: null,
    async load() {
        try {
            const data = await api.req(`/servers/${sid()}/ftp`);
            this._password = data.password || null;
            this.render(data);
        } catch (e) {
            const card = document.getElementById('ov-ftp-card');
            if (card) card.style.display = 'none';
        }
    },
    render(data) {
        const host = window.location.hostname;
        // Overview card
        const card = document.getElementById('ov-ftp-card');
        if (card) card.style.display = '';
        const ovHost = document.getElementById('ftp-host-display');
        if (ovHost) ovHost.textContent = (host === 'localhost' || host === '127.0.0.1') ? '127.0.0.1' : host;
        const ovPort = document.getElementById('ov-ftp-port');
        if (ovPort) ovPort.textContent = data.port || '—';
        const ovUser = document.getElementById('ov-ftp-user');
        if (ovUser) ovUser.textContent = data.username || '—';
        const ovStatus = document.getElementById('ov-ftp-status');
        if (ovStatus) { ovStatus.textContent = data.running ? 'ONLINE' : 'OFFLINE'; ovStatus.className = `status-badge ${data.running ? 'online' : 'offline'}`; }

        // FTP Tab
        const tabHost = document.getElementById('ftp-tab-host');
        if (tabHost) tabHost.textContent = (host === 'localhost' || host === '127.0.0.1') ? '127.0.0.1' : host;
        const tabPort = document.getElementById('ftp-tab-port');
        if (tabPort) tabPort.textContent = data.port || '—';
        const tabUser = document.getElementById('ftp-tab-user');
        if (tabUser) tabUser.textContent = data.username || '—';
        const tabPass = document.getElementById('ftp-tab-pass');
        if (tabPass) tabPass.textContent = '••••••••';
        const revealBtn = document.getElementById('ftp-reveal-pass');
        if (revealBtn) revealBtn.textContent = 'Show';

        const badge = document.getElementById('ftp-status-badge');
        if (badge) { badge.textContent = data.running ? 'ONLINE' : 'OFFLINE'; badge.className = `status-badge ${data.running ? 'online' : 'offline'}`; }
        const toggleBtn = document.getElementById('btn-ftp-toggle');
        if (toggleBtn) toggleBtn.textContent = data.enabled ? 'Disable FTP' : 'Enable FTP';

        const uInput = document.getElementById('ftp-cfg-username');
        if (uInput && data.username) uInput.value = data.username;
        const portInput = document.getElementById('ftp-cfg-port');
        if (portInput && data.port) portInput.value = data.port;
    }
};


// ── Accent Color ─────────────────────────────────────────────────────────────
const ACCENT_COLORS = [
    { id: 'emerald',       label: 'Emerald',        value: 'hsl(149,100%,47%)' },
    { id: 'midnight',      label: 'Midnight Blue',   value: 'hsl(230,60%,55%)'  },
    { id: 'sierra',        label: 'Sierra Blue',     value: 'hsl(190,85%,48%)'  },
    { id: 'pacific',       label: 'Pacific Blue',    value: 'hsl(210,78%,50%)'  },
    { id: 'alpine',        label: 'Alpine Green',    value: 'hsl(140,55%,38%)'  },
    { id: 'aquamarine',    label: 'Aquamarine',      value: 'hsl(160,60%,45%)'  },
    { id: 'lavender',      label: 'Lavender',        value: 'hsl(270,65%,60%)'  },
    { id: 'deeppurple',    label: 'Deep Purple',     value: 'hsl(280,70%,45%)'  },
    { id: 'babypink',      label: 'Baby Pink',       value: 'hsl(340,80%,60%)'  },
    { id: 'rosegold',      label: 'Rose Gold',       value: 'hsl(350,55%,65%)'  },
    { id: 'coral',         label: 'Coral',           value: 'hsl(10,90%,62%)'   },
    { id: 'tangerine',     label: 'Tangerine',       value: 'hsl(28,100%,55%)'  },
    { id: 'starlightgold', label: 'Starlight Gold',  value: 'hsl(45,95%,55%)'   },
    { id: 'graphite',      label: 'Graphite',        value: 'hsl(220,8%,55%)'   },
    { id: 'starlight',     label: 'Starlight',       value: 'hsl(36,18%,82%)'   },
];

const accentColor = {
    _current: null,

    _derive(hsl) {
        const m = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
        if (!m) return { base: hsl, hover: hsl, glow: hsl, subtle: hsl };
        const [, h, s, l] = m.map(Number);
        const lHover = Math.min(100, l + 8);
        return {
            base:   `hsl(${h},${s}%,${l}%)`,
            hover:  `hsl(${h},${s}%,${lHover}%)`,
            glow:   `hsla(${h},${s}%,${l}%,0.15)`,
            subtle: `hsla(${h},${s}%,${l}%,0.08)`,
        };
    },

    apply(hslValue) {
        const d = this._derive(hslValue);
        const root = document.documentElement;
        root.style.setProperty('--accent',        d.base);
        root.style.setProperty('--accent-hover',  d.hover);
        root.style.setProperty('--accent-glow',   d.glow);
        root.style.setProperty('--accent-subtle', d.subtle);
        root.style.setProperty('--green',         d.base);
        root.setAttribute('data-accent', hslValue);
        this._current = hslValue;
        document.querySelectorAll('.accent-circle').forEach(el => {
            el.classList.toggle('active', el.dataset.accent === hslValue);
        });
        const found = ACCENT_COLORS.find(c => c.value === hslValue);
        const nameEl = document.getElementById('accent-selected-name');
        if (nameEl && found) nameEl.textContent = found.label;
    },

    async save(hslValue) {
        try {
            await api.req('/users/me/accent', {
                method: 'POST',
                body: JSON.stringify({ accent: hslValue })
            });
        } catch (e) {
            console.warn('Failed to save accent color:', e.message);
        }
    },

    async load() {
        try {
            const r = await api.req('/users/me/accent');
            const color = r.accent || ACCENT_COLORS[0].value;
            this.apply(color);
        } catch (e) {
            this.apply(ACCENT_COLORS[0].value);
        }
    },

    buildPicker() {
        const grid = document.getElementById('accent-color-grid');
        if (!grid) return;
        grid.innerHTML = '';
        ACCENT_COLORS.forEach(color => {
            const item = document.createElement('div');
            item.className = 'accent-swatch-item';

            const btn = document.createElement('button');
            btn.className = 'accent-circle';
            btn.style.background = color.value;
            btn.dataset.accent = color.value;
            btn.title = color.label;
            if (this._current === color.value) btn.classList.add('active');

            btn.addEventListener('click', async () => {
                accentColor.apply(color.value);
                await accentColor.save(color.value);
                ui.toast(`Accent: ${color.label}`, 'success');
            });

            const label = document.createElement('span');
            label.className = 'accent-label';
            label.textContent = color.label;

            item.appendChild(btn);
            item.appendChild(label);
            grid.appendChild(item);
        });
        const nameEl = document.getElementById('accent-selected-name');
        if (nameEl && this._current) {
            const found = ACCENT_COLORS.find(c => c.value === this._current);
            if (found) nameEl.textContent = found.label;
        }
    }
};
// ── End Accent Color ──────────────────────────────────────────────────────────

// Global Routing / Tab Navigation
document.querySelectorAll('.sidebar-item').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetView = btn.dataset.view;
        if (!targetView) return;
        document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
        btn.classList.add('active');
        state.currentServer = null; // Unset server context
        if (state.ws) { state.ws.close(); state.ws = null; }

        if (targetView === 'users') {
            ui.showView('view-users');
            globalUsers.load();
        } else if (targetView === 'ranks') {
            ui.showView('view-ranks');
            globalRanks.load();
        } else if (targetView === 'panel-settings') {
            ui.showView('view-panel-settings');
            panelSettings.load();
            accentColor.buildPicker();
        } else if (targetView === 'super-important-docs') {
            ui.showView('view-super-important-docs');
            docs.load();
        }
    });
});

// Back buttons logic
document.getElementById('btn-back-to-list')?.addEventListener('click', () => {
    state.currentServer = null;
    if (state.ws) { state.ws.close(); state.ws = null; }
    document.querySelectorAll('.sidebar-server-item').forEach(btn => btn.classList.remove('active'));
    ui.showView('view-server-list');
    server.loadList();
});
document.getElementById('btn-back-from-users')?.addEventListener('click', () => {
    document.getElementById('sidebar-users-btn')?.classList.remove('active');
    ui.showView('view-server-list');
    server.loadList();
});
document.getElementById('btn-back-from-ranks')?.addEventListener('click', () => {
    document.getElementById('sidebar-ranks-btn')?.classList.remove('active');
    ui.showView('view-server-list');
    server.loadList();
});
document.getElementById('btn-back-from-settings')?.addEventListener('click', () => {
    document.getElementById('sidebar-settings-btn')?.classList.remove('active');
    ui.showView('view-server-list');
    server.loadList();
});
document.getElementById('btn-back-from-docs')?.addEventListener('click', () => {
    document.getElementById('sidebar-super-important-docs-btn')?.classList.remove('active');
    ui.showView('view-server-list');
    server.loadList();
});

// Auth form listeners
document.getElementById('login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const u = document.getElementById('username').value, p = document.getElementById('password').value;
    try {
        const d = await api.req('/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
        state.token = d.token; state.user = d.username; state.role = d.role || 'user'; state.userId = d.userId;
        localStorage.setItem('mp_token', d.token); localStorage.setItem('mp_user', d.username); localStorage.setItem('mp_role', d.role || 'user'); localStorage.setItem('mp_userid', d.userId);
        initDashboard();
    } catch (e) {
        if (e.message === 'Invalid credentials') {
            try { 
                await api.req('/auth/setup', { method: 'POST', body: JSON.stringify({ username: u, password: p }) }); 
                ui.toast('Admin created. Click Login again.', 'success'); 
            } catch (x) { 
                if (x.message === 'Setup already completed') {
                    ui.toast('Invalid credentials', 'error');
                } else {
                    ui.toast(x.message, 'error'); 
                }
            }
        } else ui.toast(e.message, 'error');
    }
});

document.getElementById('btn-go-to-register')?.addEventListener('click', () => {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
});

document.getElementById('link-back-to-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
});

document.getElementById('register-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const token = document.getElementById('reg-token').value;

    if (password !== confirmPassword) {
        return ui.toast("Passwords do not match", "error");
    }

    try {
        const res = await api.req('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, password, confirmPassword, token })
        });
        ui.toast(res.message || "Account created successfully. You can now log in.", "success");
        // Clear fields
        document.getElementById('reg-username').value = '';
        document.getElementById('reg-password').value = '';
        document.getElementById('reg-confirm-password').value = '';
        document.getElementById('reg-token').value = '';
        // Redirect back to login form
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
    } catch (err) {
        ui.toast(err.message, 'error');
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    if (metricsInterval) { clearInterval(metricsInterval); metricsInterval = null; }
    state.token = null; state.user = null; state.role = null; state.userId = null; state.currentServer = null;
    localStorage.removeItem('mp_token'); localStorage.removeItem('mp_user'); localStorage.removeItem('mp_role'); localStorage.removeItem('mp_userid');
    if (state.ws) state.ws.close();
    ui.showView('auth-view');
    document.getElementById('auth-view').classList.add('active');
    document.getElementById('main-view').classList.remove('active');
});

// Helper: clear the frontend console view
function clearConsoleView() {
    const out = document.getElementById('terminal-output');
    if (out) out.textContent = '';
}

// Server control operations — auto-clear console on lifecycle events
document.getElementById('btn-start').addEventListener('click', async () => {
    try {
        clearConsoleView();
        await api.req(`/servers/${sid()}/start`, { method: 'POST' });
        ui.toast('Starting...', 'success');
    } catch (e) { ui.toast(e.message, 'error'); }
});

document.getElementById('btn-stop').addEventListener('click', async () => {
    try {
        clearConsoleView();
        const r = await api.req(`/servers/${sid()}/stop`, { method: 'POST' });
        if (r.graceful === false) {
            ui.toast('Stop command sent. Server is still shutting down — use Kill to force.', 'warning');
        } else {
            ui.toast('Server stopped gracefully', 'success');
        }
    } catch (e) { ui.toast(e.message, 'error'); }
});

document.getElementById('btn-restart').addEventListener('click', async () => {
    try {
        clearConsoleView();
        const r = await api.req(`/servers/${sid()}/restart`, { method: 'POST' });
        if (r.graceful === false) {
            ui.toast(r.message || 'Restart timed out. Use Kill to force.', 'warning');
        } else if (r.started) {
            ui.toast('Server restarted successfully', 'success');
        } else {
            ui.toast(r.message || 'Server stopped but failed to restart', 'error');
        }
    } catch (e) { ui.toast(e.message, 'error'); }
});

// Kill Server — force terminate only this server PID
document.getElementById('btn-kill').addEventListener('click', async () => {
    if (!(await ui.confirm('Force-kill the server process? This may cause data loss.', 'Kill Server'))) return;
    try {
        clearConsoleView();
        await api.req(`/servers/${sid()}/kill`, { method: 'POST' });
        ui.toast('Server process killed', 'success');
    } catch (e) { ui.toast(e.message, 'error'); }
});

// Delete Server
document.getElementById('btn-delete-server')?.addEventListener('click', async () => {
    if (!(await ui.confirm('WARNING: This will permanently delete the server, all its files, and settings. Are you absolutely sure?', 'Delete Server'))) return;
    try {
        await api.req(`/servers/${sid()}`, { method: 'DELETE' });
        ui.toast('Server deleted successfully', 'success');
        document.getElementById('btn-back-to-list').click();
    } catch (e) { ui.toast(e.message, 'error'); }
});

// Clear Console — frontend only, does not touch server logs
document.getElementById('btn-console-clear')?.addEventListener('click', async () => {
    clearConsoleView();
    try { await api.req(`/servers/${sid()}/clear-console`, { method: 'POST' }); } catch (_) {}
    ui.toast('Console cleared', 'info');
});

// Deploy Server button modal handlers
document.getElementById('btn-deploy-server').addEventListener('click', () => {
    updateVersionDropdown('cs-software', 'cs-version');
    ui.showModal('modal-create-server');
});
document.getElementById('btn-sidebar-new-server').addEventListener('click', () => {
    updateVersionDropdown('cs-software', 'cs-version');
    ui.showModal('modal-create-server');
});
document.getElementById('modal-create-server-close').addEventListener('click', () => ui.closeModals());
document.getElementById('modal-create-server-cancel').addEventListener('click', () => ui.closeModals());
document.getElementById('btn-deploy-confirm').addEventListener('click', async () => {
    const n = document.getElementById('cs-name').value, sw = document.getElementById('cs-software').value;
    const v = document.getElementById('cs-version').value, r = document.getElementById('cs-ram').value, p = document.getElementById('cs-port').value;
    if (!n || !v) return ui.toast('Name and version required', 'error');
    try {
        ui.toast('Creating server...', 'info');
        await api.req('/servers/create', { method: 'POST', body: JSON.stringify({ name: n, software: sw, version: v, ram_mb: +r, port: +p }) });
        ui.closeModals(); ui.toast('Server deployed successfully!', 'success'); server.loadList();
    } catch (e) { ui.toast(e.message, 'error'); }
});

// ── Import Server ─────────────────────────────────────────────────────────────
(function () {
    let importFile = null;

    function openImportModal() {
        // Reset state
        importFile = null;
        document.getElementById('import-dropzone-label').textContent = 'Click to select a .zip file, or drag & drop here';
        document.getElementById('import-dropzone').style.borderColor = '';
        document.getElementById('import-dropzone').style.background = '';
        document.getElementById('imp-name').value = '';
        document.getElementById('imp-port').value = '25565';
        document.getElementById('imp-software').value = 'paper';
        updateVersionDropdown('imp-software', 'imp-version');
        document.getElementById('imp-ram').value = '2048';
        document.getElementById('imp-jar').value = '';
        document.getElementById('imp-root').value = '';
        document.getElementById('import-progress-wrap').style.display = 'none';
        document.getElementById('import-progress-bar').style.width = '0%';
        document.getElementById('import-zip-input').value = '';
        document.getElementById('btn-import-confirm').disabled = false;
        ui.showModal('modal-import-server');
    }

    function setFile(file) {
        if (!file) return;
        importFile = file;
        const label = document.getElementById('import-dropzone-label');
        label.textContent = `✓ ${file.name} (${ui.bytes(file.size)})`;
        document.getElementById('import-dropzone').style.borderColor = 'var(--accent)';
        document.getElementById('import-dropzone').style.background = 'var(--accent-subtle)';
        // Auto-fill server name from filename if empty
        const nameEl = document.getElementById('imp-name');
        if (!nameEl.value) {
            nameEl.value = file.name.replace(/\.zip$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
    }

    document.getElementById('btn-import-server')?.addEventListener('click', openImportModal);
    document.getElementById('btn-sidebar-import-server')?.addEventListener('click', openImportModal);
    document.getElementById('modal-import-server-close').addEventListener('click', () => ui.closeModals());
    document.getElementById('modal-import-server-cancel').addEventListener('click', () => ui.closeModals());

    // File input change
    document.getElementById('import-zip-input').addEventListener('change', e => {
        if (e.target.files[0]) setFile(e.target.files[0]);
    });

    // Drag & drop
    const dz = document.getElementById('import-dropzone');
    dz.addEventListener('dragover', e => { e.preventDefault(); dz.style.borderColor = 'var(--accent)'; });
    dz.addEventListener('dragleave', () => { if (!importFile) dz.style.borderColor = ''; });
    dz.addEventListener('drop', e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && (file.name.endsWith('.zip') || file.type === 'application/zip')) {
            document.getElementById('import-zip-input').value = '';
            setFile(file);
        } else {
            ui.toast('Only .zip files are accepted', 'error');
        }
    });

    // Confirm import
    document.getElementById('btn-import-confirm').addEventListener('click', async () => {
        if (!importFile) return ui.toast('Please select a .zip archive first', 'error');

        const name    = document.getElementById('imp-name').value.trim();
        const port    = document.getElementById('imp-port').value;
        const software= document.getElementById('imp-software').value;
        const version = document.getElementById('imp-version').value.trim();
        const ram     = document.getElementById('imp-ram').value;
        const jar     = document.getElementById('imp-jar').value.trim();
        const root    = document.getElementById('imp-root').value.trim();

        if (!name)    return ui.toast('Server name is required', 'error');
        if (!version) return ui.toast('Minecraft version is required', 'error');
        if (!jar)     return ui.toast('Executable path is required', 'error');

        // Build FormData with XHR so we can show upload progress
        const fd = new FormData();
        fd.append('archive',  importFile, importFile.name);
        fd.append('name',     name);
        fd.append('port',     port);
        fd.append('software', software);
        fd.append('version',  version);
        fd.append('ram_mb',   ram);
        fd.append('jar_path', jar);
        fd.append('root_path',root);

        document.getElementById('import-progress-wrap').style.display = 'block';
        document.getElementById('btn-import-confirm').disabled = true;
        document.getElementById('import-progress-label').textContent = 'Uploading…';

        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/servers/import');
        xhr.setRequestHeader('Authorization', `Bearer ${state.token}`);

        xhr.upload.onprogress = e => {
            if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 90); // up to 90% for upload
                document.getElementById('import-progress-bar').style.width = `${pct}%`;
                document.getElementById('import-progress-pct').textContent = `${pct}%`;
                if (pct >= 90) document.getElementById('import-progress-label').textContent = 'Extracting & configuring…';
            }
        };

        xhr.onload = () => {
            document.getElementById('import-progress-bar').style.width = '100%';
            document.getElementById('import-progress-pct').textContent = '100%';
            let data;
            try { data = JSON.parse(xhr.responseText); } catch { data = { error: 'Invalid server response' }; }
            if (xhr.status >= 200 && xhr.status < 300) {
                ui.toast(`"${name}" imported successfully!`, 'success');
                ui.closeModals();
                server.loadList();
            } else {
                document.getElementById('btn-import-confirm').disabled = false;
                document.getElementById('import-progress-wrap').style.display = 'none';
                ui.toast(data.error || 'Import failed', 'error');
            }
        };

        xhr.onerror = () => {
            document.getElementById('btn-import-confirm').disabled = false;
            document.getElementById('import-progress-wrap').style.display = 'none';
            ui.toast('Network error during import', 'error');
        };

        xhr.send(fd);
    });
}());
// ── End Import Server ─────────────────────────────────────────────────────────

// ── Version Dropdown Helper ──────────────────────────────────────────────────
function updateVersionDropdown(softwareSelectId, versionSelectId, selectedVersion = null) {
    const swSelect = document.getElementById(softwareSelectId);
    const verSelect = document.getElementById(versionSelectId);
    if (!swSelect || !verSelect) return;
    verSelect.innerHTML = '';
    
    if (!state.versions) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Loading versions...';
        verSelect.appendChild(opt);
        return;
    }
    
    const software = swSelect.value.toLowerCase();
    const versions = state.versions[software] || [];
    if (versions.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No versions available';
        verSelect.appendChild(opt);
        return;
    }
    versions.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        if (selectedVersion && v === selectedVersion) opt.selected = true;
        verSelect.appendChild(opt);
    });
}

document.getElementById('cs-software')?.addEventListener('change', () => updateVersionDropdown('cs-software', 'cs-version'));
document.getElementById('imp-software')?.addEventListener('change', () => updateVersionDropdown('imp-software', 'imp-version'));
document.getElementById('sv-new-software')?.addEventListener('change', () => updateVersionDropdown('sv-new-software', 'sv-new-version', state.currentServer?.version));

async function refreshVersions() {
    ui.toast('Syncing latest Minecraft versions from APIs...', 'info');
    try {
        const versions = await api.req('/system/versions?refresh=true');
        state.versions = versions;
        updateVersionDropdown('cs-software', 'cs-version');
        updateVersionDropdown('imp-software', 'imp-version');
        if (state.currentServer) {
            updateVersionDropdown('sv-new-software', 'sv-new-version', state.currentServer.version);
        }
        ui.toast('Versions synced successfully!', 'success');
    } catch (err) {
        console.error('[refreshVersions] Error:', err);
        ui.toast('Sync failed: ' + err.message, 'error');
    }
}

document.getElementById('btn-cs-version-refresh')?.addEventListener('click', refreshVersions);
document.getElementById('btn-imp-version-refresh')?.addEventListener('click', refreshVersions);
document.getElementById('btn-sv-version-refresh')?.addEventListener('click', refreshVersions);
// ─────────────────────────────────────────────────────────────────────────────

let metricsInterval = null;
function initDashboard() {
    document.getElementById('auth-view').classList.remove('active');
    document.getElementById('main-view').classList.add('active');
    document.getElementById('sidebar-username').textContent = state.user;
    
    if (state.user) {
        const initials = state.user.slice(0, 2).toUpperCase();
        const mobInitialsEl = document.getElementById('mobile-user-dropdown-trigger');
        if (mobInitialsEl) mobInitialsEl.textContent = initials;
        const mobUserEl = document.getElementById('mobile-dropdown-username');
        if (mobUserEl) mobUserEl.textContent = state.user;
    }

    ui.showView('view-server-list');
    server.loadList();
    theme.init();
    accentColor.load().then(() => accentColor.buildPicker());

    // Fetch and cache system versions
    api.req('/system/versions').then(versions => {
        state.versions = versions;
        updateVersionDropdown('cs-software', 'cs-version');
        updateVersionDropdown('imp-software', 'imp-version');
        if (state.currentServer) {
            updateVersionDropdown('sv-new-software', 'sv-new-version', state.currentServer.version);
        }
    }).catch(err => {
        console.error('[initDashboard] Failed to fetch versions:', err);
    });

    if (metricsInterval) clearInterval(metricsInterval);
    metricsInterval = setInterval(async () => {
        if (!state.token) return;
        try {
            const r = await fetch('/api/system/metrics', { headers: { 'Authorization': `Bearer ${state.token}` } });
            if (r.status === 401) {
                document.getElementById('logout-btn')?.click();
                return;
            }
            if (r.ok) {
                const d = await r.json();
                document.getElementById('sys-cpu').textContent = `${d.cpu.usage.toFixed(1)}%`;
                document.getElementById('sys-mem').textContent = `${d.memory.usedPercentage}%`;
                const tempEl = document.getElementById('sys-temp');
                if (tempEl) {
                    const tempVal = d.cpu.temp !== null && d.cpu.temp !== undefined ? `${Math.round(d.cpu.temp)}°C` : 'N/A';
                    tempEl.textContent = tempVal;
                    const ovTemp = document.getElementById('ov-temp');
                    if (ovTemp) ovTemp.textContent = tempVal;
                }
            }
        } catch (e) {}
    }, 4000);
}

// Sub nav tabs switcher (lazy module loader)
document.querySelectorAll('#server-tabs .sub-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#server-tabs .sub-nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const t = btn.dataset.tab;
        document.getElementById(`tab-${t}`)?.classList.add('active');
        if (t === 'files') fm.load('/');
        if (t === 'properties') { props.load(); serverIcon.load(); serverIcon.initPicker(); }
        if (t === 'players') players.load();
        if (t === 'plugins') plugins.init();
        if (t === 'backups') backups.load();
        if (t === 'logs') logs.init();
        if (t === 'settings') srvSettings.load();
        if (t === 'ftp') ftpManager.load();
        if (t === 'overview') { resourceChart.reset(); overview.init(); }
    });
});

// FTP button handlers
document.getElementById('btn-ftp-save-config')?.addEventListener('click', async () => {
    const username = document.getElementById('ftp-cfg-username')?.value;
    const password = document.getElementById('ftp-cfg-password')?.value;
    const port = parseInt(document.getElementById('ftp-cfg-port')?.value);
    if (!username || !port) return ui.toast('Username and port are required', 'error');
    try {
        await api.req(`/servers/${sid()}/ftp/config`, { method: 'POST', body: JSON.stringify({ username, password, port }) });
        ui.toast('FTP config saved', 'success');
        document.getElementById('ftp-cfg-password').value = '';
        ftpManager.load();
    } catch (e) { ui.toast(e.message, 'error'); }
});

document.getElementById('btn-ftp-toggle')?.addEventListener('click', async () => {
    try {
        const data = await api.req(`/servers/${sid()}/ftp/toggle`, { method: 'POST' });
        ftpManager.render({ ...data, username: document.getElementById('ftp-tab-user')?.textContent, port: document.getElementById('ftp-tab-port')?.textContent });
        ftpManager.load();
        ui.toast(data.enabled ? 'FTP enabled' : 'FTP disabled', 'success');
    } catch (e) { ui.toast(e.message, 'error'); }
});

document.getElementById('ftp-show-pass')?.addEventListener('click', () => {
    const inp = document.getElementById('ftp-cfg-password');
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    document.getElementById('ftp-show-pass').textContent = inp.type === 'password' ? 'Show' : 'Hide';
});

document.getElementById('ftp-reveal-pass')?.addEventListener('click', () => {
    const passEl = document.getElementById('ftp-tab-pass');
    const btn = document.getElementById('ftp-reveal-pass');
    if (!passEl || !btn) return;
    if (btn.textContent === 'Show') {
        passEl.textContent = ftpManager._password || '(not set)';
        btn.textContent = 'Hide';
    } else {
        passEl.textContent = '••••••••';
        btn.textContent = 'Show';
    }
});

// Quick action shortcuts
document.getElementById('qa-console')?.addEventListener('click', () => document.querySelector('[data-tab="console"]').click());
document.getElementById('qa-files')?.addEventListener('click', () => document.querySelector('[data-tab="files"]').click());
document.getElementById('qa-backup')?.addEventListener('click', () => { document.querySelector('[data-tab="backups"]').click(); setTimeout(() => backups.create(), 300); });
document.getElementById('qa-properties')?.addEventListener('click', () => document.querySelector('[data-tab="properties"]').click());

if (state.token) initDashboard(); else document.getElementById('auth-view').classList.add('active');

// Mobile Drawer & Dropdown Menu Interaction Logic
(function() {
    const mobileOverlay = document.getElementById('mobile-overlay');
    const sidebar = document.getElementById('sidebar');
    const hamburger = document.getElementById('mobile-hamburger');
    const closeBtn = document.getElementById('sidebar-close-btn');

    function closeMobileDrawer() {
        if (sidebar) sidebar.classList.remove('active');
        if (mobileOverlay) mobileOverlay.classList.remove('active');
    }

    function openMobileDrawer() {
        if (sidebar) sidebar.classList.add('active');
        if (mobileOverlay) mobileOverlay.classList.add('active');
    }

    if (hamburger) hamburger.onclick = openMobileDrawer;
    if (closeBtn) closeBtn.onclick = closeMobileDrawer;
    if (mobileOverlay) mobileOverlay.onclick = closeMobileDrawer;

    // Event delegation for sidebar item clicks (handles dynamic elements like servers too)
    document.getElementById('sidebar')?.addEventListener('click', (e) => {
        if (e.target.closest('.sidebar-item')) {
            closeMobileDrawer();
        }
    });
    document.getElementById('nav-brand-btn')?.addEventListener('click', closeMobileDrawer);

    // Mobile user dropdown toggle
    const dropdownTrigger = document.getElementById('mobile-user-dropdown-trigger');
    const dropdownMenu = document.getElementById('mobile-user-dropdown');
    if (dropdownTrigger && dropdownMenu) {
        dropdownTrigger.onclick = (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('active');
        };
        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            dropdownMenu.classList.remove('active');
        });
    }

    // Mobile logout
    document.getElementById('mobile-logout-btn')?.addEventListener('click', () => {
        document.getElementById('logout-btn')?.click();
    });
})();
