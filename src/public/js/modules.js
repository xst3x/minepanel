const FOLDER_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
const FILE_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text-secondary)" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>`;

const createMatrixCheckbox = (colId, key, checked, locked, onChange) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'matrix-checkbox-wrapper';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'matrix-checkbox';
    input.checked = checked;
    input.disabled = locked;
    
    const square = document.createElement('span');
    square.className = `matrix-checkbox-square ${locked ? 'locked' : ''}`;
    if (locked) {
        square.title = "Granted by Rank (Locked)";
    }

    input.onchange = (e) => {
        onChange(e.target.checked);
    };

    wrapper.appendChild(input);
    wrapper.appendChild(square);
    return wrapper;
};

// File Manager
const fm = {
    currentPath: '/', editor: null,
    async load(p) {
        if (!p.startsWith('/')) p = '/' + p;
        if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
        fm.currentPath = p;
        document.getElementById('fm-path').textContent = p;
        try {
            const items = await api.req(`/servers/${sid()}/files/list?path=${encodeURIComponent(p)}`);
            const list = document.getElementById('fm-list'); list.innerHTML = '';
            if (p !== '/') {
                const up = document.createElement('div'); up.className = 'fm-item';
                up.innerHTML = `<div class="fm-icon">${FOLDER_SVG}</div><div class="fm-col name">..</div>`;
                const parentPath = p.split('/').slice(0, -1).join('/') || '/';
                up.onclick = () => fm.load(parentPath);
                list.appendChild(up);
            }
            items.sort((a, b) => b.isDirectory - a.isDirectory || a.name.localeCompare(b.name)).forEach(item => {
                const el = document.createElement('div'); el.className = 'fm-item';
                const icon = item.isDirectory ? FOLDER_SVG : FILE_SVG;
                const sz = item.isDirectory ? '--' : ui.bytes(item.size);
                el.innerHTML = `
                    <div class="fm-icon">${icon}</div>
                    <div class="fm-col name fm-item-name" data-label="Name">${item.name}</div>
                    <div class="fm-col size" data-label="Size">${sz}</div>
                    <div class="fm-col date" data-label="Modified">${new Date(item.modifiedAt).toLocaleString()}</div>
                    <div class="fm-col actions" style="display:flex;gap:0.25rem;justify-content:flex-end" data-label="Actions">
                        <button class="btn outline small" data-dl="${item.name}">Download</button>
                        <button class="btn danger small" data-del="${item.name}">Del</button>
                    </div>
                `;
                el.querySelector('[data-dl]').onclick = e => {
                    e.stopPropagation();
                    const dlPath = p === '/' ? `/${item.name}` : `${p}/${item.name}`;
                    const dlName = item.name + (item.isDirectory ? '.zip' : '');
                    if (item.isDirectory) {
                        // Folder: ask server to zip it, get a one-time token URL, open in new tab
                        ui.toast('Preparing folder zip…', 'info');
                        api.req(`/servers/${sid()}/files/download?path=${encodeURIComponent(dlPath)}`)
                            .then(r => {
                                if (r.downloadUrl) {
                                    window.open(r.downloadUrl, '_blank');
                                } else {
                                    ui.toast('Failed to prepare download', 'error');
                                }
                            })
                            .catch(err => ui.toast(err.message, 'error'));
                    } else {
                        api.download(`/servers/${sid()}/files/download?path=${encodeURIComponent(dlPath)}`, dlName);
                    }
                };
                el.querySelector('[data-del]').onclick = e => { e.stopPropagation(); fm.del(item.name); };
                el.onclick = () => {
                    const fp = p === '/' ? `/${item.name}` : `${p}/${item.name}`;
                    item.isDirectory ? fm.load(fp) : fm.openFile(fp);
                };
                list.appendChild(el);
            });
        } catch (e) { ui.toast(e.message, 'error'); }
    },
    async openFile(fp) {
        try {
            const r = await api.req(`/servers/${sid()}/files/read?path=${encodeURIComponent(fp)}`);
            document.getElementById('editor-filename').textContent = `editing: ${fp}`;
            document.getElementById('editor-filename').dataset.path = fp;
            ui.showModal('modal-file-editor');
            const cmTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'dracula';
            if (!fm.editor) fm.editor = CodeMirror.fromTextArea(document.getElementById('file-editor-area'), { lineNumbers: true, theme: cmTheme, mode: 'javascript' });
            else fm.editor.setOption('theme', cmTheme);
            if (fp.endsWith('.yml') || fp.endsWith('.yaml')) fm.editor.setOption('mode', 'yaml');
            else if (fp.endsWith('.properties')) fm.editor.setOption('mode', 'properties');
            else fm.editor.setOption('mode', 'javascript');
            fm.editor.setValue(r.content);
            setTimeout(() => fm.editor.refresh(), 100);
        } catch (e) { ui.toast(e.message, 'error'); }
    },
    async saveFile() {
        const fp = document.getElementById('editor-filename').dataset.path;
        try { await api.req(`/servers/${sid()}/files/write`, { method: 'POST', body: JSON.stringify({ path: fp, content: fm.editor.getValue() }) }); ui.closeModals(); ui.toast('File saved', 'success'); } catch (e) { ui.toast(e.message, 'error'); }
    },
    async del(name) {
        if (!(await ui.confirm(`Delete ${name}?`))) return;
        const fp = fm.currentPath === '/' ? `/${name}` : `${fm.currentPath}/${name}`;
        try { await api.req(`/servers/${sid()}/files/delete`, { method: 'POST', body: JSON.stringify({ path: fp }) }); fm.load(fm.currentPath); ui.toast('Deleted', 'success'); } catch (e) { ui.toast(e.message, 'error'); }
    },
    async mkdir() {
        const name = await ui.prompt('Folder name:', '', 'New Folder'); if (!name) return;
        const fp = fm.currentPath === '/' ? `/${name}` : `${fm.currentPath}/${name}`;
        try { await api.req(`/servers/${sid()}/files/mkdir`, { method: 'POST', body: JSON.stringify({ path: fp }) }); fm.load(fm.currentPath); ui.toast('Folder created', 'success'); } catch (e) { ui.toast(e.message, 'error'); }
    },
    async newFile() {
        const name = await ui.prompt('File name:', '', 'New File'); if (!name) return;
        const fp = fm.currentPath === '/' ? `/${name}` : `${fm.currentPath}/${name}`;
        try { await api.req(`/servers/${sid()}/files/create`, { method: 'POST', body: JSON.stringify({ path: fp }) }); fm.load(fm.currentPath); ui.toast('File created', 'success'); } catch (e) { ui.toast(e.message, 'error'); }
    }
};

document.getElementById('btn-editor-save').addEventListener('click', () => fm.saveFile());
document.getElementById('btn-fm-newfolder').addEventListener('click', () => fm.mkdir());
document.getElementById('btn-fm-newfile').addEventListener('click', () => fm.newFile());
document.getElementById('btn-fm-upload-trigger').addEventListener('click', () => document.getElementById('fm-upload').click());
document.getElementById('fm-upload').addEventListener('change', async e => {
    const files = e.target.files; if (!files.length) return;
    for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const fd = new FormData(); fd.append('file', f); fd.append('path', fm.currentPath);
        try { await api.req(`/servers/${sid()}/files/upload`, { method: 'POST', body: fd }); ui.toast(`Uploaded ${f.name}`, 'success'); } catch (x) { ui.toast(x.message, 'error'); }
    }
    fm.load(fm.currentPath); e.target.value = '';
});
document.getElementById('modal-file-editor-close').addEventListener('click', () => ui.closeModals());

// â”€â”€ MOTD Editor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Styled to match the rest of MinePanel (same CSS vars, btn classes, prop-item look)
const motdEditor = {
    _wrap: null,
    _value: '',
    _obfInterval: null,

    MC_COLORS: [
        {code:'0',hex:'#000000',name:'Black'},
        {code:'1',hex:'#0000AA',name:'Dark Blue'},
        {code:'2',hex:'#00AA00',name:'Dark Green'},
        {code:'3',hex:'#00AAAA',name:'Dark Aqua'},
        {code:'4',hex:'#AA0000',name:'Dark Red'},
        {code:'5',hex:'#AA00AA',name:'Dark Purple'},
        {code:'6',hex:'#FFAA00',name:'Gold'},
        {code:'7',hex:'#AAAAAA',name:'Gray'},
        {code:'8',hex:'#555555',name:'Dark Gray'},
        {code:'9',hex:'#5555FF',name:'Blue'},
        {code:'a',hex:'#55FF55',name:'Green'},
        {code:'b',hex:'#55FFFF',name:'Aqua'},
        {code:'c',hex:'#FF5555',name:'Red'},
        {code:'d',hex:'#FF55FF',name:'Light Purple'},
        {code:'e',hex:'#FFFF55',name:'Yellow'},
        {code:'f',hex:'#FFFFFF',name:'White'},
    ],

    MC_FORMATS: [
        {code:'l',label:'<strong>B</strong>',title:'Bold (&l)'},
        {code:'o',label:'<em>I</em>',title:'Italic (&o)'},
        {code:'n',label:'<u>U</u>',title:'Underline (&n)'},
        {code:'m',label:'<s>S</s>',title:'Strikethrough (&m)'},
        {code:'k',label:'obf',title:'Obfuscated (&k)'},
        {code:'r',label:'R',title:'Reset (&r)'},
    ],

    SPECIAL_CHARS: 'Â§Â¶Â©Â®â„¢Â°Â±Ã—Ã·â†â†’â†‘â†“â†”â˜…â˜†â™ â™£â™¥â™¦•â–ªâ–²â–¶â—†â—âˆžâˆšâˆ‘Ï€Î”Î©Î±Î²Î³Î»â˜€âš¡âš”âš™âœ“âœ—â¤â™©â™ªâ™«â™¬â‘ â‘¡â‘¢â‘£â‘¤â‘¥â‘¦â‘§â‘¨â‘©'.split(''),

    getValue() {
        return this._value;
    },

    _insert(text) {
        const ta = this._wrap && this._wrap.querySelector('textarea.motd-raw');
        if (!ta) return;
        const s = ta.selectionStart, e = ta.selectionEnd;
        const newVal = ta.value.slice(0, s) + text + ta.value.slice(e);
        ta.value = newVal;
        this._value = newVal;
        ta.selectionStart = ta.selectionEnd = s + text.length;
        ta.focus();
        this._updatePreview();
    },

    _parseMotd(raw) {
        const colorMap = {};
        this.MC_COLORS.forEach(c => colorMap[c.code] = c.hex);
        const OBF = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
        let html = '', curColor = '#aaaaaa', bold=false, italic=false, under=false, strike=false, obf=false;
        for (let i = 0; i < raw.length; i++) {
            if ((raw[i]==='&'||raw[i]==='Â§') && i+1<raw.length) {
                const c = raw[i+1].toLowerCase();
                if (colorMap[c]) { curColor=colorMap[c]; bold=italic=under=strike=obf=false; }
                else if(c==='l') bold=true;
                else if(c==='o') italic=true;
                else if(c==='n') under=true;
                else if(c==='m') strike=true;
                else if(c==='k') obf=true;
                else if(c==='r') { curColor='#aaaaaa'; bold=italic=under=strike=obf=false; }
                i++; continue;
            }
            let s=`color:${curColor};`;
            if(bold) s+='font-weight:700;';
            if(italic) s+='font-style:italic;';
            const td=[]; if(under) td.push('underline'); if(strike) td.push('line-through');
            if(td.length) s+=`text-decoration:${td.join(' ')};`;
            const safe=raw[i]==='<'?'&lt;':raw[i]==='>'?'&gt;':raw[i]==='&'?'&amp;':raw[i];
            if(obf) {
                html+=`<span class="mc-obf" style="${s}">${OBF[Math.floor(Math.random()*OBF.length)]}</span>`;
            } else {
                html+=`<span style="${s}">${safe}</span>`;
            }
        }
        return html;
    },

    _updatePreview() {
        const preview = this._wrap && this._wrap.querySelector('.motd-preview');
        if (preview) preview.innerHTML = this._parseMotd(this._value) || '<span style="color:#444">preview...</span>';
    },

    init(wrap, initialValue) {
        this._wrap = wrap;
        this._value = initialValue || '';
        if (this._obfInterval) clearInterval(this._obfInterval);

        wrap.innerHTML = `
<div style="display:flex;flex-direction:column;gap:10px;">

  <!-- Color swatches -->
  <div style="display:flex;flex-wrap:wrap;gap:5px;" class="motd-colors"></div>

  <!-- Format buttons -->
  <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;" class="motd-fmts"></div>

  <!-- Textarea -->
  <textarea
    class="motd-raw"
    rows="2"
    spellcheck="false"
    placeholder="e.g. &aWelcome to &6My Server!"
    style="width:100%;padding:9px 12px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);color:var(--text-primary);font-family:var(--font-mono);font-size:13px;resize:vertical;outline:none;transition:var(--transition);line-height:1.5;"
  ></textarea>

  <!-- Preview -->
  <div
    class="motd-preview"
    style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);padding:9px 14px;min-height:36px;font-family:var(--font-mono);font-size:13.5px;line-height:1.5;word-break:break-all;color:#aaa;"
  ></div>

  <!-- Special chars toggle -->
  <div style="display:flex;align-items:center;gap:8px;">
    <button type="button" class="btn outline small motd-chars-toggle">Special chars â–¾</button>
    <span style="font-size:11.5px;color:var(--text-muted);">Click a color or format to insert at cursor</span>
  </div>

  <!-- Special chars panel -->
  <div class="motd-chars-panel" style="display:none;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);padding:8px;max-height:120px;overflow-y:auto;">
    <div class="motd-chars-grid" style="display:flex;flex-wrap:wrap;gap:3px;"></div>
  </div>

</div>`;

        // Focus style on textarea
        const ta = wrap.querySelector('textarea.motd-raw');
        ta.value = this._value;
        ta.addEventListener('focus', () => { ta.style.borderColor = 'var(--accent)'; ta.style.boxShadow = '0 0 0 3px var(--accent-glow)'; });
        ta.addEventListener('blur',  () => { ta.style.borderColor = 'var(--border)';  ta.style.boxShadow = 'none'; });
        ta.addEventListener('input', () => { this._value = ta.value; this._updatePreview(); });

        // Color swatches
        const colRow = wrap.querySelector('.motd-colors');
        this.MC_COLORS.forEach(c => {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.title = `&${c.code} "” ${c.name}`;
            swatch.style.cssText = [
                `width:22px;height:22px;border-radius:var(--radius-sm);`,
                `background:${c.hex};`,
                `border:1px solid rgba(255,255,255,0.12);`,
                `cursor:pointer;padding:0;flex-shrink:0;`,
                `font-family:var(--font-mono);font-size:9px;font-weight:700;`,
                `color:${['0','1','2','3','4','5','8'].includes(c.code)?'rgba(255,255,255,0.7)':'rgba(0,0,0,0.6)'};`,
                `transition:var(--transition);display:flex;align-items:center;justify-content:center;`
            ].join('');
            swatch.textContent = c.code;
            swatch.onmouseenter = () => { swatch.style.transform='scale(1.18)'; swatch.style.borderColor='rgba(255,255,255,0.4)'; };
            swatch.onmouseleave = () => { swatch.style.transform='scale(1)';    swatch.style.borderColor='rgba(255,255,255,0.12)'; };
            swatch.onclick = () => this._insert(`&${c.code}`);
            colRow.appendChild(swatch);
        });

        // Divider
        const div = document.createElement('div');
        div.style.cssText = 'width:1px;height:20px;background:var(--border);margin:0 2px;flex-shrink:0;';
        colRow.appendChild(div);

        // Format buttons "” reuse panel .btn.outline.small classes
        const fmtRow = wrap.querySelector('.motd-fmts');
        this.MC_FORMATS.forEach(f => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.title = f.title;
            btn.className = 'btn outline small';
            btn.style.minWidth = '30px';
            btn.innerHTML = f.label;
            btn.onclick = () => this._insert(`&${f.code}`);
            fmtRow.appendChild(btn);
        });

        // Divider
        const div2 = document.createElement('div');
        div2.style.cssText = 'width:1px;height:20px;background:var(--border);margin:0 2px;flex-shrink:0;';
        fmtRow.appendChild(div2);

        // Clear codes button
        const clrBtn = document.createElement('button');
        clrBtn.type = 'button'; clrBtn.className = 'btn outline small'; clrBtn.textContent = 'Clear codes';
        clrBtn.onclick = () => { ta.value = ta.value.replace(/&[0-9a-fk-or]/gi, ''); this._value = ta.value; this._updatePreview(); };
        fmtRow.appendChild(clrBtn);

        // Special chars grid
        const charsGrid = wrap.querySelector('.motd-chars-grid');
        this.SPECIAL_CHARS.forEach(ch => {
            const el = document.createElement('button');
            el.type = 'button';
            el.textContent = ch;
            el.style.cssText = 'width:26px;height:26px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:var(--radius-sm);font-size:14px;background:none;border:1px solid transparent;color:var(--text-primary);transition:var(--transition);padding:0;';
            el.onmouseenter = () => { el.style.background='var(--bg-elevated)'; el.style.borderColor='var(--border-hover)'; };
            el.onmouseleave = () => { el.style.background='none'; el.style.borderColor='transparent'; };
            el.onclick = () => this._insert(ch);
            charsGrid.appendChild(el);
        });

        wrap.querySelector('.motd-chars-toggle').onclick = () => {
            const panel = wrap.querySelector('.motd-chars-panel');
            const open = panel.style.display !== 'none';
            panel.style.display = open ? 'none' : 'block';
            wrap.querySelector('.motd-chars-toggle').textContent = open ? 'Special chars â–¾' : 'Special chars â–´';
        };

        this._updatePreview();

        // Obfuscated animation
        this._obfInterval = setInterval(() => {
            const OBF = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
            wrap.querySelectorAll('.mc-obf').forEach(el => {
                el.textContent = OBF[Math.floor(Math.random() * OBF.length)];
            });
        }, 80);
    }
};
// â”€â”€ End MOTD Editor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Properties
const props = {
    data: {}, mode: 'visual', activeCat: 'gameplay', editor: null,
    categories: {
        gameplay: ['difficulty', 'gamemode', 'hardcore', 'pvp', 'spawn-protection', 'spawn-npcs', 'spawn-animals', 'spawn-monsters', 'force-gamemode', 'allow-flight', 'player-idle-timeout', 'difficulty', 'spawn-limits.monsters', 'spawn-limits.animals', 'view-distance'],
        performance: ['view-distance', 'simulation-distance', 'max-tick-time', 'network-compression-threshold', 'sync-chunk-writes', 'entity-broadcast-range-percentage', 'chunk-garbage-collector', 'max-auto-save-chunks-per-tick'],
        world: ['level-name', 'level-seed', 'level-type', 'generator-settings', 'generate-structures', 'allow-nether', 'enable-query', 'max-world-size', 'resource-pack', 'require-resource-pack'],
        network: ['server-ip', 'server-port', 'server-portv6', 'max-players', 'online-mode', 'prevent-proxy-connections', 'enable-rcon', 'rcon.port', 'rcon.password'],
        security: ['online-mode', 'prevent-proxy-connections', 'white-list', 'enforce-whitelist', 'hide-online-players']
    },
    syncDataFromDOM() {
        if (this.mode === 'visual') {
            document.querySelectorAll('.prop-item').forEach(i => {
                const k = i.querySelector('.prop-label').textContent;
                if (k === 'motd') {
                    this.data[k] = motdEditor.getValue();
                    return;
                }
                const sel = i.querySelector('select');
                if (sel) { this.data[k] = sel.value; return; }
                const inp = i.querySelector('input');
                if (inp) this.data[k] = inp.type === 'checkbox' ? (inp.checked ? 'true' : 'false') : inp.value;
            });
        }
    },
    async load() {
        try {
            const d = await api.req(`/servers/${sid()}/properties`);
            this.data = d;
            
            // Setup Raw Editor Mode button
            const modeBtn = document.getElementById('btn-props-mode');
            if (modeBtn) {
                modeBtn.onclick = () => this.toggleMode();
                modeBtn.textContent = this.mode === 'visual' ? 'Raw Editor' : 'Visual Editor';
            }

            // Setup Categories navigation
            document.querySelectorAll('#props-categories .sub-nav-item').forEach(btn => {
                btn.onclick = () => {
                    this.syncDataFromDOM(); // Save current tab's inputs to data
                    document.querySelectorAll('#props-categories .sub-nav-item').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.activeCat = btn.dataset.cat;
                    this.render();
                };
            });

            this.render();
        } catch (e) { ui.toast(e.message, 'error'); }
    },
    toggleMode() {
        this.syncDataFromDOM(); // Save any pending visual changes before switching
        this.mode = this.mode === 'visual' ? 'raw' : 'visual';
        const modeBtn = document.getElementById('btn-props-mode');
        if (modeBtn) modeBtn.textContent = this.mode === 'visual' ? 'Raw Editor' : 'Visual Editor';
        
        const catNav = document.getElementById('props-categories');
        const grid = document.getElementById('props-grid');
        const rawContainer = document.getElementById('props-raw-container');
        
        if (this.mode === 'raw') {
            catNav.style.display = 'none';
            grid.style.display = 'none';
            rawContainer.style.display = 'block';
            
            // Format raw text
            let rawText = '';
            for (const [k, v] of Object.entries(this.data)) {
                rawText += `${k}=${v}\n`;
            }
            
            if (!this.editor) {
                this.editor = CodeMirror.fromTextArea(document.getElementById('props-raw-editor'), {
                    lineNumbers: true,
                    theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'dracula',
                    mode: 'properties'
                });
            } else {
                this.editor.setOption('theme', document.documentElement.getAttribute('data-theme') === 'light' ? 'default' : 'dracula');
            }
            this.editor.setValue(rawText);
            setTimeout(() => this.editor.refresh(), 50);
        } else {
            // Read from raw editor back to data if raw editor exists
            if (this.editor) {
                const lines = this.editor.getValue().split('\n');
                const newData = {};
                lines.forEach(l => {
                    const trimmed = l.trim();
                    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                        const parts = trimmed.split('=');
                        newData[parts[0]] = parts.slice(1).join('=');
                    }
                });
                this.data = newData;
            }
            
            catNav.style.display = 'flex';
            grid.style.display = 'grid';
            rawContainer.style.display = 'none';
            this.render();
        }
    },
    // Keys that have a fixed set of valid values "” rendered as <select>
    ENUM_PROPS: {
        'difficulty':            ['peaceful','easy','normal','hard'],
        'gamemode':              ['survival','creative','adventure','spectator'],
        'level-type':           ['minecraft:normal','minecraft:flat','minecraft:large_biomes','minecraft:amplified','minecraft:single_biome_surface'],
        'default-game-mode':    ['survival','creative','adventure','spectator'],
        'permission-level':     ['1','2','3','4'],
        'function-permission-level': ['1','2','3','4'],
        'op-permission-level':  ['1','2','3','4'],
        'network-compression-threshold': ['-1','64','128','256','512'],
        'entity-broadcast-range-percentage': ['10','25','50','75','100','125','150','175','200'],
    },

    render() {
        const g = document.getElementById('props-grid');
        g.innerHTML = '';
        if (!Object.keys(this.data).length) {
            g.innerHTML = '<p class="text-muted">No properties found.</p>';
            return;
        }

        for (const [k, v] of Object.entries(this.data)) {
            // Check if matches current category filter
            let belongs = false;
            if (this.activeCat === 'other') {
                belongs = !Object.values(this.categories).some(arr => arr.includes(k));
            } else {
                belongs = this.categories[this.activeCat]?.includes(k) || false;
            }

            if (!belongs) continue;

            const isBool = v === 'true' || v === 'false';
            const enumOpts = this.ENUM_PROPS[k];
            const pi = document.createElement('div');
            pi.className = 'prop-item';

            if (k === 'motd') {
                pi.classList.add('prop-item-motd');
                pi.style.cssText = 'grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px;';
                pi.innerHTML = `<span class="prop-label">motd</span><div class="motd-editor-wrap"></div>`;
                g.appendChild(pi);
                motdEditor.init(pi.querySelector('.motd-editor-wrap'), v);
                continue;
            }

            let inp = '';
            if (isBool) {
                inp = `<label class="toggle-switch"><input type="checkbox" id="prop-${k}" ${v === 'true' ? 'checked' : ''}><span class="toggle-slider"></span></label>`;
            } else if (enumOpts) {
                // Normalize the stored value for comparison (server.properties stores numbers for gamemode etc.)
                const normalizeVal = (raw) => {
                    const map = { '0':'survival','1':'creative','2':'adventure','3':'spectator','false':'peaceful','peaceful':'peaceful','easy':'easy','normal':'normal','hard':'hard' };
                    return map[String(raw).toLowerCase()] || String(raw).toLowerCase();
                };
                const currentNorm = normalizeVal(v);
                const opts = enumOpts.map(o => {
                    const norm = normalizeVal(o);
                    const selected = (norm === currentNorm || o === v) ? 'selected' : '';
                    const label = o.replace('minecraft:', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    return `<option value="${o}" ${selected}>${label}</option>`;
                }).join('');
                inp = `<select id="prop-${k}" style="width:160px;padding:6px 10px;font-size:13px;height:auto;">${opts}</select>`;
            } else if (!isNaN(v) && v !== '') {
                inp = `<input type="number" id="prop-${k}" value="${v}">`;
            } else {
                inp = `<input type="text" id="prop-${k}" value="${v}">`;
            }
            pi.innerHTML = `<span class="prop-label">${k}</span><div class="prop-input">${inp}</div>`;
            g.appendChild(pi);
        }

        if (g.children.length === 0) {
            g.innerHTML = `<p class="text-muted" style="grid-column: 1 / -1">No properties in this category.</p>`;
        }
    },
    async save() {
        let payload = {};
        if (this.mode === 'raw' && this.editor) {
            const lines = this.editor.getValue().split('\n');
            lines.forEach(l => {
                const trimmed = l.trim();
                if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                    const parts = trimmed.split('=');
                    payload[parts[0]] = parts.slice(1).join('=');
                }
            });
        } else {
            // Read all inputs from DOM, fallback to current data for unrendered categories
            this.syncDataFromDOM();
            payload = { ...this.data };
        }

        try {
            await api.req(`/servers/${sid()}/properties`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            ui.toast('Properties saved. Restart server to apply.', 'success');
            // Reload
            this.data = payload;
            this.render();
        } catch (e) { ui.toast(e.message, 'error'); }
    }
};
document.getElementById('btn-save-props').addEventListener('click', () => props.save());

// â”€â”€ Server Icon â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const serverIcon = {
    pickerInitialized: false,

    async load() {
        const img = document.getElementById('icon-preview-img');
        const svg = document.getElementById('icon-placeholder-svg');
        const removeBtn = document.getElementById('btn-icon-remove');
        try {
            serverIconHelper.invalidateIconCache(sid());
            const url = await serverIconHelper.fetchIconUrl(sid());
            if (url) {
                img.src = url;
                img.style.display = 'block';
                svg.style.display = 'none';
                removeBtn.style.display = 'inline-flex';
            } else {
                img.style.display = 'none';
                svg.style.display = 'block';
                removeBtn.style.display = 'none';
            }
        } catch {
            img.style.display = 'none';
            svg.style.display = 'block';
            removeBtn.style.display = 'none';
        }
    },

    refreshSidebar() {
        document.querySelectorAll('.sidebar-server-item').forEach(btn => {
            const serverId = btn.dataset.serverId;
            if (!serverId) return;
            const oldWrap = btn.querySelector('.sidebar-server-icon-wrap');
            if (oldWrap) oldWrap.remove();
            serverIconHelper.mountSidebarIcon(btn, serverId);
        });
    },

    initPicker() {
        if (this.pickerInitialized) return;
        this.pickerInitialized = true;

        const grid = document.getElementById('icon-item-picker-grid');
        const modal = document.getElementById('modal-icon-item-picker');
        const closeBtn = document.getElementById('modal-icon-item-picker-close');

        if (!grid || !modal) return;

        grid.innerHTML = '';
        (window.serverIconItems?.PRESET_ITEMS || serverIconHelper.PRESET_ITEMS).forEach(itemId => {
            const resolvedId = serverIconHelper.resolveItemId(itemId);
            const slot = document.createElement('button');
            slot.type = 'button';
            slot.className = 'icon-item-picker-slot mc-slot';
            slot.title = serverIconHelper.formatItemLabel(resolvedId);
            slot.dataset.itemId = resolvedId;
            grid.appendChild(slot);
        });

        const openPicker = async () => {
            await window.players.assetsMapper.init(sid());
            const slots = grid.querySelectorAll('.icon-item-picker-slot');
            for (const slot of slots) {
                slot.innerHTML = '';
                slot.classList.remove('has-item', 'selected');
                await window.players.itemRenderer.renderItem(
                    { id: `minecraft:${slot.dataset.itemId}`, count: 1 },
                    slot,
                    { skipTooltip: true }
                );
                slot.classList.add('has-item');
                slot.onclick = (e) => {
                    e.preventDefault();
                    this.setItemIcon(slot.dataset.itemId);
                };
            }
            modal.classList.add('active');
        };

        document.getElementById('btn-icon-item-picker')?.addEventListener('click', openPicker);
        closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
        modal.addEventListener('click', e => {
            if (e.target === modal) modal.classList.remove('active');
        });
    },

    openPicker() {
        this.initPicker();
        document.getElementById('btn-icon-item-picker')?.click();
    },

    // Crop image to square (center crop) and resize to 64x64, return PNG Blob
    processImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = e => {
                const image = new Image();
                image.onerror = reject;
                image.onload = () => {
                    const size = Math.min(image.width, image.height);
                    const sx = Math.floor((image.width - size) / 2);
                    const sy = Math.floor((image.height - size) / 2);
                    const canvas = document.createElement('canvas');
                    canvas.width = 64;
                    canvas.height = 64;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(image, sx, sy, size, size, 0, 0, 64, 64);
                    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas conversion failed')), 'image/png');
                };
                image.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    },

    async uploadBlob(pngBlob) {
        const fd = new FormData();
        fd.append('icon', pngBlob, 'server-icon.png');
        await api.req(`/servers/${sid()}/properties/icon`, { method: 'POST', body: fd });
    },

    async upload(file) {
        try {
            ui.toast('Processing image…', 'info');
            const pngBlob = await this.processImage(file);
            await this.uploadBlob(pngBlob);
            serverIconHelper.invalidateIconCache(sid());
            ui.toast('Server icon updated!', 'success');
            await this.load();
            this.refreshSidebar();
        } catch (e) {
            ui.toast(e.message || 'Icon upload failed', 'error');
        }
    },

    async setItemIcon(itemId) {
        try {
            ui.toast('Rendering item icon…', 'info');
            document.getElementById('modal-icon-item-picker')?.classList.remove('active');
            const pngBlob = await serverIconHelper.renderItemToPngBlob(itemId, sid());
            await this.uploadBlob(pngBlob);
            serverIconHelper.invalidateIconCache(sid());
            ui.toast('Server icon updated!', 'success');
            await this.load();
            this.refreshSidebar();
        } catch (e) {
            ui.toast(e.message || 'Item icon failed', 'error');
        }
    },

    async remove() {
        if (!(await ui.confirm('Remove server icon?'))) return;
        try {
            await api.req(`/servers/${sid()}/properties/icon`, { method: 'DELETE' });
            serverIconHelper.invalidateIconCache(sid());
            ui.toast('Server icon removed', 'success');
            await this.load();
            this.refreshSidebar();
        } catch (e) {
            ui.toast(e.message || 'Remove failed', 'error');
        }
    }
};

document.getElementById('btn-icon-upload-trigger').addEventListener('click', () => {
    document.getElementById('icon-upload-input').value = '';
    document.getElementById('icon-upload-input').click();
});
document.getElementById('icon-upload-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) serverIcon.upload(file);
});
document.getElementById('btn-icon-remove').addEventListener('click', () => serverIcon.remove());
// â”€â”€ End Server Icon â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


// Players
const players = {
    activeTab: 'players',
    listenersBound: false,

    bindListeners() {
        if (this.listenersBound) return;
        const subNav = document.getElementById('players-sub-nav');
        if (subNav) {
            subNav.querySelectorAll('.sub-nav-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    subNav.querySelectorAll('.sub-nav-item').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.activeTab = btn.dataset.list || 'players';
                    this.load();
                });
            });
            this.listenersBound = true;
        }
    },

    async load() {
        this.bindListeners();
        const subNav = document.getElementById('players-sub-nav');
        if (subNav) {
            subNav.querySelectorAll('.sub-nav-item').forEach(b => {
                if (b.dataset.list === this.activeTab) {
                    b.classList.add('active');
                } else {
                    b.classList.remove('active');
                }
            });
        }

        const contentEl = document.getElementById('players-content');
        if (!contentEl) return;

        if (this.activeTab === 'players') {
            contentEl.innerHTML = `
                <div class="card">
                    <div class="list-header">
                        <div class="col col-wide">Player</div>
                        <div class="col">Health</div>
                        <div class="col">Food</div>
                        <div class="col">XP Level</div>
                        <div class="col">Gamemode</div>
                        <div class="col actions">Actions</div>
                    </div>
                    <div class="list-body" id="players-list-body">
                        <p class="text-muted" style="padding:1rem">Loading players...</p>
                    </div>
                </div>
            `;
            const listBody = document.getElementById('players-list-body');
            try {
                window.players.assetsMapper.init(sid());
                const data = await api.req(`/servers/${sid()}/players/list`);
                listBody.innerHTML = '';
                if (!data.length) {
                    listBody.innerHTML = '<div class="list-item"><p class="text-muted">No player data found.</p></div>';
                    return;
                }
                for (const p of data) {
                    try {
                        const s = await api.req(`/servers/${sid()}/players/${p.uuid}`);
                        const gm = ['Survival', 'Creative', 'Adventure', 'Spectator'][s.gameMode] || 'Unknown';
                        const el = document.createElement('div');
                        el.className = 'list-item';
                        el.innerHTML = `
                            <div class="col col-wide text-mono" data-label="Player">${s.username || p.uuid}</div>
                            <div class="col" data-label="Health">${Math.ceil(s.health)}/20</div>
                            <div class="col" data-label="Food">${s.foodLevel}/20</div>
                            <div class="col" data-label="XP Level">${s.xpLevel}</div>
                            <div class="col" data-label="Gamemode">${gm}</div>
                            <div class="col actions" data-label="Actions"><button class="btn outline small" data-uuid="${p.uuid}">Details</button></div>
                        `;
                        el.querySelector('[data-uuid]').onclick = e => {
                            e.stopPropagation();
                            players.detail(p.uuid, s);
                        };
                        listBody.appendChild(el);
                    } catch (x) {
                        const el = document.createElement('div');
                        el.className = 'list-item';
                        el.innerHTML = `
                            <div class="col col-wide text-mono" data-label="Player">${p.username || p.uuid}</div>
                            <div class="col" data-label="Health">--</div>
                            <div class="col" data-label="Food">--</div>
                            <div class="col" data-label="XP Level">--</div>
                            <div class="col" data-label="Gamemode">--</div>
                            <div class="col actions" data-label="Actions"><button class="btn outline small" data-uuid="${p.uuid}" disabled>Details</button></div>
                        `;
                        listBody.appendChild(el);
                    }
                }
            } catch (e) {
                listBody.innerHTML = `<div class="list-item"><p class="text-muted">Failed to load players: ${e.message}</p></div>`;
                ui.toast(e.message, 'error');
            }
        } else if (this.activeTab === 'whitelist') {
            contentEl.innerHTML = `
                <div class="card" style="margin-bottom:1rem">
                    <h3 style="margin-top:0;margin-bottom:1rem">Add to Whitelist</h3>
                    <div style="display:flex;gap:1rem;align-items:flex-end">
                        <div class="form-group" style="flex:1;margin:0">
                            <label>Player Username / UUID</label>
                            <input type="text" id="add-whitelist-target" placeholder="e.g. Notch" style="width:100%;padding:0.5rem;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius);color:var(--text)">
                        </div>
                        <button class="btn primary" id="btn-add-whitelist" style="height:38px">Add Player</button>
                    </div>
                </div>
                <div class="card">
                    <div class="list-header">
                        <div class="col col-wide">Player Name</div>
                        <div class="col">UUID</div>
                        <div class="col actions">Actions</div>
                    </div>
                    <div class="list-body" id="whitelist-list-body">
                        <p class="text-muted" style="padding:1rem">Loading Whitelist...</p>
                    </div>
                </div>
            `;
            const listBody = document.getElementById('whitelist-list-body');
            const targetInput = document.getElementById('add-whitelist-target');
            const addBtn = document.getElementById('btn-add-whitelist');

            const loadList = async () => {
                listBody.innerHTML = '<p class="text-muted" style="padding:1rem">Loading Whitelist...</p>';
                try {
                    const data = await api.req(`/servers/${sid()}/players/lists/whitelist`);
                    listBody.innerHTML = '';
                    if (!data || !data.length) {
                        listBody.innerHTML = '<div class="list-item"><p class="text-muted">Whitelist is empty.</p></div>';
                        return;
                    }
                    data.forEach(item => {
                        const el = document.createElement('div');
                        el.className = 'list-item';
                        el.innerHTML = `
                            <div class="col col-wide text-mono" data-label="Player">${item.name || 'Unknown'}</div>
                            <div class="col text-muted text-mono" style="font-size:0.8rem" data-label="UUID">${item.uuid || '--'}</div>
                            <div class="col actions" data-label="Actions"><button class="btn danger small" data-target="${item.name || item.uuid}">Remove</button></div>
                        `;
                        el.querySelector('[data-target]').onclick = async () => {
                            const name = item.name || item.uuid;
                            if (!(await ui.confirm(`Remove ${name} from whitelist?`))) return;
                            try {
                                await api.req(`/servers/${sid()}/players/lists/whitelist/${name}`, { method: 'DELETE' });
                                ui.toast('Player removed from whitelist', 'success');
                                loadList();
                            } catch (e) { ui.toast(e.message, 'error'); }
                        };
                        listBody.appendChild(el);
                    });
                } catch (e) {
                    listBody.innerHTML = `<div class="list-item"><p class="text-muted">Error: ${e.message}</p></div>`;
                }
            };

            addBtn.onclick = async () => {
                const target = targetInput.value.trim();
                if (!target) return ui.toast('Please enter a username or UUID', 'error');
                try {
                    ui.toast('Adding to whitelist...', 'info');
                    await api.req(`/servers/${sid()}/players/lists/whitelist`, {
                        method: 'POST',
                        body: JSON.stringify({ target })
                    });
                    ui.toast('Player added to whitelist', 'success');
                    targetInput.value = '';
                    loadList();
                } catch (e) { ui.toast(e.message, 'error'); }
            };

            loadList();
        } else if (this.activeTab === 'ops') {
            contentEl.innerHTML = `
                <div class="card" style="margin-bottom:1rem">
                    <h3 style="margin-top:0;margin-bottom:1rem">Make Player Operator</h3>
                    <div style="display:flex;gap:1rem;align-items:flex-end">
                        <div class="form-group" style="flex:1;margin:0">
                            <label>Player Username</label>
                            <input type="text" id="add-ops-target" placeholder="e.g. Notch" style="width:100%;padding:0.5rem;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius);color:var(--text)">
                        </div>
                        <div class="form-group" style="width:140px;margin:0">
                            <label>Permission Level</label>
                            <select id="add-ops-level" style="width:100%;height:38px;padding:0 0.5rem;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius);color:var(--text)">
                                <option value="4">4 (Full Admin)</option>
                                <option value="3">3 (Moderator)</option>
                                <option value="2">2 (Game Master)</option>
                                <option value="1">1 (No bypass)</option>
                            </select>
                        </div>
                        <button class="btn primary" id="btn-add-ops" style="height:38px">OP Player</button>
                    </div>
                </div>
                <div class="card">
                    <div class="list-header">
                        <div class="col col-wide">Player Name</div>
                        <div class="col">OP Level</div>
                        <div class="col">Bypasses Limit</div>
                        <div class="col actions">Actions</div>
                    </div>
                    <div class="list-body" id="ops-list-body">
                        <p class="text-muted" style="padding:1rem">Loading Operator List...</p>
                    </div>
                </div>
            `;
            const listBody = document.getElementById('ops-list-body');
            const targetInput = document.getElementById('add-ops-target');
            const levelSelect = document.getElementById('add-ops-level');
            const addBtn = document.getElementById('btn-add-ops');

            const loadList = async () => {
                listBody.innerHTML = '<p class="text-muted" style="padding:1rem">Loading Operator List...</p>';
                try {
                    const data = await api.req(`/servers/${sid()}/players/lists/ops`);
                    listBody.innerHTML = '';
                    if (!data || !data.length) {
                        listBody.innerHTML = '<div class="list-item"><p class="text-muted">No operators defined.</p></div>';
                        return;
                    }
                    data.forEach(item => {
                        const el = document.createElement('div');
                        el.className = 'list-item';
                        el.innerHTML = `
                            <div class="col col-wide text-mono" data-label="Player">${item.name || 'Unknown'}</div>
                            <div class="col" data-label="OP Level">Level ${item.level !== undefined ? item.level : 4}</div>
                            <div class="col" data-label="Bypasses Limit">${item.bypassesPlayerLimit ? 'Yes' : 'No'}</div>
                            <div class="col actions" data-label="Actions"><button class="btn danger small" data-target="${item.name || item.uuid}">Deop</button></div>
                        `;
                        el.querySelector('[data-target]').onclick = async () => {
                            const name = item.name || item.uuid;
                            if (!(await ui.confirm(`Deop ${name}?`))) return;
                            try {
                                await api.req(`/servers/${sid()}/players/lists/ops/${name}`, { method: 'DELETE' });
                                ui.toast('Player deopped', 'success');
                                loadList();
                            } catch (e) { ui.toast(e.message, 'error'); }
                        };
                        listBody.appendChild(el);
                    });
                } catch (e) {
                    listBody.innerHTML = `<div class="list-item"><p class="text-muted">Error: ${e.message}</p></div>`;
                }
            };

            addBtn.onclick = async () => {
                const target = targetInput.value.trim();
                const level = parseInt(levelSelect.value) || 4;
                if (!target) return ui.toast('Please enter a username', 'error');
                try {
                    ui.toast('Adding Operator...', 'info');
                    await api.req(`/servers/${sid()}/players/lists/ops`, {
                        method: 'POST',
                        body: JSON.stringify({ target, level })
                    });
                    ui.toast('Player opped', 'success');
                    targetInput.value = '';
                    loadList();
                } catch (e) { ui.toast(e.message, 'error'); }
            };

            loadList();
        } else if (this.activeTab === 'banned-players') {
            contentEl.innerHTML = `
                <div class="card" style="margin-bottom:1rem">
                    <h3 style="margin-top:0;margin-bottom:1rem">Ban Player</h3>
                    <div style="display:flex;gap:1rem;align-items:flex-end">
                        <div class="form-group" style="flex:1;margin:0">
                            <label>Player Username</label>
                            <input type="text" id="add-banned-players-target" placeholder="e.g. GriefingSteve" style="width:100%;padding:0.5rem;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius);color:var(--text)">
                        </div>
                        <div class="form-group" style="flex:2;margin:0">
                            <label>Reason</label>
                            <input type="text" id="add-banned-players-reason" placeholder="Griefing / Hacking" style="width:100%;padding:0.5rem;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius);color:var(--text)">
                        </div>
                        <button class="btn danger" id="btn-add-banned-players" style="height:38px">Ban Player</button>
                    </div>
                </div>
                <div class="card">
                    <div class="list-header">
                        <div class="col col-wide">Player Name</div>
                        <div class="col">Banned By</div>
                        <div class="col col-wide">Reason</div>
                        <div class="col">Expires</div>
                        <div class="col actions">Actions</div>
                    </div>
                    <div class="list-body" id="banned-players-list-body">
                        <p class="text-muted" style="padding:1rem">Loading Banned Players...</p>
                    </div>
                </div>
            `;
            const listBody = document.getElementById('banned-players-list-body');
            const targetInput = document.getElementById('add-banned-players-target');
            const reasonInput = document.getElementById('add-banned-players-reason');
            const addBtn = document.getElementById('btn-add-banned-players');

            const loadList = async () => {
                listBody.innerHTML = '<p class="text-muted" style="padding:1rem">Loading Banned Players...</p>';
                try {
                    const data = await api.req(`/servers/${sid()}/players/lists/banned-players`);
                    listBody.innerHTML = '';
                    if (!data || !data.length) {
                        listBody.innerHTML = '<div class="list-item"><p class="text-muted">No banned players.</p></div>';
                        return;
                    }
                    data.forEach(item => {
                        const el = document.createElement('div');
                        el.className = 'list-item';
                        el.innerHTML = `
                            <div class="col col-wide text-mono" data-label="Player">${item.name || 'Unknown'}</div>
                            <div class="col" data-label="Banned By">${item.source || 'Admin'}</div>
                            <div class="col col-wide text-muted" data-label="Reason">${item.reason || 'Banned by panel'}</div>
                            <div class="col" style="font-size:0.8rem" data-label="Expires">${item.expires || 'forever'}</div>
                            <div class="col actions" data-label="Actions"><button class="btn success small" data-target="${item.name || item.uuid}">Pardon</button></div>
                        `;
                        el.querySelector('[data-target]').onclick = async () => {
                            const name = item.name || item.uuid;
                            if (!(await ui.confirm(`Pardon ${name}?`))) return;
                            try {
                                await api.req(`/servers/${sid()}/players/lists/banned-players/${name}`, { method: 'DELETE' });
                                ui.toast('Player pardoned', 'success');
                                loadList();
                            } catch (e) { ui.toast(e.message, 'error'); }
                        };
                        listBody.appendChild(el);
                    });
                } catch (e) {
                    listBody.innerHTML = `<div class="list-item"><p class="text-muted">Error: ${e.message}</p></div>`;
                }
            };

            addBtn.onclick = async () => {
                const target = targetInput.value.trim();
                const reason = reasonInput.value.trim();
                if (!target) return ui.toast('Please enter a username', 'error');
                try {
                    ui.toast('Banning player...', 'info');
                    await api.req(`/servers/${sid()}/players/lists/banned-players`, {
                        method: 'POST',
                        body: JSON.stringify({ target, reason })
                    });
                    ui.toast('Player banned', 'success');
                    targetInput.value = '';
                    reasonInput.value = '';
                    loadList();
                } catch (e) { ui.toast(e.message, 'error'); }
            };

            loadList();
        } else if (this.activeTab === 'banned-ips') {
            contentEl.innerHTML = `
                <div class="card" style="margin-bottom:1rem">
                    <h3 style="margin-top:0;margin-bottom:1rem">Ban IP Address</h3>
                    <div style="display:flex;gap:1rem;align-items:flex-end">
                        <div class="form-group" style="flex:1;margin:0">
                            <label>IP Address</label>
                            <input type="text" id="add-banned-ips-target" placeholder="e.g. 192.168.1.100" style="width:100%;padding:0.5rem;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius);color:var(--text)">
                        </div>
                        <div class="form-group" style="flex:2;margin:0">
                            <label>Reason</label>
                            <input type="text" id="add-banned-ips-reason" placeholder="Spamming chat" style="width:100%;padding:0.5rem;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius);color:var(--text)">
                        </div>
                        <button class="btn danger" id="btn-add-banned-ips" style="height:38px">Ban IP</button>
                    </div>
                </div>
                <div class="card">
                    <div class="list-header">
                        <div class="col col-wide">IP Address</div>
                        <div class="col">Banned By</div>
                        <div class="col col-wide">Reason</div>
                        <div class="col">Expires</div>
                        <div class="col actions">Actions</div>
                    </div>
                    <div class="list-body" id="banned-ips-list-body">
                        <p class="text-muted" style="padding:1rem">Loading Banned IPs...</p>
                    </div>
                </div>
            `;
            const listBody = document.getElementById('banned-ips-list-body');
            const targetInput = document.getElementById('add-banned-ips-target');
            const reasonInput = document.getElementById('add-banned-ips-reason');
            const addBtn = document.getElementById('btn-add-banned-ips');

            const loadList = async () => {
                listBody.innerHTML = '<p class="text-muted" style="padding:1rem">Loading Banned IPs...</p>';
                try {
                    const data = await api.req(`/servers/${sid()}/players/lists/banned-ips`);
                    listBody.innerHTML = '';
                    if (!data || !data.length) {
                        listBody.innerHTML = '<div class="list-item"><p class="text-muted">No banned IPs.</p></div>';
                        return;
                    }
                    data.forEach(item => {
                        const el = document.createElement('div');
                        el.className = 'list-item';
                        el.innerHTML = `
                            <div class="col col-wide text-mono" data-label="IP Address">${item.ip}</div>
                            <div class="col" data-label="Banned By">${item.source || 'Admin'}</div>
                            <div class="col col-wide text-muted" data-label="Reason">${item.reason || 'Banned by panel'}</div>
                            <div class="col" style="font-size:0.8rem" data-label="Expires">${item.expires || 'forever'}</div>
                            <div class="col actions" data-label="Actions"><button class="btn success small" data-target="${item.ip}">Pardon IP</button></div>
                        `;
                        el.querySelector('[data-target]').onclick = async () => {
                            const ip = item.ip;
                            if (!(await ui.confirm(`Pardon IP ${ip}?`))) return;
                            try {
                                await api.req(`/servers/${sid()}/players/lists/banned-ips/${ip}`, { method: 'DELETE' });
                                ui.toast('IP pardoned', 'success');
                                loadList();
                            } catch (e) { ui.toast(e.message, 'error'); }
                        };
                        listBody.appendChild(el);
                    });
                } catch (e) {
                    listBody.innerHTML = `<div class="list-item"><p class="text-muted">Error: ${e.message}</p></div>`;
                }
            };

            addBtn.onclick = async () => {
                const target = targetInput.value.trim();
                const reason = reasonInput.value.trim();
                if (!target) return ui.toast('Please enter an IP address', 'error');
                try {
                    ui.toast('Banning IP...', 'info');
                    await api.req(`/servers/${sid()}/players/lists/banned-ips`, {
                        method: 'POST',
                        body: JSON.stringify({ target, reason })
                    });
                    ui.toast('IP banned', 'success');
                    targetInput.value = '';
                    reasonInput.value = '';
                    loadList();
                } catch (e) { ui.toast(e.message, 'error'); }
            };

            loadList();
        }
    },
    
    async refresh(uuid) {
        try {
            window.players.assetsMapper.init(sid());
            const s = await api.req(`/servers/${sid()}/players/${uuid}`);
            this.detail(uuid, s);
        } catch (e) { ui.toast(e.message, 'error'); }
    },

    detail(uuid, s) {
        const nameEl = document.getElementById('pd-name');
        nameEl.textContent = s.username || uuid;
        nameEl.dataset.uuid = uuid;
        const gm = ['Survival', 'Creative', 'Adventure', 'Spectator'][s.gameMode] || 'Unknown';
        
        // Detailed coordinates stat block
        const x = s.position ? Math.round(s.position.x) : 0;
        const y = s.position ? Math.round(s.position.y) : 0;
        const z = s.position ? Math.round(s.position.z) : 0;
        
        document.getElementById('pd-stats').innerHTML = `
            <div class="stat-box"><label>Health</label><div class="stat-val">${Math.ceil(s.health)}/20</div></div>
            <div class="stat-box"><label>Food</label><div class="stat-val">${s.foodLevel}/20</div></div>
            <div class="stat-box"><label>XP Level</label><div class="stat-val">${s.xpLevel}</div></div>
            <div class="stat-box"><label>Gamemode</label><div class="stat-val">${gm}</div></div>
            <div class="stat-box"><label>Coordinates</label><div class="stat-val" style="font-size:0.7rem">${x}, ${y}, ${z}</div></div>
        `;

        // Render Active Status Effects
        const fxTitle = document.getElementById('pd-effects-title');
        const fxContainer = document.getElementById('pd-effects');
        fxTitle.style.display = 'none';
        fxContainer.style.display = 'none';
        fxContainer.innerHTML = '';

        if (s.activeEffects && Array.isArray(s.activeEffects) && s.activeEffects.length > 0) {
            fxTitle.style.display = 'block';
            fxContainer.style.display = 'flex';
            
            const romanMap = { 0: 'I', 1: 'II', 2: 'III', 3: 'IV', 4: 'V', 5: 'VI', 6: 'VII', 7: 'VIII', 8: 'IX', 9: 'X' };
            const getRoman = num => romanMap[num] || (num + 1).toString();
            
            const effectColors = {
                'minecraft:speed': '#7cafc2', 'minecraft:slowness': '#5a6c81', 'minecraft:haste': '#e9b115',
                'minecraft:mining_fatigue': '#4a4233', 'minecraft:strength': '#932423', 'minecraft:instant_health': '#f82423',
                'minecraft:instant_damage': '#430a09', 'minecraft:jump_boost': '#22ff4c', 'minecraft:nausea': '#551a8b',
                'minecraft:regeneration': '#cd5c5c', 'minecraft:resistance': '#9932cc', 'minecraft:fire_resistance': '#e49a3a',
                'minecraft:water_breathing': '#2e8b57', 'minecraft:invisibility': '#7f8c8d', 'minecraft:blindness': '#191919',
                'minecraft:night_vision': '#3b0066', 'minecraft:hunger': '#5c4033', 'minecraft:weakness': '#484d50',
                'minecraft:poison': '#4c9e3c', 'minecraft:wither': '#2c2d2d', 'minecraft:health_boost': '#df7d23',
                'minecraft:absorption': '#ffd700', 'minecraft:saturation': '#ff6347', 'minecraft:glowing': '#ffff55',
                'minecraft:levitation': '#c5eeff', 'minecraft:slow_falling': '#f5f5f5', 'minecraft:conduit_power': '#1dc2d6',
                'minecraft:dolphins_grace': '#55ffff', 'minecraft:bad_omen': '#800020', 'minecraft:hero_of_the_village': '#40e0d0',
                'minecraft:darkness': '#000000'
            };
            
            s.activeEffects.forEach(eff => {
                const color = effectColors[eff.id] || '#999';
                const name = eff.id.replace('minecraft:', '').replace(/_/g, ' ');
                const level = getRoman(eff.amplifier);
                const isInfinite = eff.duration > 32767 || eff.duration < 0;
                const durMin = Math.floor(eff.duration / 20 / 60);
                const durSec = Math.floor((eff.duration / 20) % 60);
                const durStr = isInfinite ? 'Infinite' : `${durMin}:${durSec.toString().padStart(2, '0')}`;
                
                const badge = document.createElement('div');
                badge.className = 'effect-badge';
                badge.style.display = 'inline-flex';
                badge.style.alignItems = 'center';
                badge.style.background = 'rgba(255,255,255,0.03)';
                badge.style.border = `1px solid ${color}44`;
                badge.style.borderRadius = '20px';
                badge.style.padding = '0.35rem 0.75rem';
                badge.style.fontSize = '0.75rem';
                badge.style.gap = '0.4rem';
                badge.style.color = '#fff';
                
                const potionSvg = `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="color:${color}">
                    <path d="M9 2h6M12 2v6" stroke-linecap="round"/>
                    <path d="M10 5.5h4"/>
                    <path d="M6 19.5c0 1.93 2.68 2.5 6 2.5s6-.57 6-2.5c0-1.5-.78-2.6-2.1-4l-2.4-2.6c-.34-.37-.5-.73-.5-1.4V8H9v3.5c0 .67-.16 1.03-.5 1.4l-2.4 2.6c-1.32 1.4-2.1 2.5-2.1 4z" fill="${color}44"/>
                    <path d="M7.7 18.5c.5-1.5 2.1-2.5 4.3-2.5s3.8 1 4.3 2.5" stroke="currentColor" stroke-linecap="round"/>
                </svg>`;
                
                badge.innerHTML = `
                    ${potionSvg}
                    <span style="font-weight:600;text-transform:capitalize">${name} ${level}</span>
                    <span style="color:var(--text-muted);font-size:0.68rem;margin-left:0.25rem">${durStr}</span>
                `;
                fxContainer.appendChild(badge);
            });
        }

        // Setup Tab Switcher listeners
        const tabInvBtn = document.getElementById('mc-tab-inv-btn');
        const tabEcBtn = document.getElementById('mc-tab-ec-btn');
        const tabInvContent = document.getElementById('mc-tab-inv-content');
        const tabEcContent = document.getElementById('mc-tab-ec-content');

        tabInvBtn.onclick = () => {
            tabInvBtn.classList.add('active');
            tabEcBtn.classList.remove('active');
            tabInvContent.style.display = 'block';
            tabEcContent.style.display = 'none';
        };

        tabEcBtn.onclick = () => {
            tabEcBtn.classList.add('active');
            tabInvBtn.classList.remove('active');
            tabEcContent.style.display = 'block';
            tabInvContent.style.display = 'none';
        };

        // Reset to default inventory tab on load
        tabInvBtn.click();

        // Render modular inventory components
        window.players.inventoryGrid.renderGrid(s.inventory, document.getElementById('pd-inventory-container'));
        window.players.hotbar.renderHotbar(s.hotbar, document.getElementById('pd-hotbar-container'));
        window.players.armorSlots.renderArmor(s.armor, document.getElementById('pd-armor-container'));
        window.players.offhandSlot.renderOffhand(s.offhand, document.getElementById('pd-offhand-container'));
        window.players.enderChest.renderEnderChest(s.enderChest, document.getElementById('pd-enderchest-container'));

        // Grouped Actions layout
        document.getElementById('pd-actions').innerHTML = `
            <div class="player-action-section">
                <h5>Server Moderation</h5>
                <div class="player-action-buttons">
                    <button class="btn danger small" onclick="players.cmd('${uuid}','kick')">Kick Player</button>
                    <button class="btn danger small" onclick="players.cmd('${uuid}','ban')">Ban Player</button>
                    <button class="btn outline small" onclick="players.cmd('${uuid}','op')">OP (Admin)</button>
                    <button class="btn outline small" onclick="players.cmd('${uuid}','deop')">DeOP</button>
                    <button class="btn danger small" onclick="players.cmd('${uuid}','wipe')">Wipe Files</button>
                </div>
            </div>
            <div class="player-action-section">
                <h5>Status &amp; Modes</h5>
                <div class="player-action-buttons">
                    <button class="btn outline small" onclick="players.cmd('${uuid}','gamemode','survival')">Survival</button>
                    <button class="btn outline small" onclick="players.cmd('${uuid}','gamemode','creative')">Creative</button>
                    <button class="btn outline small" onclick="players.cmd('${uuid}','heal')">Heal Health</button>
                    <button class="btn danger small" onclick="players.cmd('${uuid}','kill')">Kill Player</button>
                </div>
            </div>
            <div class="player-action-section">
                <h5>Gifts &amp; World Modifiers</h5>
                <div class="player-action-buttons">
                    <button class="btn outline small" onclick="players.cmd('${uuid}','xp')">Give XP</button>
                    <button class="btn outline small" onclick="players.cmd('${uuid}','give')">Give Item</button>
                    <button class="btn outline small" onclick="players.openEffectModal('${uuid}', '${s.username || uuid}')">Give Effect</button>
                    <button class="btn outline small" onclick="players.cmd('${uuid}','teleport')">Teleport Coords</button>
                    <button class="btn danger small" onclick="players.cmd('${uuid}','clear')">Clear Inventory</button>
                </div>
            </div>
        `;
        ui.showModal('modal-player-detail');
    },

    openEffectModal(uuid, username) {
        document.getElementById('ge-username').textContent = username;
        
        // Reset modal fields to standard values
        document.getElementById('ge-effect').value = 'minecraft:speed';
        document.getElementById('ge-duration').value = '30';
        document.getElementById('ge-amplifier').value = '1';
        document.getElementById('ge-particles').checked = true;

        const applyBtn = document.getElementById('btn-effect-apply');
        applyBtn.onclick = async () => {
            const effect = document.getElementById('ge-effect').value;
            const duration = document.getElementById('ge-duration').value || '30';
            const amplifier = document.getElementById('ge-amplifier').value || '1';
            const showParticles = document.getElementById('ge-particles').checked;
            
            // Format command params: <effect> [seconds] [amplifier] [hideParticles]
            // Minecraft hideParticles parameter: true hides particles, false shows them!
            const hideParticles = !showParticles; 
            
            const value = `${effect} ${duration} ${amplifier} ${hideParticles}`;
            await players.cmd(uuid, 'effect', value);
        };

        ui.showModal('modal-give-effect');
    },

    async cmd(uuid, action, value) {
        if ((action === 'kick' || action === 'ban' || action === 'kill') && !(await ui.confirm(`${action.toUpperCase()} this player?`, 'Confirm Action'))) return;
        if (action === 'clear' && !(await ui.confirm(`Clear inventory of this player?`, 'Confirm Action'))) return;
        if (action === 'wipe') {
            if (!(await ui.confirm(`WARNING: Wiping files deletes all stats, NBT player data, and advancements. The server must be stopped first. Proceed?`, 'Wipe Player Data'))) return;
            if (!(await ui.confirm(`Confirm absolute wipe?`, 'Wipe Player Data'))) return;
        }

        let finalVal = value;
        if (action === 'xp' && !finalVal) {
            finalVal = await ui.prompt('Enter XP points to add:', '100', 'Add XP');
            if (!finalVal) return;
        }
        if (action === 'give' && !finalVal) {
            finalVal = await ui.prompt('Enter item ID to give (e.g. minecraft:diamond):', 'minecraft:diamond', 'Give Item');
            if (!finalVal) return;
        }
        if (action === 'teleport' && !finalVal) {
            finalVal = await ui.prompt('Enter coords or username to teleport to (e.g. 0 100 0):', '', 'Teleport');
            if (!finalVal) return;
        }

        try {
            const r = await api.req(`/servers/${sid()}/players/${uuid}/command`, {
                method: 'POST',
                body: JSON.stringify({ action, value: finalVal })
            });
            ui.toast(r.message, 'success');
            ui.closeModals();
            players.load();
        } catch (e) { ui.toast(e.message, 'error'); }
    }
};
document.getElementById('modal-player-detail-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('btn-pd-refresh')?.addEventListener('click', () => {
    const uuid = document.getElementById('pd-name')?.dataset?.uuid;
    if (uuid) {
        ui.toast('Refreshing player data...', 'info');
        players.refresh(uuid);
    }
});
document.getElementById('modal-give-effect-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-give-effect-cancel')?.addEventListener('click', () => ui.closeModals());

// Plugins
const plugins = {
    pageSize: 24,
    currentQuery: '',
    currentCategory: 'popular',
    currentOffset: 0,
    currentTotal: 0,
    installedItems: [],
    escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },
    renderMarkdown(markdown) {
        const raw = String(markdown || '').trim();
        if (!raw) return '<p class="text-muted">No long description was provided on Modrinth.</p>';

        if (window.marked) {
            window.marked.setOptions({
                gfm: true,
                breaks: true,
                mangle: false,
                headerIds: false
            });
            const html = window.marked.parse(raw);
            const clean = window.DOMPurify
                ? window.DOMPurify.sanitize(html, {
                    ADD_ATTR: ['target', 'rel'],
                    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
                })
                : html;
            return clean.replace(/<a /g, '<a target="_blank" rel="noopener" ');
        }

        const safe = this.escapeHtml(raw);
        return safe
            .split(/\n{2,}/)
            .map(block => {
                const text = block.trim();
                if (!text) return '';
                if (text.startsWith('### ')) return `<h4>${text.slice(4)}</h4>`;
                if (text.startsWith('## ')) return `<h3>${text.slice(3)}</h3>`;
                if (text.startsWith('# ')) return `<h3>${text.slice(2)}</h3>`;
                const linked = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
                return `<p>${linked.replace(/\n/g, '<br>')}</p>`;
            })
            .join('');
    },
    async init() {
        this.setupDiscoveryTabs();
        await this.loadInstalled();
        this.loadDiscoveryCategory('popular');
    },
    getInstalledForProject(projectId) {
        return this.installedItems.find(item => item.modrinth?.projectId === projectId);
    },
    getInstalledVersion(versionId) {
        return this.installedItems.find(item => item.modrinth?.versionId === versionId);
    },
    setupDiscoveryTabs() {
        const container = document.getElementById('plugins-discovery-tabs');
        if (!container) return;
        const buttons = container.querySelectorAll('.sub-nav-item');
        buttons.forEach(btn => {
            btn.onclick = () => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('plugin-search').value = '';
                const category = btn.dataset.discovery;
                this.loadDiscoveryCategory(category, 0);
            };
        });
    },
    async loadDiscoveryCategory(category, page = 0) {
        this.currentQuery = '';
        this.currentCategory = category || 'popular';
        this.currentOffset = Math.max(page, 0) * this.pageSize;
        this.showBrowser();
        const g = document.getElementById('plugins-grid');
        g.innerHTML = '<p class="text-muted">Loading Discovery list...</p>';
        try {
            let catParam = '';
            if (category === 'optimization') catParam = 'optimization';
            else if (category === 'utility') catParam = 'utility';
            else if (category === 'adventure') catParam = 'adventure';
            
            const data = await api.req(`/servers/${sid()}/plugins/search?category=${encodeURIComponent(catParam)}&limit=${this.pageSize}&offset=${this.currentOffset}`);
            this.renderHits(data);
        } catch (e) { ui.toast(e.message, 'error'); }
    },
    async loadInstalled() {
        try {
            const data = await api.req(`/servers/${sid()}/plugins/installed`);
            this.installedItems = data || [];
            const el = document.getElementById('installed-plugins-list'); el.innerHTML = '';
            if (!data.length) { el.innerHTML = '<p class="text-muted">No plugins installed.</p>'; return; }
            data.forEach(p => {
                const d = document.createElement('div'); d.className = 'installed-plugin-item';
                const meta = p.modrinth
                    ? `<span class="ips">Installed: ${this.escapeHtml(p.modrinth.versionNumber || p.modrinth.versionName || p.modrinth.versionId)}</span>`
                    : '<span class="ips">Manual jar</span>';
                d.innerHTML = `
                    <div>
                        <span class="ipn">${this.escapeHtml(p.name)}</span>
                        <span class="ips">${ui.bytes(p.size)}</span>
                        ${meta}
                    </div>
                    <button class="btn danger small" data-fn="${this.escapeHtml(p.name)}">Remove</button>
                `;
                d.querySelector('[data-fn]').onclick = async () => {
                    if (!(await ui.confirm(`Remove ${p.name}?`, 'Remove Plugin'))) return;
                    try { await api.req(`/servers/${sid()}/plugins/uninstall`, { method: 'POST', body: JSON.stringify({ filename: p.name }) }); await plugins.loadInstalled(); ui.toast('Removed', 'success'); plugins.refreshCurrentBrowserPage(); } catch (e) { ui.toast(e.message, 'error'); }
                };
                el.appendChild(d);
            });
        } catch (e) { ui.toast(e.message, 'error'); }
    },
    refreshCurrentBrowserPage() {
        const browser = document.getElementById('plugins-browser-view');
        if (!browser || browser.hidden) return;
        this.goToPage(Math.floor(this.currentOffset / this.pageSize));
    },
    async search(page = 0) {
        const q = document.getElementById('plugin-search').value.trim();
        if (!q) return this.loadDiscoveryCategory(this.currentCategory || 'popular', 0);
        this.currentQuery = q;
        this.currentCategory = '';
        this.currentOffset = Math.max(page, 0) * this.pageSize;
        this.showBrowser();
        const container = document.getElementById('plugins-discovery-tabs');
        if (container) {
            container.querySelectorAll('.sub-nav-item').forEach(b => b.classList.remove('active'));
        }
        const g = document.getElementById('plugins-grid'); g.innerHTML = '<p class="text-muted">Searching...</p>';
        try {
            const data = await api.req(`/servers/${sid()}/plugins/search?q=${encodeURIComponent(q)}&limit=${this.pageSize}&offset=${this.currentOffset}`);
            this.renderHits(data);
        } catch (e) { ui.toast(e.message, 'error'); }
    },
    async goToPage(page) {
        if (this.currentQuery) return this.search(page);
        return this.loadDiscoveryCategory(this.currentCategory || 'popular', page);
    },
    showBrowser() {
        const browser = document.getElementById('plugins-browser-view');
        const detail = document.getElementById('plugin-detail-view');
        if (browser) browser.hidden = false;
        if (detail) {
            detail.hidden = true;
            detail.innerHTML = '';
        }
    },
    renderHits(payload) {
        const hits = Array.isArray(payload) ? payload : (payload.hits || []);
        this.currentOffset = Array.isArray(payload) ? this.currentOffset : (payload.offset || 0);
        this.currentTotal = Array.isArray(payload) ? hits.length : (payload.totalHits || 0);
        const g = document.getElementById('plugins-grid'); g.innerHTML = '';
        const bar = document.getElementById('plugins-result-bar');
        const label = this.currentQuery ? `Search: "${this.currentQuery}"` : (this.currentCategory === 'popular' ? 'Popular' : this.currentCategory);
        if (bar) bar.textContent = `${label} - ${this.currentTotal.toLocaleString()} projects found`;
        if (!hits || !hits.length) {
            g.innerHTML = '<p class="text-muted">No results found matching your server software.</p>';
            this.renderPagination();
            return;
        }
        hits.forEach(p => {
            const installed = this.getInstalledForProject(p.project_id);
            const el = document.createElement('div'); el.className = 'plugin-card';
            el.tabIndex = 0;
            el.innerHTML = `
                <div class="plugin-header">
                    <img src="${this.escapeHtml(p.icon_url || '')}" class="plugin-icon" alt=— onerror="this.style.display='none'">
                    <div>
                        <div class="plugin-title">${this.escapeHtml(p.title)}</div>
                        <div class="plugin-author">${this.escapeHtml(p.author || 'Modrinth')}</div>
                    </div>
                </div>
                <div class="plugin-desc">${this.escapeHtml(p.description)}</div>
                <div class="plugin-card-meta">
                    <span>${(p.downloads || 0).toLocaleString()} downloads</span>
                    <span>${this.escapeHtml(p.project_type || '')}</span>
                </div>
                ${installed ? `<div class="plugin-installed-note">Installed: ${this.escapeHtml(installed.modrinth?.versionNumber || installed.name)}</div>` : ''}
                <button class="btn ${installed ? 'success' : 'primary'} small full-width" data-pid="${this.escapeHtml(p.project_id)}" ${installed ? 'disabled' : ''}>${installed ? 'Installed' : 'Install latest compatible'}</button>
            `;
            el.onclick = () => this.openProject(p.project_id);
            el.onkeydown = e => { if (e.key === 'Enter') this.openProject(p.project_id); };
            el.querySelector('[data-pid]').onclick = async (event) => {
                event.stopPropagation();
                if (installed) return;
                try {
                    ui.toast('Installing...', 'info');
                    const r = await api.req(`/servers/${sid()}/plugins/install`, { method: 'POST', body: JSON.stringify({ projectId: p.project_id }) });
                    ui.toast(r.message, 'success');
                    await plugins.loadInstalled();
                    plugins.refreshCurrentBrowserPage();
                } catch (e) { ui.toast(e.message, 'error'); }
            };
            g.appendChild(el);
        });
        this.renderPagination();
    },
    renderPagination() {
        const el = document.getElementById('plugins-pagination');
        if (!el) return;
        if (!this.currentTotal || this.currentTotal <= this.pageSize) {
            el.innerHTML = '';
            return;
        }
        const currentPage = Math.floor(this.currentOffset / this.pageSize) + 1;
        const totalPages = Math.max(1, Math.ceil(this.currentTotal / this.pageSize));
        el.innerHTML = `
            <button class="btn outline small" id="plugin-page-prev" ${currentPage <= 1 ? 'disabled' : ''}>Prev</button>
            <div class="plugin-page-status">
                Page <input type="number" id="plugin-page-input" min="1" max="${totalPages}" value="${currentPage}"> of ${totalPages.toLocaleString()}
            </div>
            <button class="btn outline small" id="plugin-page-next" ${currentPage >= totalPages ? 'disabled' : ''}>Next</button>
        `;
        document.getElementById('plugin-page-prev')?.addEventListener('click', () => this.goToPage(currentPage - 2));
        document.getElementById('plugin-page-next')?.addEventListener('click', () => this.goToPage(currentPage));
        document.getElementById('plugin-page-input')?.addEventListener('change', e => {
            const requested = Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), totalPages);
            this.goToPage(requested - 1);
        });
    },
    async openProject(projectId) {
        const browser = document.getElementById('plugins-browser-view');
        const detail = document.getElementById('plugin-detail-view');
        if (!detail) return;
        if (browser) browser.hidden = true;
        detail.hidden = false;
        if (detail._readmeObserver) {
            detail._readmeObserver.disconnect();
            detail._readmeObserver = null;
        }
        detail.innerHTML = '<p class="text-muted">Loading project details...</p>';
        try {
            const [project, versions] = await Promise.all([
                api.req(`/servers/${sid()}/plugins/project/${encodeURIComponent(projectId)}`),
                api.req(`/servers/${sid()}/plugins/project/${encodeURIComponent(projectId)}/versions`)
            ]);
            this.renderProjectDetail(project, versions);
        } catch (e) {
            if (detail._readmeObserver) {
                detail._readmeObserver.disconnect();
                detail._readmeObserver = null;
            }
            detail.innerHTML = `<button class="btn outline small" id="plugin-detail-back">Back</button><p class="text-muted">${this.escapeHtml(e.message)}</p>`;
            document.getElementById('plugin-detail-back')?.addEventListener('click', () => this.showBrowser());
        }
    },
    renderProjectDetail(project, versions) {
        const detail = document.getElementById('plugin-detail-view');
        if (detail._readmeObserver) {
            detail._readmeObserver.disconnect();
            detail._readmeObserver = null;
        }
        const gallery = (project.gallery || []).slice(0, 8);
        const categories = [...(project.categories || []), ...(project.loaders || [])].slice(0, 10);
        detail.innerHTML = `
            <div class="plugin-detail-toolbar">
                <button class="btn outline small" id="plugin-detail-back">Back</button>
                <button class="btn outline small" id="plugin-open-modrinth">Open on Modrinth</button>
            </div>
            <div class="plugin-detail-hero">
                <img src="${this.escapeHtml(project.icon_url || '')}" class="plugin-detail-icon" alt=— onerror="this.style.display='none'">
                <div>
                    <h2>${this.escapeHtml(project.title)}</h2>
                    <p>${this.escapeHtml(project.description)}</p>
                    <div class="plugin-detail-stats">
                        <span>${(project.downloads || 0).toLocaleString()} downloads</span>
                        <span>${(project.followers || 0).toLocaleString()} followers</span>
                        <span>${this.escapeHtml(project.project_type || 'project')}</span>
                    </div>
                    <div class="plugin-tags">${categories.map(c => `<span>${this.escapeHtml(c)}</span>`).join('')}</div>
                </div>
            </div>
            ${gallery.length ? `<div class="plugin-gallery">${gallery.map(img => `
                <figure>
                    <img src="${this.escapeHtml(img.raw_url || img.url || '')}" alt="${this.escapeHtml(img.title || project.title)}">
                    ${img.title ? `<figcaption>${this.escapeHtml(img.title)}</figcaption>` : ''}
                </figure>
            `).join('')}</div>` : ''}
            <div class="plugin-detail-columns">
                <section class="plugin-readme">
                    ${this.renderMarkdown(project.body)}
                </section>
                <aside class="plugin-versions">
                    <h3>Versions</h3>
                    <div class="plugin-versions-list">
                        ${versions.map(v => this.renderVersionItem(project.id, v)).join('')}
                    </div>
                </aside>
            </div>
        `;
        document.getElementById('plugin-detail-back')?.addEventListener('click', () => this.showBrowser());
        document.getElementById('plugin-open-modrinth')?.addEventListener('click', () => window.open(project.modrinthUrl, '_blank', 'noopener'));
        detail.querySelectorAll('[data-version-install]').forEach(btn => {
            btn.addEventListener('click', () => this.installVersion(project.id, btn.dataset.versionInstall, btn.dataset.compatible === 'true'));
        });

        // Dynamically adjust versions list height to match description/readme height
        const readme = detail.querySelector('.plugin-readme');
        const versionsList = detail.querySelector('.plugin-versions-list');
        if (readme && versionsList) {
            const observer = new ResizeObserver(entries => {
                for (let entry of entries) {
                    const readmeHeight = entry.contentRect.height;
                    const maxPossibleHeight = window.innerHeight - 200; // approximate offset for header/footer
                    const targetMax = Math.max(720, Math.min(readmeHeight, maxPossibleHeight));
                    versionsList.style.maxHeight = `${targetMax}px`;
                }
            });
            observer.observe(readme);
            detail._readmeObserver = observer;
        }
    },
    renderVersionItem(projectId, version) {
        const primaryFile = (version.files || []).find(f => f.primary) || (version.files || [])[0];
        const date = version.date_published ? new Date(version.date_published).toLocaleDateString() : 'Unknown date';
        const gameVersions = (version.game_versions || []).slice(0, 5).join(', ');
        const moreGames = (version.game_versions || []).length > 5 ? ` +${version.game_versions.length - 5}` : '';
        const installedVersion = version.installed || !!this.getInstalledVersion(version.id);
        const installedProject = version.installedProject || !!this.getInstalledForProject(projectId);
        const buttonLabel = installedVersion ? 'Installed' : installedProject ? 'Install this version' : 'Install';
        return `
            <div class="plugin-version-item ${version.compatible ? 'compatible' : 'incompatible'}">
                <div>
                    <div class="plugin-version-title">${this.escapeHtml(version.name || version.version_number)}</div>
                    <div class="plugin-version-meta">
                        <span>${this.escapeHtml(version.version_number)}</span>
                        <span>${this.escapeHtml((version.loaders || []).join(', '))}</span>
                        <span>${this.escapeHtml(gameVersions)}${moreGames}</span>
                        <span>${date}</span>
                        ${primaryFile ? `<span>${ui.bytes(primaryFile.size || 0)}</span>` : ''}
                    </div>
                </div>
                <div class="plugin-version-actions">
                    ${installedVersion ? '<span class="plugin-compat ok">Installed version</span>' : ''}
                    <span class="plugin-compat ${version.compatible ? 'ok' : 'warn'}">${version.compatible ? 'Compatible' : 'Incompatible'}</span>
                    <button class="btn ${installedVersion ? 'success' : 'primary'} small" data-version-install="${this.escapeHtml(version.id)}" data-compatible="${version.compatible}" ${installedVersion ? 'disabled' : ''}>${buttonLabel}</button>
                </div>
            </div>
        `;
    },
    async installVersion(projectId, versionId, compatible) {
        if (!compatible) {
            const ok = await ui.confirm('This version does not match the server Minecraft version or loader. Install it anyway?', 'Install incompatible version');
            if (!ok) return;
        }
        try {
            ui.toast('Installing version...', 'info');
            const r = await api.req(`/servers/${sid()}/plugins/install`, {
                method: 'POST',
                body: JSON.stringify({ projectId, versionId, allowIncompatible: !compatible })
            });
            ui.toast(r.message, 'success');
            await this.loadInstalled();
            await this.openProject(projectId);
        } catch (e) { ui.toast(e.message, 'error'); }
    },
    async updateAll() {
        if (!this.installedItems.length) return ui.toast('No plugins or mods installed.', 'info');
        if (!(await ui.confirm('Update every Modrinth-detected plugin/mod to the newest compatible version for this server?', 'Update all'))) return;
        try {
            ui.toast('Updating installed plugins/mods...', 'info');
            const r = await api.req(`/servers/${sid()}/plugins/update-all`, { method: 'POST', body: JSON.stringify({}) });
            ui.toast(r.message, r.updated ? 'success' : 'info');
            await this.loadInstalled();
            this.refreshCurrentBrowserPage();
        } catch (e) { ui.toast(e.message, 'error'); }
    }
};
document.getElementById('btn-plugin-search').addEventListener('click', () => plugins.search());
document.getElementById('plugin-search').addEventListener('keypress', e => { if (e.key === 'Enter') plugins.search(); });
document.getElementById('btn-plugins-update-all')?.addEventListener('click', () => plugins.updateAll());

// Backups
const backups = {
    async load() {
        const list = document.getElementById('backups-list'); list.innerHTML = '<p class="text-muted" style="padding:0.5rem">Loading...</p>';
        try {
            // Load config
            try {
                const config = await api.req(`/servers/${sid()}/backup-config`);
                const abt = document.getElementById('auto-backup-toggle');
                if (abt) abt.checked = !!config.auto_backup;
                const int = document.getElementById('backup-interval');
                if (int) int.value = config.backup_interval || 24;
                const inc = document.getElementById('backup-includes');
                if (inc) inc.value = config.backup_includes || 'all';
            } catch(e) {}
            
            const data = await api.req(`/servers/${sid()}/backups`); list.innerHTML = '';
            if (!data.length) { list.innerHTML = '<div class="list-item"><p class="text-muted">No backups.</p></div>'; return; }
            data.forEach(b => {
                const el = document.createElement('div'); el.className = 'list-item';
                el.innerHTML = `<div class="col col-wide text-mono" data-label="Filename">${b.name}</div><div class="col" data-label="Size">${ui.bytes(b.size)}</div><div class="col" data-label="Date">${new Date(b.date).toLocaleString()}</div><div class="col actions" style="display:flex;gap:0.3rem;justify-content:flex-end" data-label="Actions"><button class="btn outline small" data-dl="${b.name}">Download</button><button class="btn outline small" data-rs="${b.name}">Restore</button><button class="btn danger small" data-rm="${b.name}">Delete</button></div>`;
                el.querySelector('[data-dl]').onclick = () => api.download(`/servers/${sid()}/backups/${b.name}/download`, b.name);
                el.querySelector('[data-rs]').onclick = async () => { if (!(await ui.confirm(`Restore ${b.name}? This will overwrite current files.`, 'Restore Backup'))) return; try { ui.toast('Restoring...', 'info'); const r = await api.req(`/servers/${sid()}/backups/${b.name}/restore`, { method: 'POST' }); ui.toast(r.message, 'success'); } catch (e) { ui.toast(e.message, 'error'); } };
                el.querySelector('[data-rm]').onclick = async () => { if (!(await ui.confirm(`Delete ${b.name}?`, 'Delete Backup'))) return; try { await api.req(`/servers/${sid()}/backups/${b.name}/delete`, { method: 'POST' }); backups.load(); ui.toast('Deleted', 'success'); } catch (e) { ui.toast(e.message, 'error'); } };
                list.appendChild(el);
            });
        } catch (e) { ui.toast(e.message, 'error'); }
    },
    async create() {
        const includes = document.getElementById('backup-includes')?.value || 'all';
        try { ui.toast('Creating backup...', 'info'); const r = await api.req(`/servers/${sid()}/backups/create`, { method: 'POST', body: JSON.stringify({ includes }) }); ui.toast(r.message, 'success'); backups.load(); } catch (e) { ui.toast(e.message, 'error'); }
    },
    async saveConfig() {
        const enabled = document.getElementById('auto-backup-toggle')?.checked || false;
        const interval = parseInt(document.getElementById('backup-interval')?.value) || 24;
        const includes = document.getElementById('backup-includes')?.value || 'all';
        try {
            await api.req(`/servers/${sid()}/backup-config`, { method: 'POST', body: JSON.stringify({ enabled, interval, includes }) });
            ui.toast('Backup configuration saved', 'success');
        } catch (e) { ui.toast(e.message, 'error'); }
    }
};
document.getElementById('btn-run-backup')?.addEventListener('click', () => backups.create());
document.getElementById('btn-save-backup-config')?.addEventListener('click', () => backups.saveConfig());

// Logs
const logs = {
    currentFile: '', currentPage: 1, totalPages: 1,
    async init() {
        try {
            const files = await api.req(`/servers/${sid()}/logs`);
            const sel = document.getElementById('log-file-select'); sel.innerHTML = '<option value=—>Select log file...</option>';
            files.forEach(f => { sel.innerHTML += `<option value="${f.name}">${f.name} (${ui.bytes(f.size)})</option>`; });
        } catch (e) { ui.toast(e.message, 'error'); }
    },
    async read(file, page, filter) {
        if (!file) return;
        logs.currentFile = file;
        try {
            let url = `/servers/${sid()}/logs/read?file=${encodeURIComponent(file)}&page=${page || ''}`;
            if (filter) url += `&filter=${encodeURIComponent(filter)}`;
            const d = await api.req(url);
            document.getElementById('log-content').textContent = d.content || '(empty)';
            logs.currentPage = d.page; logs.totalPages = d.totalPages;
            document.getElementById('log-page-info').textContent = `Page ${d.page} / ${d.totalPages}`;
        } catch (e) { ui.toast(e.message, 'error'); }
    }
};
document.getElementById('log-file-select').addEventListener('change', e => logs.read(e.target.value, 1));
document.getElementById('btn-log-filter').addEventListener('click', () => logs.read(logs.currentFile, 1, document.getElementById('log-filter-input').value));
document.getElementById('btn-log-prev').addEventListener('click', () => { if (logs.currentPage > 1) logs.read(logs.currentFile, logs.currentPage - 1, document.getElementById('log-filter-input').value); });
document.getElementById('btn-log-next').addEventListener('click', () => { if (logs.currentPage < logs.totalPages) logs.read(logs.currentFile, logs.currentPage + 1, document.getElementById('log-filter-input').value); });

// Server Settings & Users Permission Assignment
const srvSettings = {
    async load() {
        try {
            // Fetch fresh server details
            const server = await api.req(`/servers/${sid()}`);
            if (!server) return;

            // Populate the basic software/version settings inputs
            const currentSoftwareInput = document.getElementById('sv-current-software');
            if (currentSoftwareInput) currentSoftwareInput.value = server.software;
            const currentVersionInput = document.getElementById('sv-current-version');
            if (currentVersionInput) currentVersionInput.value = server.version;

            // Populate advanced settings fields
            const nameInput = document.getElementById('adv-server-name');
            if (nameInput) nameInput.value = server.name || '';
            const ramInput = document.getElementById('adv-server-ram');
            if (ramInput) ramInput.value = server.ram_mb || '2048';
            const portInput = document.getElementById('adv-server-port');
            if (portInput) portInput.value = server.port || '25565';
            const javaInput = document.getElementById('adv-server-java');
            if (javaInput) javaInput.value = server.java_path || 'java';
            const logRetInput = document.getElementById('adv-log-retention');
            if (logRetInput) logRetInput.value = server.log_retention_days !== null && server.log_retention_days !== undefined ? server.log_retention_days : '7';
            const backupRetInput = document.getElementById('adv-backup-retention');
            if (backupRetInput) backupRetInput.value = server.backup_retention_days !== null && server.backup_retention_days !== undefined ? server.backup_retention_days : '30';

            // Keep local state completely synced
            if (state.currentServer) {
                state.currentServer.java_path = server.java_path;
                state.currentServer.log_retention_days = server.log_retention_days;
                state.currentServer.backup_retention_days = server.backup_retention_days;
            }

        } catch (e) {
            ui.toast('Failed to load server settings: ' + e.message, 'error');
        }
    }
};

// Advanced Server Settings Save Handler
document.getElementById('btn-save-adv-settings')?.addEventListener('click', async () => {
    const name = document.getElementById('adv-server-name')?.value.trim();
    const ram = parseInt(document.getElementById('adv-server-ram')?.value, 10);
    const port = parseInt(document.getElementById('adv-server-port')?.value, 10);
    const java_path = document.getElementById('adv-server-java')?.value.trim();
    const log_retention_days = parseInt(document.getElementById('adv-log-retention')?.value, 10);
    const backup_retention_days = parseInt(document.getElementById('adv-backup-retention')?.value, 10);

    if (!name) return ui.toast('Server name is required', 'error');
    if (isNaN(ram) || ram < 512 || ram > 16384) return ui.toast('RAM must be between 512 and 16384 MB', 'error');
    if (isNaN(port) || port < 1024 || port > 65535) return ui.toast('Port must be between 1024 and 65535', 'error');
    if (!java_path) return ui.toast('Java path is required', 'error');
    if (isNaN(log_retention_days) || log_retention_days < 0) return ui.toast('Log retention must be 0 or greater', 'error');
    if (isNaN(backup_retention_days) || backup_retention_days < 0) return ui.toast('Backup retention must be 0 or greater', 'error');

    // Safe Check: is server currently online?
    const isOnline = state.currentServer && state.currentServer.status === 'online';
    const isRamChanged = Number(state.currentServer?.ram_mb) !== ram;
    const isPortChanged = Number(state.currentServer?.port) !== port;
    const isJavaChanged = state.currentServer?.java_path !== java_path;

    if (isOnline && (isRamChanged || isPortChanged || isJavaChanged)) {
        return ui.toast('The server must be offline (stopped) to change RAM, Port, or Java Path.', 'error');
    }

    try {
        ui.toast('Saving settings...', 'info');
        const res = await api.req(`/servers/${sid()}/settings`, {
            method: 'POST',
            body: JSON.stringify({
                name,
                port,
                ram_mb: ram,
                java_path,
                log_retention_days,
                backup_retention_days
            })
        });

        ui.toast(res.message || 'Settings saved successfully', 'success');

        // Sync local currentServer details
        if (state.currentServer) {
            state.currentServer.name = name;
            state.currentServer.port = port;
            state.currentServer.ram_mb = ram;
            state.currentServer.java_path = java_path;
            state.currentServer.log_retention_days = log_retention_days;
            state.currentServer.backup_retention_days = backup_retention_days;
        }

        // Dynamically update dashboard top-bar header
        document.getElementById('sh-name').textContent = name;
        const currentHost = window.location.hostname;
        document.getElementById('sh-address').textContent = `${currentHost}:${port}`;

        // Reload the sidebar server list to reflect the new server name & port
        if (window.server && typeof server.loadList === 'function') {
            server.loadList();
        }
    } catch (e) {
        ui.toast(e.message || 'Failed to save advanced settings', 'error');
    }
});

document.getElementById('modal-edit-user-perms-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-edit-user-perms-cancel')?.addEventListener('click', () => ui.closeModals());

// Software Switching and Version Changer Handler
document.getElementById('btn-switch-software')?.addEventListener('click', async () => {
    const software = document.getElementById('sv-new-software').value;
    const version = document.getElementById('sv-new-version').value;

    if (!software) return ui.toast('Engine software is required', 'error');
    if (!version) return ui.toast('Minecraft version is required', 'error');

    try {
        // Step 1: Fire pre-check compatibility test (confirm: false)
        const check = await api.req(`/servers/${sid()}/switch-software`, {
            method: 'POST',
            body: JSON.stringify({ software, version, confirm: false })
        });

        if (check.warnings && check.warnings.length > 0) {
            // Render warnings inside modal
            const wList = document.getElementById('switch-warnings-list');
            wList.innerHTML = check.warnings.map(w => `<div style="margin-bottom:0.25rem">• ${w}</div>`).join('');
            
            // Wire confirmation action
            document.getElementById('btn-confirm-switch-execute').onclick = async () => {
                try {
                    ui.toast('Initiating transition...', 'info');
                    const r = await api.req(`/servers/${sid()}/switch-software`, {
                        method: 'POST',
                        body: JSON.stringify({ software, version, confirm: true })
                    });
                    ui.closeModals();
                    ui.toast(r.message, 'success');
                    const formattedSoftware = software.charAt(0).toUpperCase() + software.slice(1).toLowerCase();
                    // Update settings tab inputs
                    document.getElementById('sv-current-software').value = formattedSoftware.toUpperCase();
                    document.getElementById('sv-current-version').value = version;
                    document.getElementById('sv-new-version').value = '';
                    // Update server top bar header dynamically
                    document.getElementById('sh-software').textContent = formattedSoftware;
                    document.getElementById('sh-version').textContent = version;
                    // Keep state.currentServer in sync
                    if (state.currentServer) {
                        state.currentServer.software = formattedSoftware;
                        state.currentServer.version = version;
                    }
                } catch (err) { ui.toast(err.message, 'error'); }
            };

            ui.showModal('modal-confirm-switch');
        } else {
            // No warnings: proceed immediately with confirmation
            if (!(await ui.confirm(`Are you sure you want to transition to ${software.toUpperCase()} version ${version}?`, 'Transition Software'))) return;
            ui.toast('Initiating transition...', 'info');
            const r = await api.req(`/servers/${sid()}/switch-software`, {
                method: 'POST',
                body: JSON.stringify({ software, version, confirm: true })
            });
            ui.toast(r.message, 'success');
            const formattedSoftware = software.charAt(0).toUpperCase() + software.slice(1).toLowerCase();
            // Update settings tab inputs
            document.getElementById('sv-current-software').value = formattedSoftware.toUpperCase();
            document.getElementById('sv-current-version').value = version;
            document.getElementById('sv-new-version').value = '';
            // Update server top bar header dynamically
            document.getElementById('sh-software').textContent = formattedSoftware;
            document.getElementById('sh-version').textContent = version;
            // Keep state.currentServer in sync
            if (state.currentServer) {
                state.currentServer.software = formattedSoftware;
                state.currentServer.version = version;
            }
        }
    } catch (e) { ui.toast(e.message, 'error'); }
});

document.getElementById('modal-confirm-switch-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-confirm-switch-cancel')?.addEventListener('click', () => ui.closeModals());

// Global Users Management (Global context)
const globalUsers = {
    async load() {
        const list = document.getElementById('global-users-list');
        list.innerHTML = '<p class="text-muted">Loading users...</p>';
        try {
            const resData = await api.req('/users');
            const data = resData.users || [];
            const isCallerManager = resData.isCallerManager;

            // Handle "+ Create User", "Generate Invite Token", "Clear All Tokens" buttons display
            const btnCreateUser = document.getElementById('btn-create-user');
            if (btnCreateUser) btnCreateUser.style.display = isCallerManager ? '' : 'none';
            
            const btnInviteToken = document.getElementById('btn-invite-token');
            if (btnInviteToken) btnInviteToken.style.display = isCallerManager ? '' : 'none';
            
            const btnClearTokens = document.getElementById('btn-clear-tokens');
            if (btnClearTokens) btnClearTokens.style.display = isCallerManager ? '' : 'none';

            list.innerHTML = '';
            if (!data.length) { list.innerHTML = '<div class="list-item"><p class="text-muted">No other panel users.</p></div>'; return; }
            data.forEach(u => {
                const el = document.createElement('div'); el.className = 'list-item';
                
                const isSelf = Number(u.id) === Number(state.userId);
                const isDisabled = !!u.disabled;

                let actionsHtml = '';
                if (isCallerManager) {
                    if (isSelf) {
                        actionsHtml = `
                            <button class="btn outline small" data-change-name-self="${u.id}">Change Name</button>
                            <button class="btn outline small" data-change-password-self="${u.id}">Change Password</button>
                            <button class="btn outline small" data-reset-password-admin="${u.id}">Reset Password</button>
                            <button class="btn outline small" data-edit-perm="${u.id}">Edit Permissions</button>
                        `;
                    } else {
                        actionsHtml = `
                            <button class="btn outline small" data-change-name-admin="${u.id}">Change Name</button>
                            <button class="btn outline small" data-reset-password-admin="${u.id}">Reset Password</button>
                            <button class="btn outline small" data-edit-perm="${u.id}">Edit Permissions</button>
                            <button class="btn danger small" data-del-user="${u.id}">Delete</button>
                        `;
                    }
                } else {
                    // Regular user view (only for their own profile)
                    actionsHtml = `
                        <button class="btn outline small" data-change-name-self="${u.id}">Change Name</button>
                        <button class="btn outline small" data-change-password-self="${u.id}">Change Password</button>
                    `;
                }

                let toggleHtml = '';
                if (isSelf) {
                    toggleHtml = `
                        <label class="toggle-switch" style="opacity: 0.5; cursor: not-allowed;">
                            <input type="checkbox" checked disabled>
                            <span class="toggle-slider"></span>
                        </label>
                    `;
                } else {
                    toggleHtml = `
                        <label class="toggle-switch">
                            <input type="checkbox" ${!isDisabled ? 'checked' : ''} data-toggle-disabled="${u.id}">
                            <span class="toggle-slider"></span>
                        </label>
                    `;
                }

                const rankHtml = u.rank_name ? 
                    `<span class="rank-badge" style="background:${u.rank_color}22; color:${u.rank_color}; border-color:${u.rank_color}44; border: 1px solid">${u.rank_name}</span>` : 
                    `<span class="rank-badge" style="background:rgba(255,255,255,0.05); color:var(--text-muted); border: 1px solid var(--border-color)">${u.role.toUpperCase()}</span>`;

                el.innerHTML = `
                    <div class="col col-wide" data-label="Username"><strong>${u.username}</strong></div>
                    <div class="col" data-label="Rank">${rankHtml}</div>
                    <div class="col" style="display:flex;align-items:center" data-label="Status">${toggleHtml}</div>
                    <div class="col" data-label="Created">${new Date(u.created_at).toLocaleDateString()}</div>
                    <div class="col actions" data-label="Actions">
                        ${actionsHtml}
                    </div>
                `;

                // Wire up toggle disabled switch
                const toggleInput = el.querySelector(`[data-toggle-disabled="${u.id}"]`);
                if (toggleInput) {
                    toggleInput.onchange = async () => {
                        try {
                            const res = await api.req(`/users/${u.id}/toggle-disabled`, { method: 'PATCH' });
                            ui.toast(res.message, 'success');
                            globalUsers.load();
                        } catch (e) {
                            ui.toast(e.message, 'error');
                            toggleInput.checked = !toggleInput.checked; // revert
                        }
                    };
                }

                // Wire up click handlers based on present data-attributes
                const btnChangeNameSelf = el.querySelector('[data-change-name-self]');
                if (btnChangeNameSelf) {
                    btnChangeNameSelf.onclick = () => {
                        document.getElementById('cns-current').value = state.user;
                        document.getElementById('cns-new').value = '';
                        document.getElementById('cns-confirm').value = '';
                        ui.showModal('modal-change-name-self');
                    };
                }

                const btnChangePasswordSelf = el.querySelector('[data-change-password-self]');
                if (btnChangePasswordSelf) {
                    btnChangePasswordSelf.onclick = () => {
                        document.getElementById('cps-current').value = '';
                        document.getElementById('cps-new').value = '';
                        document.getElementById('cps-confirm').value = '';
                        ui.showModal('modal-change-password-self');
                    };
                }

                const btnChangeNameAdmin = el.querySelector('[data-change-name-admin]');
                if (btnChangeNameAdmin) {
                    btnChangeNameAdmin.onclick = () => {
                        document.getElementById('cna-userid').value = u.id;
                        document.getElementById('cna-new').value = '';
                        document.getElementById('cna-confirm').value = '';
                        ui.showModal('modal-change-name-admin');
                    };
                }

                const btnResetPasswordAdmin = el.querySelector('[data-reset-password-admin]');
                if (btnResetPasswordAdmin) {
                    btnResetPasswordAdmin.onclick = () => {
                        document.getElementById('rpa-userid').value = u.id;
                        document.getElementById('rpa-new').value = '';
                        document.getElementById('rpa-confirm').value = '';
                        ui.showModal('modal-reset-password-admin');
                    };
                }

                const btnDelUser = el.querySelector('[data-del-user]');
                if (btnDelUser) {
                    btnDelUser.onclick = async () => {
                        if (!(await ui.confirm(`Delete user ${u.username}?`, 'Delete User'))) return;
                        try {
                            await api.req(`/users/${u.id}/delete`, { method: 'POST' });
                            globalUsers.load(); ui.toast('User deleted', 'success');
                        } catch (e) { ui.toast(e.message, 'error'); }
                    };
                }

                const btnEditPerm = el.querySelector('[data-edit-perm]');
                if (btnEditPerm) {
                    btnEditPerm.onclick = () => globalUsers.editUserPerms(u);
                }

                list.appendChild(el);
            });
        } catch (e) { ui.toast(e.message, 'error'); }
    },

    async editUserPerms(user) {
        document.getElementById('eup-username').textContent = user.username;
        
        // 1. Fetch data
        const [ranks, allPerms, userPermsData] = await Promise.all([
            api.req('/ranks'),
            api.req('/users/permissions'),
            api.req(`/users/${user.id}/permissions`)
        ]);

        let selectedRankId = userPermsData.rank ? userPermsData.rank.id : null;
        
        // Track local changes in memory
        let localGlobal = [...userPermsData.global];
        let localServers = JSON.parse(JSON.stringify(userPermsData.servers || {}));

        // Render Rank Selectors
        const renderRanks = () => {
            const ranksContainer = document.getElementById('eup-ranks-list');
            ranksContainer.innerHTML = '';
            
            // Add "No Rank" Option
            const noRankCard = document.createElement('div');
            noRankCard.className = `rank-card-select ${selectedRankId === null ? 'selected' : ''}`;
            noRankCard.innerHTML = `
                <div class="no-rank-icon">"”</div>
                <h4>No Rank</h4>
            `;
            noRankCard.onclick = () => {
                selectedRankId = null;
                renderRanks();
                renderMatrix();
            };
            ranksContainer.appendChild(noRankCard);

            // Add ranks
            ranks.forEach(r => {
                const item = document.createElement('div');
                item.className = `rank-card-select ${selectedRankId === r.id ? 'selected' : ''}`;
                item.style.borderColor = r.color + '44';
                item.style.color = r.color;
                item.innerHTML = `
                    <div class="rank-icon" style="width:12px; height:12px; border-radius:50%; background:${r.color}"></div>
                    <h4>${r.name}</h4>
                `;
                item.onclick = () => {
                    selectedRankId = r.id;
                    renderRanks();
                    renderMatrix();
                };
                ranksContainer.appendChild(item);
            });
        };

        // Render Matrix Grid
        const renderMatrix = () => {
            // Find current rank's permissions
            let rankGlobal = [];
            let rankServers = {};
            if (selectedRankId !== null) {
                const rObj = ranks.find(r => r.id === selectedRankId);
                if (rObj) {
                    rankGlobal = rObj.global_permissions || [];
                    rankServers = rObj.permissions || {};
                }
            }

            // Headers
            const headerRow = document.getElementById('eup-matrix-header');
            headerRow.innerHTML = '<th>Permission</th><th>Global</th>';
            state.servers.forEach(s => {
                headerRow.innerHTML += `<th>${s.name}</th>`;
            });

            // Body
            const body = document.getElementById('eup-matrix-body');
            body.innerHTML = '';

            let lastGroup = '';
            allPerms.forEach(p => {
                if (p.group !== lastGroup) {
                    lastGroup = p.group;
                    const hRow = document.createElement('tr');
                    hRow.className = 'matrix-group-row';
                    hRow.innerHTML = `<td colspan="${state.servers.length + 2}">${p.group}</td>`;
                    body.appendChild(hRow);
                }

                const tr = document.createElement('tr');
                
                const nameCell = document.createElement('td');
                nameCell.innerHTML = `
                    <div style="font-weight:600">${p.label}</div>
                    <div class="text-mono text-muted" style="font-size:0.7rem">${p.key}</div>
                `;
                tr.appendChild(nameCell);

                // Global Column Cell
                const isGlobalRankInherited = rankGlobal.includes('*') || rankGlobal.includes('root') || rankGlobal.includes(p.key);
                const isGlobalChecked = isGlobalRankInherited || localGlobal.includes(p.key);
                const globalTd = document.createElement('td');
                globalTd.setAttribute('data-label', 'Global');
                globalTd.appendChild(createMatrixCheckbox('global', p.key, isGlobalChecked, isGlobalRankInherited, (checked) => {
                    if (checked) {
                        if (!localGlobal.includes(p.key)) localGlobal.push(p.key);
                    } else {
                        localGlobal = localGlobal.filter(k => k !== p.key);
                    }
                    renderMatrix();
                }));
                tr.appendChild(globalTd);

                // Server Columns Cells
                state.servers.forEach(s => {
                    const td = document.createElement('td');
                    td.setAttribute('data-label', s.name);
                    if (p.globalOnly || p.key === 'account.manage' || p.key === 'panel.settings') {
                        td.innerHTML = '<span class="text-muted" style="font-size:0.8rem;opacity:0.3">"”</span>';
                    } else {
                        const isServerRankInherited = isGlobalRankInherited || 
                            (rankServers[s.id] && (rankServers[s.id].includes('*') || rankServers[s.id].includes('root') || rankServers[s.id].includes(p.key)));
                        const isServerChecked = isServerRankInherited || (localServers[s.id] && localServers[s.id].includes(p.key));
                        
                        td.appendChild(createMatrixCheckbox(s.id, p.key, isServerChecked, isServerRankInherited, (checked) => {
                            if (!localServers[s.id]) localServers[s.id] = [];
                            if (checked) {
                                if (!localServers[s.id].includes(p.key)) localServers[s.id].push(p.key);
                            } else {
                                localServers[s.id] = localServers[s.id].filter(k => k !== p.key);
                            }
                            renderMatrix();
                        }));
                    }
                    tr.appendChild(td);
                });

                body.appendChild(tr);
            });
        };

        // Render initially
        renderRanks();
        renderMatrix();

        // Save action
        document.getElementById('btn-user-perms-save').onclick = async () => {
            try {
                // Save rank first
                await api.req(`/users/${user.id}/rank`, {
                    method: 'PUT',
                    body: JSON.stringify({ rankId: selectedRankId })
                });

                // Save individual permissions
                await api.req(`/users/${user.id}/permissions`, {
                    method: 'PUT',
                    body: JSON.stringify({ global: localGlobal, servers: localServers })
                });

                ui.closeModals();
                ui.toast('User permissions updated successfully', 'success');
                globalUsers.load();
            } catch (e) {
                ui.toast(e.message, 'error');
            }
        };

        ui.showModal('modal-edit-user-perms');
    },

    async openInviteTokenModal() {
        // Reset states
        document.getElementById('git-setup-state').style.display = 'block';
        document.getElementById('git-result-state').style.display = 'none';
        document.getElementById('git-footer-setup').style.display = 'flex';
        document.getElementById('git-footer-result').style.display = 'none';

        try {
            // Load available ranks
            const ranks = await api.req('/ranks');
            const ranksContainer = document.getElementById('git-ranks-list');
            ranksContainer.innerHTML = '';
            
            ranks.forEach(r => {
                const item = document.createElement('div');
                item.className = 'rank-select-item';
                item.textContent = r.name;
                item.style.borderColor = r.color + '44';
                item.style.color = r.color;
                item.onclick = () => {
                    item.classList.toggle('selected');
                };
                item.dataset.id = r.id;
                ranksContainer.appendChild(item);
            });

            // Confirm button
            document.getElementById('btn-git-confirm').onclick = async () => {
                const selectedRanks = [...ranksContainer.querySelectorAll('.rank-select-item.selected')].map(i => Number(i.dataset.id));
                const selectedPerms = [];
                
                try {
                    const res = await api.req('/users/generate-token', {
                        method: 'POST',
                        body: JSON.stringify({ permissions: selectedPerms, ranks: selectedRanks })
                    });
                    
                    // Show result state
                    document.getElementById('git-token-display').textContent = res.token;
                    document.getElementById('git-setup-state').style.display = 'none';
                    document.getElementById('git-result-state').style.display = 'block';
                    document.getElementById('git-footer-setup').style.display = 'none';
                    document.getElementById('git-footer-result').style.display = 'flex';
                    
                    // Set copy listener
                    document.getElementById('btn-git-copy').onclick = () => {
                        navigator.clipboard.writeText(res.token);
                        ui.toast('Token copied to clipboard', 'success');
                    };
                } catch (e) {
                    ui.toast(e.message, 'error');
                }
            };

            ui.showModal('modal-generate-token');
        } catch (e) {
            ui.toast(e.message, 'error');
        }
    },

    async clearAllTokens() {
        if (!(await ui.confirm('Are you sure you want to clear ALL invite tokens? This will invalidate any existing registration tokens.', 'Clear All Tokens'))) return;
        try {
            await api.req('/users/tokens/clear-all', { method: 'DELETE' });
            ui.toast('All invite tokens cleared', 'success');
        } catch (e) {
            ui.toast(e.message, 'error');
        }
    }
};

document.getElementById('btn-create-user')?.addEventListener('click', () => {
    document.getElementById('cu-username').value = '';
    document.getElementById('cu-password').value = '';
    ui.showModal('modal-create-user');
});
document.getElementById('modal-create-user-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-create-user-cancel')?.addEventListener('click', () => ui.closeModals());
document.getElementById('btn-user-confirm')?.addEventListener('click', async () => {
    const u = document.getElementById('cu-username').value, p = document.getElementById('cu-password').value;
    if (!u || !p) return ui.toast('Username and password required', 'error');
    try {
        await api.req('/users/create', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
        ui.closeModals(); globalUsers.load(); ui.toast('User created successfully', 'success');
    } catch (e) { ui.toast(e.message, 'error'); }
});

// Invite & clear tokens listeners
document.getElementById('btn-invite-token')?.addEventListener('click', () => globalUsers.openInviteTokenModal());
document.getElementById('btn-clear-tokens')?.addEventListener('click', () => globalUsers.clearAllTokens());
document.getElementById('modal-generate-token-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-generate-token-cancel')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-generate-token-done')?.addEventListener('click', () => ui.closeModals());

// Close buttons & cancel buttons for self/admin modals
document.getElementById('modal-cns-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-cns-cancel')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-cps-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-cps-cancel')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-cna-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-cna-cancel')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-rpa-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-rpa-cancel')?.addEventListener('click', () => ui.closeModals());

// Confirm action buttons
document.getElementById('btn-cns-confirm')?.addEventListener('click', async () => {
    const currentName = document.getElementById('cns-current').value;
    const newName = document.getElementById('cns-new').value;
    const confirmNewName = document.getElementById('cns-confirm').value;
    
    if (!currentName || !newName || !confirmNewName) {
        return ui.toast('All fields are required', 'error');
    }
    try {
        await api.req('/users/change-name', {
            method: 'POST',
            body: JSON.stringify({ currentName, newName, confirmNewName })
        });
        ui.closeModals();
        state.user = newName;
        localStorage.setItem('mp_user', newName);
        globalUsers.load();
        ui.toast('Username updated successfully', 'success');
    } catch (e) {
        ui.toast(e.message, 'error');
    }
});

document.getElementById('btn-cps-confirm')?.addEventListener('click', async () => {
    const oldPassword = document.getElementById('cps-current').value;
    const newPassword = document.getElementById('cps-new').value;
    const newPasswordConfirm = document.getElementById('cps-confirm').value;

    if (!oldPassword || !newPassword || !newPasswordConfirm) {
        return ui.toast('All fields are required', 'error');
    }
    try {
        await api.req('/users/change-password', {
            method: 'POST',
            body: JSON.stringify({ oldPassword, newPassword, newPasswordConfirm })
        });
        ui.closeModals();
        ui.toast('Password updated successfully', 'success');
    } catch (e) {
        ui.toast(e.message, 'error');
    }
});

document.getElementById('btn-cna-confirm')?.addEventListener('click', async () => {
    const id = document.getElementById('cna-userid').value;
    const newName = document.getElementById('cna-new').value;
    const confirmNewName = document.getElementById('cna-confirm').value;

    if (!newName || !confirmNewName) {
        return ui.toast('All fields are required', 'error');
    }
    try {
        await api.req(`/users/${id}/change-name`, {
            method: 'POST',
            body: JSON.stringify({ newName, confirmNewName })
        });
        ui.closeModals();
        if (Number(id) === Number(state.userId)) {
            state.user = newName;
            localStorage.setItem('mp_user', newName);
        }
        globalUsers.load();
        ui.toast('Username updated successfully', 'success');
    } catch (e) {
        ui.toast(e.message, 'error');
    }
});

document.getElementById('btn-rpa-confirm')?.addEventListener('click', async () => {
    const id = document.getElementById('rpa-userid').value;
    const newPassword = document.getElementById('rpa-new').value;
    const confirmPassword = document.getElementById('rpa-confirm').value;

    if (!newPassword || !confirmPassword) {
        return ui.toast('All fields are required', 'error');
    }
    try {
        await api.req(`/users/${id}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({ newPassword, confirmPassword })
        });
        ui.closeModals();
        ui.toast('Password reset successfully', 'success');
    } catch (e) {
        ui.toast(e.message, 'error');
    }
});

// Global Ranks Management
const globalRanks = {
    currentEditId: null,
    async load() {
        const grid = document.getElementById('ranks-grid');
        grid.innerHTML = '<p class="text-muted">Loading ranks...</p>';
        try {
            const data = await api.req('/ranks');
            grid.innerHTML = '';
            data.forEach(r => {
                const el = document.createElement('div');
                el.className = 'rank-card';
                el.style.borderTopColor = r.color;
                
                const deleteBtn = r.is_builtin ? '' : `<button class="btn danger small" data-del-rank="${r.id}">Delete</button>`;
                
                // Calculate permissions counts
                const globalCount = r.global_permissions.length;
                let serverCount = 0;
                Object.values(r.permissions).forEach(arr => {
                    if (Array.isArray(arr)) serverCount += arr.length;
                });
                
                const totalCount = globalCount + serverCount;
                const permCount = `${globalCount} global, ${serverCount} server perms`;
                
                const allGlobalLabel = r.global_permissions.includes('*') || r.global_permissions.includes('root') ? 'ALL' : r.global_permissions.join(', ');
                const permsLabel = `Global: ${allGlobalLabel || 'None'}`;

                el.innerHTML = `
                    <h3>
                        <span style="color:${r.color}">${r.name}</span>
                        ${r.is_builtin ? '<span class="status-badge" style="font-size:0.6rem;padding:0.1rem 0.4rem">Built-in</span>' : ''}
                    </h3>
                    <div class="rank-card-perms" title="${permsLabel}"><strong>Scope:</strong> ${permCount}<br><span style="font-size:0.7rem;opacity:0.8">${permsLabel}</span></div>
                    <div class="rank-card-actions">
                        <button class="btn outline small" data-edit-rank="${r.id}">Edit</button>
                        ${deleteBtn}
                    </div>
                `;
                
                el.querySelector('[data-edit-rank]').onclick = () => this.editRank(r);
                if (!r.is_builtin) {
                    el.querySelector('[data-del-rank]').onclick = async () => {
                        if (!(await ui.confirm(`Delete rank ${r.name}?`, 'Delete Rank'))) return;
                        try {
                            await api.req(`/ranks/${r.id}/delete`, { method: 'POST' });
                            globalRanks.load(); ui.toast('Rank deleted', 'success');
                        } catch (e) { ui.toast(e.message, 'error'); }
                    };
                }
                grid.appendChild(el);
            });
        } catch (e) { ui.toast(e.message, 'error'); }
    },
    async editRank(rank) {
        this.currentEditId = rank.id;
        document.getElementById('rank-editor-title').textContent = `Edit Rank "” ${rank.name}`;
        document.getElementById('re-name').value = rank.name;
        document.getElementById('re-color').value = rank.color;
        
        // Block editing builtin names
        document.getElementById('re-name').disabled = !!rank.is_builtin;

        // Load permissions
        const allPerms = await api.req('/users/permissions');

        let rankGlobal = rank.global_permissions || [];
        let rankServers = rank.permissions || {};

        // Render Rank Permissions Matrix
        const renderRankMatrix = () => {
            // Headers
            const headerRow = document.getElementById('re-matrix-header');
            headerRow.innerHTML = '<th>Permission</th><th>Global</th>';
            state.servers.forEach(s => {
                headerRow.innerHTML += `<th>${s.name}</th>`;
            });

            // Body
            const body = document.getElementById('re-matrix-body');
            body.innerHTML = '';

            let lastGroup = '';
            allPerms.forEach(p => {
                if (p.group !== lastGroup) {
                    lastGroup = p.group;
                    const hRow = document.createElement('tr');
                    hRow.className = 'matrix-group-row';
                    hRow.innerHTML = `<td colspan="${state.servers.length + 2}">${p.group}</td>`;
                    body.appendChild(hRow);
                }

                const tr = document.createElement('tr');
                
                // Permission cell
                const nameCell = document.createElement('td');
                nameCell.innerHTML = `
                    <div style="font-weight:600">${p.label}</div>
                    <div class="text-mono text-muted" style="font-size:0.7rem">${p.key}</div>
                `;
                tr.appendChild(nameCell);

                // Global checkbox Cell
                const isGlobalChecked = rankGlobal.includes(p.key);
                const globalTd = document.createElement('td');
                globalTd.setAttribute('data-label', 'Global');
                globalTd.appendChild(createMatrixCheckbox('global', p.key, isGlobalChecked, false, (checked) => {
                    if (checked) {
                        if (!rankGlobal.includes(p.key)) rankGlobal.push(p.key);
                    } else {
                        rankGlobal = rankGlobal.filter(k => k !== p.key);
                    }
                    renderRankMatrix();
                }));
                tr.appendChild(globalTd);

                // Server checkbox Cells
                state.servers.forEach(s => {
                    const td = document.createElement('td');
                    td.setAttribute('data-label', s.name);
                    if (p.globalOnly || p.key === 'account.manage' || p.key === 'panel.settings') {
                        td.innerHTML = '<span class="text-muted" style="font-size:0.8rem;opacity:0.3">"”</span>';
                    } else {
                        const isServerChecked = rankServers[s.id] && rankServers[s.id].includes(p.key);
                        td.appendChild(createMatrixCheckbox(s.id, p.key, isServerChecked, false, (checked) => {
                            if (!rankServers[s.id]) rankServers[s.id] = [];
                            if (checked) {
                                if (!rankServers[s.id].includes(p.key)) rankServers[s.id].push(p.key);
                            } else {
                                rankServers[s.id] = rankServers[s.id].filter(k => k !== p.key);
                            }
                            renderRankMatrix();
                        }));
                    }
                    tr.appendChild(td);
                });

                body.appendChild(tr);
            });
        };

        renderRankMatrix();

        // Update btn-rank-save onclick handler for update mode
        document.getElementById('btn-rank-save').onclick = async () => {
            const name = document.getElementById('re-name').value;
            const color = document.getElementById('re-color').value;
            if (!name) return ui.toast('Rank name required', 'error');

            try {
                const payload = { color, global: rankGlobal, servers: rankServers };
                if (!document.getElementById('re-name').disabled) payload.name = name;

                await api.req(`/ranks/${rank.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(payload)
                });
                ui.closeModals();
                ui.toast('Rank updated successfully', 'success');
                globalRanks.load();
            } catch (e) {
                ui.toast(e.message, 'error');
            }
        };

        ui.showModal('modal-rank-editor');
    },
    async createRank() {
        this.currentEditId = null;
        document.getElementById('rank-editor-title').textContent = 'Create Custom Rank';
        document.getElementById('re-name').value = '';
        document.getElementById('re-name').disabled = false;
        document.getElementById('re-color').value = '#3b82f6';
        
        const allPerms = await api.req('/users/permissions');
        let rankGlobal = [];
        let rankServers = {};

        const renderRankMatrix = () => {
            const headerRow = document.getElementById('re-matrix-header');
            headerRow.innerHTML = '<th>Permission</th><th>Global</th>';
            state.servers.forEach(s => {
                headerRow.innerHTML += `<th>${s.name}</th>`;
            });

            const body = document.getElementById('re-matrix-body');
            body.innerHTML = '';

            let lastGroup = '';
            allPerms.forEach(p => {
                if (p.group !== lastGroup) {
                    lastGroup = p.group;
                    const hRow = document.createElement('tr');
                    hRow.className = 'matrix-group-row';
                    hRow.innerHTML = `<td colspan="${state.servers.length + 2}">${p.group}</td>`;
                    body.appendChild(hRow);
                }

                const tr = document.createElement('tr');
                
                const nameCell = document.createElement('td');
                nameCell.innerHTML = `
                    <div style="font-weight:600">${p.label}</div>
                    <div class="text-mono text-muted" style="font-size:0.7rem">${p.key}</div>
                `;
                tr.appendChild(nameCell);

                const globalTd = document.createElement('td');
                globalTd.setAttribute('data-label', 'Global');
                globalTd.appendChild(createMatrixCheckbox('global', p.key, false, false, (checked) => {
                    if (checked) {
                        if (!rankGlobal.includes(p.key)) rankGlobal.push(p.key);
                    } else {
                        rankGlobal = rankGlobal.filter(k => k !== p.key);
                    }
                    renderRankMatrix();
                }));
                tr.appendChild(globalTd);

                state.servers.forEach(s => {
                    const td = document.createElement('td');
                    td.setAttribute('data-label', s.name);
                    if (p.globalOnly || p.key === 'account.manage' || p.key === 'panel.settings') {
                        td.innerHTML = '<span class="text-muted" style="font-size:0.8rem;opacity:0.3">"”</span>';
                    } else {
                        td.appendChild(createMatrixCheckbox(s.id, p.key, false, false, (checked) => {
                            if (!rankServers[s.id]) rankServers[s.id] = [];
                            if (checked) {
                                if (!rankServers[s.id].includes(p.key)) rankServers[s.id].push(p.key);
                            } else {
                                rankServers[s.id] = rankServers[s.id].filter(k => k !== p.key);
                            }
                            renderRankMatrix();
                        }));
                    }
                    tr.appendChild(td);
                });

                body.appendChild(tr);
            });
        };

        renderRankMatrix();

        document.getElementById('btn-rank-save').onclick = async () => {
            const name = document.getElementById('re-name').value;
            const color = document.getElementById('re-color').value;
            if (!name) return ui.toast('Rank name required', 'error');

            try {
                // First create rank
                const res = await api.req('/ranks/create', {
                    method: 'POST',
                    body: JSON.stringify({ name, color })
                });

                // Then immediately update it with the permissions matrix we checked
                await api.req(`/ranks/${res.rankId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name, color, global: rankGlobal, servers: rankServers })
                });

                ui.closeModals();
                ui.toast('Rank created successfully', 'success');
                globalRanks.load();
            } catch (e) {
                ui.toast(e.message, 'error');
            }
        };

        ui.showModal('modal-rank-editor');
    }
};

document.getElementById('btn-create-rank')?.addEventListener('click', () => globalRanks.createRank());
document.getElementById('modal-rank-editor-close')?.addEventListener('click', () => ui.closeModals());
document.getElementById('modal-rank-editor-cancel')?.addEventListener('click', () => ui.closeModals());

document.getElementById('btn-rank-save')?.addEventListener('click', async () => {
    const name = document.getElementById('re-name').value;
    const color = document.getElementById('re-color').value;
    const permissions = [...document.getElementById('re-permissions-grid').querySelectorAll('input[type="checkbox"]:checked')].map(i => i.value);
    
    if (!name) return ui.toast('Rank name required', 'error');

    try {
        if (globalRanks.currentEditId) {
            // Update
            const payload = { permissions, color };
            if (!document.getElementById('re-name').disabled) payload.name = name;
            await api.req(`/ranks/${globalRanks.currentEditId}/update`, { method: 'POST', body: JSON.stringify(payload) });
            ui.toast('Rank updated', 'success');
        } else {
            // Create
            await api.req('/ranks/create', { method: 'POST', body: JSON.stringify({ name, permissions, color }) });
            ui.toast('Rank created successfully', 'success');
        }
        ui.closeModals();
        globalRanks.load();
    } catch (e) { ui.toast(e.message, 'error'); }
});

// Panel Settings Controller
const panelSettings = {
    async load() {
        try {
            const s = await api.req('/system/settings');
            document.getElementById('ps-login-cooldown').value = s.loginCooldown;
            document.getElementById('ps-login-attempts').value = s.maxAttempts;
            document.getElementById('ps-rate-limit').value = s.rateLimit;
            document.getElementById('ps-ftp-port').value = s.ftpPort;
            document.getElementById('ps-ftp-enabled').checked = !!s.ftpEnabled;
            document.getElementById('ps-default-ram').value = s.defaultRam;
            document.getElementById('ps-default-port').value = s.defaultPort;
            document.getElementById('ps-max-ram').value = s.maxRam;
        } catch (e) {
            ui.toast('Failed to load settings: ' + e.message, 'error');
        }
    },
    async save() {
        const payload = {
            loginCooldown: +document.getElementById('ps-login-cooldown').value,
            maxAttempts: +document.getElementById('ps-login-attempts').value,
            rateLimit: +document.getElementById('ps-rate-limit').value,
            ftpPort: +document.getElementById('ps-ftp-port').value,
            ftpEnabled: document.getElementById('ps-ftp-enabled').checked,
            defaultRam: +document.getElementById('ps-default-ram').value,
            defaultPort: +document.getElementById('ps-default-port').value,
            maxRam: +document.getElementById('ps-max-ram').value
        };
        try {
            const r = await api.req('/system/settings', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            ui.toast(r.message, 'success');
        } catch (e) {
            ui.toast('Failed to save settings: ' + e.message, 'error');
        }
    }
};

document.getElementById('btn-save-panel-settings')?.addEventListener('click', () => panelSettings.save());


// ── Docs Controller ───────────────────────────────────────────────────────────
const docs = {
    currentTab: 'getting-started',

    load() {
        document.querySelectorAll('#docs-tabs .sub-nav-item').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('#docs-tabs .sub-nav-item').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                docs.currentTab = btn.dataset.tab;
                docs.render(btn.dataset.tab);
            };
        });
        document.getElementById('btn-back-from-docs')?.addEventListener('click', () => {
            document.getElementById('sidebar-super-important-docs-btn')?.classList.remove('active');
            ui.showView('view-server-list');
            server.loadList();
        });
        docs.render(docs.currentTab);
    },

    render(tab) {
        const container = document.getElementById('docs-content');
        if (!container) return;
        const map = {
            'getting-started':   docs._gettingStarted(),
            'server-management': docs._serverManagement(),
            'users-permissions': docs._usersPermissions(),
            'ranks':             docs._ranks(),
            'panel-settings':    docs._panelSettings(),
            'advanced-features': docs._advanced(),
            'discord-bot':       docs._discordBot(),
        };
        container.innerHTML = map[tab] || '';
    },

    // ── Primitives ──────────────────────────────────────────────────────────
    _c(body) {
        return `<code style="font-family:var(--font-mono);font-size:0.8rem;background:var(--bg-input);padding:0.1rem 0.45rem;border-radius:4px;border:1px solid var(--border)">${body}</code>`;
    },
    _pre(body) {
        return `<pre style="font-family:var(--font-mono);font-size:0.8rem;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius);padding:0.85rem 1rem;overflow-x:auto;line-height:1.6;margin:0.75rem 0">${body}</pre>`;
    },
    _note(text, type = 'info') {
        const map = { info: ['var(--accent)', '◆'], warning: ['#f59e0b', '▲'], danger: ['#ef4444', '✕'] };
        const [color, icon] = map[type] || map.info;
        return `<div style="display:flex;gap:0.65rem;padding:0.7rem 1rem;background:${color}0f;border-left:2px solid ${color};border-radius:0 var(--radius) var(--radius) 0;margin:0.85rem 0;font-size:0.85rem;line-height:1.55;color:var(--text-secondary)"><span style="color:${color};flex-shrink:0;margin-top:0.05rem">${icon}</span><span>${text}</span></div>`;
    },
    _table(cols, rows) {
        const th = cols.map(c => `<th style="text-align:left;padding:0.5rem 0.85rem;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);border-bottom:1px solid var(--border)">${c}</th>`).join('');
        const tr = rows.map(r => `<tr style="border-bottom:1px solid var(--border)">${r.map(cell => `<td style="padding:0.5rem 0.85rem;font-size:0.85rem;vertical-align:top;line-height:1.5">${cell}</td>`).join('')}</tr>`).join('');
        return `<div style="overflow-x:auto;margin:0.75rem 0"><table style="width:100%;border-collapse:collapse;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
    },
    _card(title, body) {
        return `<div class="card" style="margin-bottom:1.25rem"><h3 style="font-size:0.95rem;font-weight:700;margin-bottom:1rem;letter-spacing:-0.01em">${title}</h3>${body}</div>`;
    },
    _h(text) {
        return `<h4 style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--text-muted);margin:1.25rem 0 0.5rem">${text}</h4>`;
    },
    _p(text) {
        return `<p style="font-size:0.875rem;line-height:1.65;color:var(--text-secondary);margin-bottom:0.5rem">${text}</p>`;
    },
    _grid(items) {
        return `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1.25rem;margin-bottom:0.25rem">${items.join('')}</div>`;
    },

    // ── Tabs ────────────────────────────────────────────────────────────────
    _gettingStarted() {
        const c = docs._c, pre = docs._pre, note = docs._note, table = docs._table, card = docs._card, h = docs._h, p = docs._p, grid = docs._grid;
        return `
        ${grid([
            card('Overview', `
                ${p('MinePanel is a <strong>self-hosted</strong> Node.js control panel for Minecraft servers. It runs an Express API with a WebSocket layer and a single-page frontend — no external services, no Docker required.')}
                ${p('Stack: <strong>Node.js + Express + SQLite + WebSocket</strong>. The entire panel is a single process.')}
                ${h('Supported server software')}
                ${p('Paper, Purpur, Vanilla, Fabric, Quilt, Forge (auto-installer), Magma. Any JAR-based server also works via <strong>Import</strong>.')}
                ${h('Requirements')}
                ${table(['',''], [
                    ['Node.js', '≥ 18.x'],
                    ['Java', 'In PATH, or per-server custom path'],
                    ['OS', 'Windows, Linux, macOS'],
                    ['Ports', 'Web UI (default 8082) + game server ports'],
                ])}
            `),
            card('Quick Start', `
                ${pre(`git clone https://github.com/youruser/minepanel\ncd minepanel\ncp .env.example .env        # edit PORT, SECRET_KEY, origins\nnpm install\nnode src/index.js`)}
                ${p(`On first run the panel creates ${c('data/minepanel.db')} and the default admin account is bootstrapped. The credentials are printed to stdout — copy them before anything else.`)}
                ${note(`Set a strong <strong>SECRET_KEY</strong> in .env before exposing the panel to the internet. It signs every JWT token.`)}
                ${h('Directory layout')}
                ${table(['Path','Purpose'], [
                    [c('src/'), 'Application source — server, routes, core modules'],
                    [c('src/public/'), 'Static frontend (HTML/CSS/JS, no build step)'],
                    [c('data/minepanel.db'), 'SQLite database — users, servers, permissions, settings'],
                    [c('servers/<name>/'), 'Working directory for each managed server'],
                    [c('cache/jars/'), 'Cached server JARs (re-used across installs)'],
                    [c('.env'), 'Runtime configuration — never commit this'],
                ])}
            `),
        ])}
        ${grid([
            card('Authentication', `
                ${p(`Auth is JWT-based. A token is issued on login and sent as ${c('Authorization: Bearer <token>')} on every subsequent API request. Tokens are also used for WebSocket auth (first message must be ${c('{"type":"auth","token":"<jwt>"}')}).`)}
                ${p(`Account registration is invite-only. An admin generates a one-time token (32-char hex) and shares it out-of-band. Tokens expire and are purged hourly.`)}
                ${note('There is no password-reset flow. If an admin loses access, the account password can be reset directly in the SQLite database using any SQLite client.')}
            `),
            card('Panel Layout', `
                ${h('Sidebar — SERVERS section')}
                ${p('Lists every server the current user has access to. Status dot updates live via WebSocket. Admins see all servers; non-admins see only those they have at least one permission on.')}
                ${h('Sidebar — GLOBAL section')}
                ${table(['Item','Who can see it'], [
                    ['Users', 'Everyone (self only for non-managers)'],
                    [`Ranks`, `Users with ${c('account.manage')}`],
                    [`Panel Settings`, `Admins and users with ${c('panel.settings')}`],
                    ['Docs', 'Everyone'],
                ])}
                ${h('Server dashboard tabs')}
                ${p('Overview · Console · Files · Plugins/Mods · Players · Properties · Backups · Logs · Settings · FTP')}
            `),
        ])}`;
    },

    _serverManagement() {
        const c = docs._c, pre = docs._pre, note = docs._note, table = docs._table, card = docs._card, h = docs._h, p = docs._p, grid = docs._grid;
        return `
        ${grid([
            card('Creating a Server', `
                ${p(`Admin-only. The panel resolves the JAR from upstream sources, downloads it to the local cache, copies it into ${c('servers/<sanitized-name>/server.jar')}, writes ${c('eula.txt=true')}, and inserts a DB record.`)}
                ${table(['Field','Constraint'], [
                    ['Name', 'Unique. Becomes the directory name (sanitized).'],
                    ['Software', 'Paper · Purpur · Vanilla · Fabric · Quilt · Forge · Magma'],
                    ['Version', 'Fetched from upstream version manifest'],
                    ['RAM (MB)', '512 – 16 384'],
                    ['Port', '1024 – 65 535, unique across all servers'],
                ])}
                ${note(`Forge triggers a separate installer run (${c('--installServer')}). The panel executes it in a child process, parses the resulting directory for both modern (1.17+) and legacy (≤1.16) layouts, and copies the correct JAR to ${c('server.jar')}. Check ${c('install.log')} in the server directory if it fails.`)}
            `),
            card('Lifecycle — Start / Stop / Restart / Kill', `
                ${table(['Action','Behaviour'], [
                    ['Start', `Spawns ${c('java -Xmx<ram>M -jar server.jar nogui')}. Forge uses the args extracted from ${c('run.bat')} / ${c('run.sh')} instead. Console history is cleared before launch.`],
                    ['Stop', `Writes ${c('/stop\\n')} to the process stdin. Waits up to 15 s for the process to exit.`],
                    ['Restart', 'Graceful stop (same 15 s window) immediately followed by a fresh start. Aborts and reports if the stop times out.'],
                    ['Kill', 'Sends SIGKILL to the exact PID tracked by the process manager. Console history is cleared.'],
                ])}
                ${note(`<strong>Lock</strong>: every lifecycle action acquires an exclusive per-server lock. Concurrent Start/Stop/Kill/Delete requests on the same server get HTTP 409.`, 'warning')}
            `),
        ])}
        ${grid([
            card('File Manager', `
                ${p(`Sandboxed to ${c('servers/<name>/')}. Every path is resolved with ${c('path.resolve')} and checked against the server root — path-traversal attempts return 403.`)}
                ${table(['Operation','Notes'], [
                    ['Browse / Download file', `Requires ${c('server.files.read')}`],
                    ['Download folder', `Server zips on-the-fly, responds with a signed one-time token URL. Token expires after 5 min.`],
                    ['Upload file', `Requires ${c('server.files.write')}. Max 100 MB per file via multipart.`],
                    ['Edit file (inline)', `Read + write. Files > 5 MB cannot be opened in the editor — download instead.`],
                    ['Delete', `Requires ${c('server.files.delete')}.`],
                    ['New file / folder', `Requires ${c('server.files.write')}.`],
                ])}
                ${note(`The editor uses CodeMirror 5 with syntax highlighting for .yml, .yaml, .properties, .json, .js, .sh, .bat, and plain text.`)}
            `),
            card('Import from ZIP', `
                ${p('Accepts an existing server export as a .zip archive. There is no size cap — the multipart parser streams directly to disk.')}
                ${table(['Field','Notes'], [
                    ['Archive', '.zip only'],
                    ['Executable Path', `Relative path of the JAR inside the archive, e.g. ${c('server.jar')}`],
                    ['Server Root Path', 'Prefix to strip before extracting. Leave empty if JAR is at archive root.'],
                    ['Port / RAM / Software / Version', 'Same constraints as normal server creation.'],
                ])}
                ${p(`After extraction the panel verifies the JAR exists, copies it as ${c('server.jar')} if needed, ensures ${c('eula.txt')} is set, and patches the port into ${c('server.properties')}.`)}
            `),
        ])}
        ${grid([
            card('Backups', `
                ${p(`Backups are stored as timestamped ZIPs inside ${c('servers/<name>/backups/')}.`)}
                ${table(['Type','Notes'], [
                    ['Manual', 'Triggered from the Backups tab.'],
                    ['Auto-backup', 'Enabled per-server with a configurable interval in hours. Runs on a timer.'],
                    ['Auto on switch', 'A rollback backup is always created before a software switch, before any files are touched.'],
                    ['Restore', 'Extracts the ZIP back into the server directory. Server must be offline.'],
                ])}
            `),
            card('Switch Software / Version', `
                ${p(`Both operations live under the server <strong>Settings</strong> tab and require ${c('server.properties.write')}. The server must be offline.`)}
                ${h('Change Version')}
                ${p(`Downloads the new JAR for the same software type and replaces ${c('server.jar')}. For Forge, re-runs the installer.`)}
                ${h('Switch Software')}
                ${p(`Two-phase: first a dry-run returns compatibility warnings, then a confirmed request executes. Automatic rollback backup is created first. Incompatible folders are renamed to ${c('.disabled')} suffixes, not deleted.`)}
            `),
        ])}
        ${grid([
            card('Plugins & Mods', `
                ${p(`Lists ${c('.jar')} files from ${c('plugins/')} or ${c('mods/')} depending on the server software.`)}
                ${table(['Action','Mechanism'], [
                    ['Disable', `Renames ${c('foo.jar')} → ${c('foo.jar.disabled')}. Harmless, easily reversible.`],
                    ['Enable', `Renames ${c('foo.jar.disabled')} → ${c('foo.jar')}.`],
                    ['Delete', 'Permanently removes the file.'],
                    ['Upload', 'Drops the file directly into the correct folder.'],
                ])}
                ${note('Modrinth integration lets you search and install plugins/mods directly from the Plugins/Mods tab.')}
            `),
            card('Player Management', `
                ${p(`Reads live player data from ${c('world/playerdata/')} NBT files, parsed entirely in-process (no RCON dependency).`)}
                ${p('The modal renders the full inventory grid — hotbar, main inventory, armor slots, off-hand, and ender chest. Hover any slot for an item tooltip.')}
                ${table(['Action','Permission'], [
                    ['View + inventory', `${c('server.players.read')}`],
                    ['Kick', `${c('server.players.kick')} — issues ${c('/kick <name>')} via stdin`],
                    ['Ban', `${c('server.players.ban')} — issues ${c('/ban <name>')}`],
                    ['OP / DeOP', `${c('server.players.op')} — issues ${c('/op')} or ${c('/deop')}`],
                ])}
            `),
        ])}`;
    },

    _usersPermissions() {
        const c = docs._c, note = docs._note, table = docs._table, card = docs._card, h = docs._h, p = docs._p, grid = docs._grid;
        return `
        ${grid([
            card('Roles', `
                ${p(`There are two built-in roles, stored in the ${c('users.role')} column.`)}
                ${table(['Role','Access'], [
                    [c('admin'), `Full access to everything. Implicit wildcard permission ${c('*')}. Cannot be restricted by individual permission entries.`],
                    [c('user'), 'Access is entirely determined by the permission system — the role alone grants nothing.'],
                ])}
                ${note('Admins can disable accounts without deleting them. Disabled users are rejected at login regardless of credentials.')}
            `),
            card('Permission Resolution', `
                ${p('Permissions are resolved in the following order. A user has a permission if <em>any</em> source grants it — there is no deny mechanic.')}
                ${table(['Priority','Source'], [
                    ['1', `Role is ${c('admin')} → wildcard ${c('*')}, skip all other checks`],
                    ['2', `User's own ${c('global_permissions')} JSON column`],
                    ['3', 'Global permissions from the assigned rank'],
                    ['4', 'Per-server permissions from the assigned rank for the current server'],
                    ['5', `Individual per-server entries in ${c('user_server_permissions')} table`],
                ])}
                ${note('The effective permission set is computed on every request — there is no cache. Rank edits take effect immediately for all users assigned that rank.')}
            `),
        ])}
        ${card('Full Permission Reference', `
            ${table(['Key','Group','Notes'], [
                [c('server.start'),           'Lifecycle', ''],
                [c('server.stop'),            'Lifecycle', ''],
                [c('server.restart'),         'Lifecycle', ''],
                [c('server.kill'),            'Lifecycle', 'Force-kill the OS process'],
                [c('server.console.read'),    'Console',   'Receive WebSocket console output'],
                [c('server.console.write'),   'Console',   'Send commands via WebSocket'],
                [c('server.files.read'),      'Files',     'List, read, download'],
                [c('server.files.write'),     'Files',     'Create, edit, upload'],
                [c('server.files.delete'),    'Files',     ''],
                [c('server.players.read'),    'Players',   'View player list + inventory modal'],
                [c('server.players.kick'),    'Players',   ''],
                [c('server.players.ban'),     'Players',   ''],
                [c('server.players.op'),      'Players',   'OP / DeOP'],
                [c('server.players.manage'),  'Players',   'All player commands via console'],
                [c('server.plugins.read'),    'Plugins',   'List plugins/mods'],
                [c('server.plugins.manage'),  'Plugins',   'Enable, disable, delete, upload'],
                [c('server.backups.read'),    'Backups',   'List + download'],
                [c('server.backups.create'),  'Backups',   'Manual + auto-backup config'],
                [c('server.backups.restore'), 'Backups',   ''],
                [c('server.backups.delete'),  'Backups',   ''],
                [c('server.properties.read'), 'Settings',  'View server.properties'],
                [c('server.properties.write'),'Settings',  'Edit properties, change version/software'],
                [c('server.logs.read'),       'Logs',      'View log files'],
                [c('server.ftp.access'),      'FTP',       'View FTP credentials'],
                [c('server.ftp.manage'),      'FTP',       'Configure and toggle FTP server'],
                [c('account.manage'),         'Global',    'Manage users, generate invite tokens'],
                [c('panel.settings'),         'Global',    'Edit panel-level settings'],
            ])}
        `)}
        ${grid([
            card('Invite Tokens', `
                ${p('Registration is closed by default. An admin generates a token (Users → Generate Token), optionally pre-assigns a rank, and shares the 32-char hex string out-of-band.')}
                ${p('The token is single-use. Expired tokens are reaped from the database every hour.')}
                ${note('Tokens are stored hashed. The plaintext is shown exactly once after generation — if you close the modal it cannot be recovered.')}
            `),
            card('Changing Passwords', `
                ${p("Users can change their own password from the Users view. Admins can reset any user's password. Passwords are hashed with bcrypt (10 rounds).")}
                ${p('If the admin account password is lost and no other admin exists, reset it directly:')}
                ${docs._pre(`node -e "\nconst bcrypt = require('bcryptjs');\nconst { dbRun } = require('./src/db/database');\nconst hash = bcrypt.hashSync('newpassword', 10);\ndbRun('UPDATE users SET password=? WHERE username=?', [hash, 'admin']);\n"`)}
            `),
        ])}`;
    },

    _ranks() {
        const c = docs._c, note = docs._note, table = docs._table, card = docs._card, h = docs._h, p = docs._p, grid = docs._grid;
        return `
        ${grid([
            card('What Ranks Are', `
                ${p('Ranks are reusable permission bundles. Instead of configuring each user individually, you create a rank once and assign it. Rank edits propagate instantly to all holders.')}
                ${p('A rank carries two permission bags:')}
                ${table(['Bag','Scope'], [
                    ['Global permissions', 'Apply regardless of which server is being accessed'],
                    ['Per-server permissions', `Map of ${c('serverId → permission[]')} — each server can have a different set`],
                ])}
                ${note('A user can hold exactly one rank at a time. Individual per-server permissions layer on top via the resolution chain described in Users & Permissions.')}
            `),
            card('Rank Editor', `
                ${p('The rank editor renders a <strong>permission matrix</strong>: rows are permission keys, columns are servers. Check a cell to grant that permission on that server.')}
                ${p(`Global permissions (${c('account.manage')}, ${c('panel.settings')}) have their own column and are independent of any specific server.`)}
                ${p('When a user has a permission via their rank, the corresponding checkbox in the user-level editor is rendered locked with a "Granted by Rank" tooltip — you cannot accidentally remove it from the user view.')}
                ${note('Ranks that are assigned to at least one user cannot be deleted without first unassigning them.', 'warning')}
            `),
        ])}`;
    },

    _panelSettings() {
        const c = docs._c, pre = docs._pre, note = docs._note, table = docs._table, card = docs._card, h = docs._h, p = docs._p, grid = docs._grid;
        return `
        ${grid([
            card('.env Reference', `
                ${table(['Variable','Default','Notes'], [
                    [c('PORT'), '8082', 'HTTP/HTTPS listen port'],
                    [c('SECRET_KEY'), '—', '<strong>Required.</strong> Signs JWT tokens. Use a long random string.'],
                    [c('JWT_EXPIRES_IN'), '24h', 'JWT token lifetime'],
                    [c('ALLOWED_ORIGINS'), c('*'), 'Comma-separated CORS whitelist. Set to your actual domain(s) in production.'],
                    [c('RATE_LIMIT'), '100', 'API requests/min per IP. Import endpoint is exempt.'],
                    [c('HTTPS'), c('false'), 'Enable TLS directly in Node. Use Nginx in production instead.'],
                    [c('HTTPS_KEY'), c('certs/key.pem'), 'Path to TLS private key'],
                    [c('HTTPS_CERT'), c('certs/cert.pem'), 'Path to TLS certificate'],
                ])}
                ${note('The panel reads .env once at startup via dotenv. Changes require a process restart.')}
            `),
            card('Runtime Settings (UI)', `
                ${p(`Global → Panel Settings writes to the ${c('settings')} table in SQLite — changes take effect immediately without a restart.`)}
                ${table(['Key','Notes'], [
                    ['Login cooldown', 'Seconds a user must wait after exceeding max login attempts'],
                    ['Max login attempts', 'Threshold before the cooldown kicks in'],
                    ['API rate limit', 'Overrides the .env value at runtime'],
                    ['FTP port', 'Port for the global FTP service (not per-server FTP)'],
                    ['FTP enabled', 'Toggle the FTP service on/off without restarting'],
                    ['Default server RAM', 'Pre-fills the RAM field on the Create Server form'],
                    ['Default server port', 'Pre-fills the port field'],
                    ['Max RAM per server', 'Upper bound enforced during server creation/edit'],
                ])}
            `),
        ])}
        ${grid([
            card('HTTPS Setup', `
                ${h('Self-signed (dev / LAN)')}
                ${pre(`mkdir certs\nopenssl req -x509 -newkey rsa:4096 \\\n  -keyout certs/key.pem -out certs/cert.pem \\\n  -days 365 -nodes -subj "/CN=localhost"`)}
                ${p(`Set ${c('HTTPS=true')} in .env. Browsers will warn about the self-signed cert.`)}
                ${h('Nginx reverse proxy (production)')}
                ${pre(`server {\n    listen 443 ssl;\n    server_name panel.example.com;\n    ssl_certificate     /etc/letsencrypt/.../fullchain.pem;\n    ssl_certificate_key /etc/letsencrypt/.../privkey.pem;\n\n    location / {\n        proxy_pass http://127.0.0.1:8082;\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";\n        proxy_set_header Host $host;\n        proxy_read_timeout 0;\n    }\n}`)}
                ${note(`${c('proxy_read_timeout 0')} is important — large server imports can take minutes to upload and extract.`, 'warning')}
            `),
            card('Running as a Service', `
                ${h('systemd (Linux)')}
                ${pre(`[Unit]\nDescription=MinePanel\nAfter=network.target\n\n[Service]\nType=simple\nUser=minepanel\nWorkingDirectory=/opt/minepanel\nExecStart=/usr/bin/node src/index.js\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target`)}
                ${h('PM2')}
                ${pre(`npm install -g pm2\npm2 start src/index.js --name minepanel\npm2 save && pm2 startup`)}
                ${note('The panel does not daemonize itself. Use a process supervisor so it restarts on crash and survives server reboots.')}
            `),
        ])}`;
    },

    _advanced() {
        const c = docs._c, pre = docs._pre, note = docs._note, table = docs._table, card = docs._card, h = docs._h, p = docs._p, grid = docs._grid;
        return `
        ${grid([
            card('WebSocket Protocol', `
                ${p(`One WebSocket connection per server tab at ${c('wss://<host>/ws?serverId=<id>')}. Authentication is handled in the first message frame — the connection is closed with a 4-series code if auth fails or times out after 5 s.`)}
                ${table(['Type','Direction','Payload'], [
                    [c('auth'),          'client → server', `${c('{"token":"<jwt>"}')}`],
                    [c('command'),       'client → server', `${c('{"data":"<cmd>"}')}`],
                    [c('history'),       'server → client', 'Array of buffered console lines on connect'],
                    [c('console'),       'server → client', 'Raw stdout/stderr chunk'],
                    [c('status'),        'server → client', `${c('"online" | "offline" | "starting"')}`],
                    [c('stats'),         'server → client', `${c('{cpu, ram}')} — sent every 2 s while authenticated`],
                    [c('clear_console'), 'server → client', 'Instructs client to flush the console view'],
                ])}
                ${note('Close codes: 4000 missing serverId · 4001 invalid token · 4002 auth timeout · 4003 forbidden · 4004 no auth message sent.')}
            `),
            card('Process Manager', `
                ${p(`${c('src/core/processManager.js')} is a singleton EventEmitter that owns every spawned Java process. It tracks PIDs, buffers the last N console lines per server, and emits ${c('console')}, ${c('status')}, and ${c('clear_console')} events consumed by WebSocket connections.`)}
                ${table(['Method','Notes'], [
                    [c('start(id, dir, …)'), 'Spawns the process, attaches stdout/stderr listeners'],
                    [c('gracefulStop(id, timeout)'), `Writes ${c('/stop\\n')}, resolves when process exits or timeout elapses`],
                    [c('kill(id)'), 'SIGKILL the tracked PID'],
                    [c('acquireLock(id)'), 'Returns false if already locked — caller should respond 409'],
                    [c('getHistory(id)'), 'Returns the in-memory console buffer (shown to new WS clients)'],
                ])}
            `),
        ])}
        ${grid([
            card('Per-Server FTP', `
                ${p(`Each server can run its own FTP service bound to a dedicated port. The FTP root is the server's working directory.`)}
                ${table(['Endpoint','Notes'], [
                    [c('GET  /api/servers/:id/ftp'), `Returns enabled state, port, username, running status. Requires ${c('server.ftp.access')}.`],
                    [c('POST /api/servers/:id/ftp/config'), `Set username, password, port. Requires ${c('server.ftp.manage')}.`],
                    [c('POST /api/servers/:id/ftp/toggle'), `Start or stop the FTP server. Requires ${c('server.ftp.manage')}.`],
                ])}
                ${note('If you change credentials while FTP is running, the service is automatically restarted to apply them.')}
            `),
            card('Database Schema (key tables)', `
                ${table(['Table','Purpose'], [
                    [c('users'), 'id, username, password (bcrypt), role, disabled, rank_id, global_permissions (JSON)'],
                    [c('servers'), 'id, uuid, name, software, version, ram_mb, port, owner_id, directory_name, java_path, ftp_* columns'],
                    [c('user_server_permissions'), 'user_id × server_id × permission — individual grants'],
                    [c('ranks'), 'id, name, color, permissions (JSON map serverId→perm[]), global_permissions (JSON)'],
                    [c('account_creation_tokens'), 'token (hashed), rank_id, expires_at'],
                    [c('settings'), 'key/value store for panel-level config and per-user accent colors'],
                ])}
                ${note(`SQLite WAL mode is not explicitly enabled — for high-concurrency deployments consider enabling it: ${c('PRAGMA journal_mode=WAL;')}`)}
            `),
        ])}
        ${grid([
            card('Version Fetching', `
                ${p(`${c('src/core/versionFetcher.js')} polls upstream manifests on startup and caches results to ${c('cache/versions.json')}.`)}
                ${table(['Software','Source'], [
                    ['Paper / Purpur', 'PaperMC API'],
                    ['Fabric', 'meta.fabricmc.net'],
                    ['Forge', 'files.minecraftforge.net'],
                    ['Quilt', 'meta.quiltmc.org'],
                    ['Vanilla', 'Mojang version manifest'],
                ])}
                ${note('If a version fetch fails (network outage, API change) the panel falls back to the cached list and logs a warning. It does not crash.')}
            `),
            card('Server Icon Pipeline', `
                ${p(`Icons are stored as ${c('server-icon.png')} in the server directory and served via ${c('GET /api/servers/:id/properties/icon')}.`)}
                ${p(`The Minecraft item picker renders items using a canvas pipeline. Selecting an item triggers: render → ${c('canvas.toBlob()')} → POST as multipart → saved as ${c('server-icon.png')}.`)}
                ${p(`Sidebar icons are fetched per-server on load and cached as blob URLs in a ${c('Map')} — no repeated requests until the icon changes.`)}
            `),
        ])}`;
    },

    _discordBot() {
        const c = docs._c, pre = docs._pre, note = docs._note, table = docs._table, card = docs._card, h = docs._h, p = docs._p, grid = docs._grid;
        return `
        ${grid([
            card('Overview & Features', `
                ${p('MinePanel features a multi-bot Discord integration that provides real-time server console streaming, live server status updates, and command execution directly from Discord channels.')}
                ${h('Key Features')}
                ${table(['Feature', 'Description'], [
                    ['Multi-Bot System', 'Register multiple bots in the panel, each managing specific game servers.'],
                    ['Dedicated Categories', `Each server gets a dedicated category with ${c('#console')}, ${c('#commands')}, and ${c('#status')} channels.`],
                    ['Customizable Names', 'Rename or move categories/channels on Discord; the bot tracks them by their ID.'],
                    ['Silent Logging', 'All bot messages (console, status, embeds) suppress push notifications and unread badges.'],
                    ['Console Auto-Clear', 'Automatically deletes messages in the console channel when the server starts, stops, or restarts.'],
                    ['Instant Commands', 'Executing commands forwards input instantly and deletes the user message immediately.'],
                    ['Self-Healing', 'Missing or deleted channels are auto-detected and recreated in the background.'],
                    ['Offline Cleanup', 'When a bot or server is unassigned or deleted, the panel cleans up channels/roles on Discord and leaves the guild.']
                ])}
            `),
            card('Slash Commands', `
                ${p('Authorized users can run the following slash commands within the dedicated Discord channels:')}
                ${table(['Command', 'Description'], [
                    [c('/status'), 'Sends a status panel with Start, Stop, Restart, and Refresh buttons.'],
                    [c('/console [live]'), 'Streams a live console interface inside any channel.'],
                    [c('/stats [live]'), 'Streams live CPU and RAM resource usage graphs.'],
                    [c('/players'), 'Lists online players.'],
                    [c('/logs'), 'Browses, filters, and paginates server log files.'],
                    [c('/execute <cmd>'), 'Runs a console command directly on the server.'],
                    [c('/start | /stop | /restart'), 'Controls the server state.'],
                    [c('/init [server]'), 'Manually initializes or recreates the channels and roles for a server.']
                ])}
                ${note(`Most commands (except ${c('/init')}) will only execute inside the server's dedicated channels to keep other guild channels clean.`)}
            `),
        ])}
        ${grid([
            card('Discord Developer Portal Setup', `
                ${h('1. Create the Application')}
                ${p(`Go to the <a href="https://discord.com/developers/applications" target="_blank" style="color:var(--accent);text-decoration:none;font-weight:600">Discord Developer Portal</a>, log in, click <strong>New Application</strong>, and name it.`)}
                
                ${h('2. Configure the Bot & Token')}
                ${p(`Go to the <strong>Bot</strong> tab in the sidebar, click <strong>Reset Token</strong>, and copy the token. You will need this token in the MinePanel interface.`)}
                
                ${h('3. Enable Gateway Intents (CRITICAL!)')}
                ${p(`Scroll down on the <strong>Bot</strong> page to <strong>Privileged Gateway Intents</strong>:`)}
                ${p(`• Enable <strong>Message Content Intent</strong> (Required for reading commands/chat in console).`)}
                ${p(`• Enable <strong>Guild Members Intent</strong> (Required for fetching members and matching roles).`)}
                ${note('If Message Content Intent is disabled, the bot will not respond to console inputs or commands!', 'danger')}
            `),
            card('Bot Invitation & Connection', `
                ${h('4. Generate Invite URL (OAuth2)')}
                ${p(`Go to <strong>OAuth2</strong> -> <strong>URL Generator</strong> in the sidebar:`)}
                ${p(`• Under <strong>Scopes</strong>, select: ${c('bot')} and ${c('applications.commands')} (required for slash commands to show up).`)}
                ${p(`• Under <strong>Bot Permissions</strong>, select: <strong>Administrator</strong> (recommended to manage roles, channels, and permissions automatically).`)}
                ${p(`Copy the URL at the bottom, open it in a browser, and authorize the bot for your Discord server.`)}
                
                ${h('5. Connect to MinePanel')}
                ${p(`In the MinePanel dashboard, go to <strong>Global</strong> -> <strong>Discord Bots</strong> (or a server\'s Discord settings) and click <strong>Add Bot</strong>:`)}
                ${p(`• Paste the <strong>Bot Token</strong> you copied.`)}
                ${p(`• Paste the <strong>Server ID (Guild ID)</strong>. (Right-click server icon in Discord and select <strong>Copy Server ID</strong> — requires Discord developer settings enabled).`)}
                ${p(`• Assign the game servers you want this bot to manage and click <strong>Save</strong>.`)}
            `),
        ])}`;
    }
};
// ── End Docs Controller ───────────────────────────────────────────────────────

// Wire up docs sidebar button
document.getElementById('sidebar-super-important-docs-btn')?.addEventListener('click', () => {
    document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
    document.getElementById('sidebar-super-important-docs-btn').classList.add('active');
    ui.showView('view-super-important-docs');
    docs.load();
});
