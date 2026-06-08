// src/public/js/thresholdLadder.js
// Threshold Management System - Frontend Component
// Implements the draggable "Threshold Ladder" visual editor for MinePanel.

'use strict';

// Constants

const ACTION_META = {
    log:      { color: '#6b7280', label: 'Log',      severity: 0 },
    notify:   { color: '#3b82f6', label: 'Notify',   severity: 1 },
    alert:    { color: '#f59e0b', label: 'Alert',    severity: 2 },
    throttle: { color: '#f97316', label: 'Throttle', severity: 3 },
    restart:  { color: '#a855f7', label: 'Restart',  severity: 4 },
    stop:     { color: '#ef4444', label: 'Stop',     severity: 5 },
};

const METRIC_META = {
    cpu_temperature: { label: 'CPU Temperature', unit: 'C', min: 0, max: 150, defaultMax: 110 },
    ram_percent:     { label: 'RAM Usage',        unit: '%',  min: 0, max: 100, defaultMax: 100 },
};

// ── ThresholdLadder class ─────────────────────────────────────────────────────

class ThresholdLadder {
    /**
     * @param {HTMLElement} container  - mounting element
     * @param {string}      metric     - 'cpu_temperature' | 'ram_percent'
     * @param {Object}      metricData - { enabled, thresholds: [...] }
     * @param {Function}    onChange   - called with updated metricData on any change
     */
    constructor(container, metric, metricData, onChange) {
        this.container  = container;
        this.metric     = metric;
        this.meta       = METRIC_META[metric];
        this.onChange   = onChange;
        this.dragging   = null;
        this.enabled    = !!metricData.enabled;
        this.thresholds = this._normalizeThresholds(metricData.thresholds || []);
        this._render();
    }

    _normalizeThresholds(raw) {
        return raw
            .map((t, i) => ({
                id:      t.id      || `thr_${i}_${Date.now()}`,
                value:   Number(t.value),
                action:  t.action  || 'alert',
                label:   t.label   || (ACTION_META[t.action]?.label || t.action),
                enabled: t.enabled !== false,
            }))
            .sort((a, b) => a.value - b.value);
    }

    _emit() {
        this.onChange({
            enabled:    this.enabled,
            thresholds: this.thresholds.map(t => ({ ...t })),
        });
    }

    // ── Validation ─────────────────────────────────────────────────────────

    _validate(thresholds) {
        const errors = [];
        const vals   = thresholds.map(t => t.value);

        // Duplicates
        const seen = new Set();
        vals.forEach(v => {
            if (seen.has(v)) errors.push(`Duplicate value ${v}${this.meta.unit}.`);
            seen.add(v);
        });

        // Range
        thresholds.forEach(t => {
            if (t.value < this.meta.min || t.value > this.meta.max) {
                errors.push(`Value ${t.value}${this.meta.unit} is outside allowed range (${this.meta.min}-${this.meta.max}${this.meta.unit}).`);
            }
        });

        // Severity ordering
        const sorted = [...thresholds].sort((a, b) => a.value - b.value);
        for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const curr = sorted[i];
            const ps = ACTION_META[prev.action]?.severity ?? 0;
            const cs = ACTION_META[curr.action]?.severity ?? 0;
            if (cs < ps) {
                errors.push(`"${curr.action}" at ${curr.value}${this.meta.unit} cannot come before "${prev.action}" at ${prev.value}${this.meta.unit} (lower severity).`);
            }
        }

        return errors;
    }

    // ── Rendering ──────────────────────────────────────────────────────────

    _render() {
        this.container.innerHTML = '';
        this.container.className = 'tl-root';

        // Header row: title + enable toggle
        const header = document.createElement('div');
        header.className = 'tl-header';
        header.innerHTML = `
            <div class="tl-header-left">
                <span class="tl-metric-label">${this.meta.label}</span>
                <span class="tl-metric-range">${this.meta.min}-${this.meta.defaultMax}${this.meta.unit}</span>
            </div>
            <label class="tl-toggle" title="${this.enabled ? 'Enabled' : 'Disabled'}">
                <span class="tl-toggle-label">${this.enabled ? 'Enabled' : 'Disabled'}</span>
                <span class="toggle-switch">
                    <input type="checkbox" class="tl-enabled-chk" ${this.enabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </span>
            </label>
        `;
        this.container.appendChild(header);

        header.querySelector('.tl-enabled-chk').addEventListener('change', (e) => {
            this.enabled = e.target.checked;
            this.container.classList.toggle('tl-disabled', !this.enabled);
            const toggle = header.querySelector('.tl-toggle');
            const label = header.querySelector('.tl-toggle-label');
            const stateText = this.enabled ? 'Enabled' : 'Disabled';
            if (toggle) toggle.title = stateText;
            if (label) label.textContent = stateText;
            this._emit();
        });

        if (!this.enabled) this.container.classList.add('tl-disabled');

        // Validation error banner
        const banner = document.createElement('div');
        banner.className = 'tl-error-banner';
        banner.style.display = 'none';
        this.container.appendChild(banner);
        this._errorBanner = banner;

        // Track bar
        this._renderTrack();

        // Threshold list
        this._renderList();

        // Add button
        const addRow = document.createElement('div');
        addRow.className = 'tl-add-row';
        addRow.innerHTML = `<button class="btn outline small tl-add-btn">+ Add Threshold</button>`;
        addRow.querySelector('.tl-add-btn').addEventListener('click', () => this._openAddModal());
        this.container.appendChild(addRow);
    }

    _renderTrack() {
        const trackWrap = document.createElement('div');
        trackWrap.className = 'tl-track-wrap';

        const min     = this.meta.min;
        const max     = this.meta.defaultMax;
        const range   = max - min;

        // Build gradient segments
        const sorted = [...this.thresholds].filter(t => t.enabled).sort((a, b) => a.value - b.value);
        const segments = [];
        let prev = min;

        for (const t of sorted) {
            const pct  = ((t.value - min) / range) * 100;
            const prevPct = ((prev - min) / range) * 100;
            const color = ACTION_META[t.action]?.color || '#6b7280';
            segments.push({ from: prevPct, to: pct, color });
            prev = t.value;
        }
        // Final segment from last threshold to max
        const lastPct = ((prev - min) / range) * 100;
        segments.push({ from: lastPct, to: 100, color: '#ef4444' });

        const gradientStops = segments.map(s =>
            `${s.color} ${s.from.toFixed(1)}%, ${s.color} ${s.to.toFixed(1)}%`
        ).join(', ');

        const track = document.createElement('div');
        track.className = 'tl-track';
        track.style.background = `linear-gradient(to right, ${gradientStops})`;

        // Min/Max labels
        const minLabel = document.createElement('span');
        minLabel.className = 'tl-track-label tl-track-label-min';
        minLabel.textContent = `${min}${this.meta.unit}`;

        const maxLabel = document.createElement('span');
        maxLabel.className = 'tl-track-label tl-track-label-max';
        maxLabel.textContent = `${max}${this.meta.unit}`;

        trackWrap.appendChild(minLabel);
        trackWrap.appendChild(track);
        trackWrap.appendChild(maxLabel);

        // Render draggable markers
        this.thresholds.forEach(thr => {
            if (!thr.enabled) return;
            const pct  = ((thr.value - min) / range) * 100;
            const meta = ACTION_META[thr.action] || ACTION_META.alert;

            const marker = document.createElement('div');
            marker.className = 'tl-marker';
            marker.style.left = `${Math.max(0, Math.min(100, pct))}%`;
            marker.style.setProperty('--marker-color', meta.color);
            marker.dataset.id = thr.id;
            marker.title = `${thr.label}: ${thr.value}${this.meta.unit}`;

            const tip = document.createElement('div');
            tip.className = 'tl-marker-tip';
            tip.textContent = `${thr.value}${this.meta.unit}`;
            marker.appendChild(tip);

            const dot = document.createElement('div');
            dot.className = 'tl-marker-dot';
            marker.appendChild(dot);

            // Drag logic
            marker.addEventListener('mousedown', (e) => this._startDrag(e, thr, marker, track));
            marker.addEventListener('touchstart', (e) => this._startDrag(e, thr, marker, track), { passive: false });

            track.appendChild(marker);
        });

        this.container.appendChild(trackWrap);
        this._track = track;
    }

    _startDrag(e, thr, markerEl, trackEl) {
        e.preventDefault();
        const meta  = this.meta;
        const min   = meta.min;
        const max   = meta.defaultMax;
        const range = max - min;

        const getClientX = ev => ev.touches ? ev.touches[0].clientX : ev.clientX;

        const onMove = (ev) => {
            const rect   = trackEl.getBoundingClientRect();
            const pct    = Math.max(0, Math.min(1, (getClientX(ev) - rect.left) / rect.width));
            const newVal = Math.round(min + pct * range);

            if (newVal === thr.value) return;

            // Check for collision with adjacent thresholds
            const sorted  = [...this.thresholds].sort((a, b) => a.value - b.value);
            const idx      = sorted.findIndex(t => t.id === thr.id);
            const minBound = idx > 0 ? sorted[idx - 1].value + 1 : min;
            const maxBound = idx < sorted.length - 1 ? sorted[idx + 1].value - 1 : max;
            const clamped  = Math.max(minBound, Math.min(maxBound, newVal));

            thr.value = clamped;
            markerEl.style.left = `${((clamped - min) / range) * 100}%`;
            markerEl.querySelector('.tl-marker-tip').textContent = `${clamped}${meta.unit}`;
            markerEl.title = `${thr.label}: ${clamped}${meta.unit}`;

            this._showErrors(this._validate(this.thresholds));
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onUp);
            this._updateTrackGradient();
            this._refreshList();
            this._emit();
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
    }

    _updateTrackGradient() {
        if (!this._track) return;
        const min   = this.meta.min;
        const max   = this.meta.defaultMax;
        const range = max - min;
        const sorted = [...this.thresholds].filter(t => t.enabled).sort((a, b) => a.value - b.value);
        const segments = [];
        let prev = min;

        for (const t of sorted) {
            const pct     = ((t.value - min) / range) * 100;
            const prevPct = ((prev - min) / range) * 100;
            const color   = ACTION_META[t.action]?.color || '#6b7280';
            segments.push({ from: prevPct, to: pct, color });
            prev = t.value;
        }
        const lastPct = ((prev - min) / range) * 100;
        segments.push({ from: lastPct, to: 100, color: '#ef4444' });

        const gradientStops = segments.map(s =>
            `${s.color} ${s.from.toFixed(1)}%, ${s.color} ${s.to.toFixed(1)}%`
        ).join(', ');
        this._track.style.background = `linear-gradient(to right, ${gradientStops})`;
    }

    _renderList() {
        if (this._listEl) this._listEl.remove();

        const list = document.createElement('div');
        list.className = 'tl-list';
        this._listEl = list;

        if (this.thresholds.length === 0) {
            list.innerHTML = '<p class="tl-empty">No thresholds configured. Click "+ Add Threshold" to create one.</p>';
        } else {
            const sorted = [...this.thresholds].sort((a, b) => a.value - b.value);
            sorted.forEach((thr) => {
                list.appendChild(this._buildListItem(thr));
            });
        }

        // Insert before add-row
        const addRow = this.container.querySelector('.tl-add-row');
        if (addRow) this.container.insertBefore(list, addRow);
        else this.container.appendChild(list);
    }

    _refreshList() {
        if (this._listEl) {
            const sorted = [...this.thresholds].sort((a, b) => a.value - b.value);
            const items = this._listEl.querySelectorAll('.tl-list-item');
            items.forEach((item, i) => {
                const thr = sorted[i];
                if (!thr) return;
                item.querySelector('.tl-item-value').textContent = `${thr.value}${this.meta.unit}`;
            });
        }
    }

    _buildListItem(thr) {
        const meta = ACTION_META[thr.action] || ACTION_META.alert;
        const item = document.createElement('div');
        item.className = `tl-list-item${thr.enabled ? '' : ' tl-item-disabled'}`;
        item.dataset.id = thr.id;

        item.innerHTML = `
            <div class="tl-item-indicator" style="background:${meta.color}"></div>
            <div class="tl-item-body">
                <span class="tl-item-value">${thr.value}${this.meta.unit}</span>
                <span class="tl-item-arrow">-&gt;</span>
                <span class="tl-item-action" style="color:${meta.color}">${meta.label}</span>
                <span class="tl-item-label text-muted">${thr.label}</span>
            </div>
            <div class="tl-item-actions">
                <label class="toggle-switch tl-item-toggle" title="${thr.enabled ? 'Enabled' : 'Disabled'}">
                    <input type="checkbox" class="tl-item-chk" ${thr.enabled ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
                <button class="icon-btn tl-item-edit" title="Edit" aria-label="Edit threshold">
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button class="icon-btn danger tl-item-del" title="Delete" aria-label="Delete threshold">
                    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" fill="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                </button>
            </div>
        `;

        item.querySelector('.tl-item-chk').addEventListener('change', (e) => {
            thr.enabled = e.target.checked;
            item.classList.toggle('tl-item-disabled', !thr.enabled);
            this._updateTrackGradient();
            this._emit();
        });

        item.querySelector('.tl-item-edit').addEventListener('click', () => this._openEditModal(thr));
        item.querySelector('.tl-item-del').addEventListener('click', () => this._deleteThreshold(thr.id));

        return item;
    }

    // ── Modals ─────────────────────────────────────────────────────────────

    _openAddModal() {
        const mid = this.meta.min;
        const max = this.meta.defaultMax;
        const suggestedValue = Math.round((mid + max) / 2);

        this._openModal({
            title: `Add Threshold - ${this.meta.label}`,
            value: suggestedValue,
            action: 'alert',
            label: '',
            onConfirm: (data) => {
                const newThr = {
                    id:      `thr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    value:   data.value,
                    action:  data.action,
                    label:   data.label || (ACTION_META[data.action]?.label || data.action),
                    enabled: true,
                };
                const proposed = [...this.thresholds, newThr];
                const errors = this._validate(proposed);
                if (errors.length > 0) {
                    this._showErrors(errors);
                    return false; // keep modal open
                }
                this.thresholds.push(newThr);
                this.thresholds.sort((a, b) => a.value - b.value);
                this._rerenderAll();
                this._emit();
                return true;
            },
        });
    }

    _openEditModal(thr) {
        this._openModal({
            title: `Edit Threshold - ${thr.value}${this.meta.unit}`,
            value: thr.value,
            action: thr.action,
            label: thr.label,
            onConfirm: (data) => {
                const proposed = this.thresholds.map(t =>
                    t.id === thr.id ? { ...t, ...data } : t
                );
                const errors = this._validate(proposed);
                if (errors.length > 0) {
                    this._showErrors(errors);
                    return false;
                }
                Object.assign(thr, data);
                if (!thr.label) thr.label = ACTION_META[thr.action]?.label || thr.action;
                this.thresholds.sort((a, b) => a.value - b.value);
                this._rerenderAll();
                this._emit();
                return true;
            },
        });
    }

    _openModal({ title, value, action, label, onConfirm }) {
        // Remove any existing modal
        document.getElementById('tl-modal-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'tl-modal-overlay';
        overlay.className = 'tl-modal-overlay';

        const actionOptions = Object.entries(ACTION_META)
            .map(([k, v]) => `<option value="${k}" ${k === action ? 'selected' : ''}>${v.label}</option>`)
            .join('');

        overlay.innerHTML = `
            <div class="tl-modal">
                <div class="tl-modal-header">
                    <span class="tl-modal-title">${title}</span>
                    <button class="tl-modal-close btn outline small">✕</button>
                </div>
                <div class="tl-modal-body">
                    <div class="tl-modal-field">
                        <label class="tl-modal-label">Value (${this.meta.min}-${this.meta.max}${this.meta.unit})</label>
                        <input class="input tl-modal-value" type="number" 
                               min="${this.meta.min}" max="${this.meta.max}" 
                               value="${value}" step="1">
                    </div>
                    <div class="tl-modal-field">
                        <label class="tl-modal-label">Action</label>
                        <select class="input tl-modal-action">${actionOptions}</select>
                    </div>
                    <div class="tl-modal-field">
                        <label class="tl-modal-label">Label <span class="text-muted">(optional)</span></label>
                        <input class="input tl-modal-lbl" type="text" maxlength="50" 
                               placeholder="e.g. High Temp Warning" value="${label || ''}">
                    </div>
                    <div class="tl-modal-errors" style="display:none"></div>
                </div>
                <div class="tl-modal-footer">
                    <button class="btn tl-modal-cancel">Cancel</button>
                    <button class="btn primary tl-modal-confirm">Save Threshold</button>
                </div>
            </div>
        `;

        const modal   = overlay.querySelector('.tl-modal');
        const valEl   = overlay.querySelector('.tl-modal-value');
        const actEl   = overlay.querySelector('.tl-modal-action');
        const lblEl   = overlay.querySelector('.tl-modal-lbl');
        const errEl   = overlay.querySelector('.tl-modal-errors');
        const closeEl = overlay.querySelector('.tl-modal-close');
        const cancelEl = overlay.querySelector('.tl-modal-cancel');
        const confirmEl = overlay.querySelector('.tl-modal-confirm');

        const close = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        closeEl.addEventListener('click', close);
        cancelEl.addEventListener('click', close);

        // Live action color preview
        actEl.addEventListener('change', () => {
            const m = ACTION_META[actEl.value] || ACTION_META.alert;
            actEl.style.borderColor = m.color;
        });
        actEl.dispatchEvent(new Event('change'));

        confirmEl.addEventListener('click', () => {
            const v = parseInt(valEl.value, 10);
            const a = actEl.value;
            const l = lblEl.value.trim();

            if (isNaN(v)) {
                errEl.style.display = '';
                errEl.textContent = 'Please enter a valid number.';
                return;
            }

            const ok = onConfirm({ value: v, action: a, label: l || (ACTION_META[a]?.label || a) });
            if (ok !== false) {
                errEl.style.display = 'none';
                close();
            } else {
                errEl.style.display = '';
            }
        });

        document.body.appendChild(overlay);
        setTimeout(() => valEl.focus(), 50);
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    _deleteThreshold(id) {
        const thr = this.thresholds.find(t => t.id === id);
        if (!thr) return;

        if (!confirm(`Delete threshold at ${thr.value}${this.meta.unit} (${thr.label})?`)) return;

        this.thresholds = this.thresholds.filter(t => t.id !== id);
        this._rerenderAll();
        this._emit();
    }

    _rerenderAll() {
        // Re-render track and list in-place without destroying the whole component
        const trackWrap = this.container.querySelector('.tl-track-wrap');
        if (trackWrap) trackWrap.remove();
        if (this._listEl) this._listEl.remove();
        this._renderTrack();
        this._renderList();
        this._showErrors(this._validate(this.thresholds));
    }

    _showErrors(errors) {
        if (!this._errorBanner) return;
        if (errors.length === 0) {
            this._errorBanner.style.display = 'none';
            this._errorBanner.innerHTML = '';
        } else {
            this._errorBanner.style.display = '';
            this._errorBanner.innerHTML = errors
                .map(e => `<div class="tl-error-item">${e}</div>`)
                .join('');
        }
    }

    // ── Public API ─────────────────────────────────────────────────────────

    getData() {
        return {
            enabled:    this.enabled,
            thresholds: this.thresholds.map(t => ({ ...t })),
        };
    }

    hasErrors() {
        return this._validate(this.thresholds).length > 0;
    }
}

// ── ThresholdManager UI Controller ────────────────────────────────────────────
// Manages multiple ThresholdLadder instances (one per metric) and handles
// save/load operations with the MinePanel API.

class ThresholdManagerUI {
    constructor(containerId) {
        this.el       = document.getElementById(containerId);
        this.ladders  = {};
        this.dirty    = false;
        this.serverId = null;
    }

    async load(serverId) {
        this.serverId = serverId;
        if (!this.el) return;

        this.el.innerHTML = `
            <div class="tl-page-header">
                <div>
                    <h3 class="tl-page-title">Threshold Escalation Rules</h3>
                    <p class="tl-page-sub text-muted">Define escalation thresholds that trigger actions when metrics exceed target values.</p>
                </div>
                <div class="tl-page-actions">
                    <button class="btn tl-reset-btn outline small" id="tl-discard-btn">Discard Changes</button>
                    <button class="btn primary tl-save-btn" id="tl-save-btn">Save Rules</button>
                </div>
            </div>
            <div id="tl-save-indicator" class="tl-save-indicator" style="display:none">
                <span class="tl-save-dot"></span> Unsaved changes
            </div>
            <div id="tl-metrics-container" class="tl-metrics-container">
                <div class="tl-loading text-muted">Loading threshold rules...</div>
            </div>
        `;

        document.getElementById('tl-save-btn')?.addEventListener('click', () => this.save());
        document.getElementById('tl-discard-btn')?.addEventListener('click', () => this.load(serverId));

        try {
            const rules = await api.req(`/servers/${serverId}/thresholds`);
            this._renderMetrics(rules);
        } catch (e) {
            document.getElementById('tl-metrics-container').innerHTML =
                `<p class="text-muted" style="padding:1rem">Failed to load threshold rules: ${e.message}</p>`;
        }
    }

    _renderMetrics(rules) {
        const container = document.getElementById('tl-metrics-container');
        if (!container) return;
        container.innerHTML = '';
        this.ladders = {};

        for (const [metric, cfg] of Object.entries(rules)) {
            if (!METRIC_META[metric]) continue;

            const card = document.createElement('div');
            card.className = 'tl-metric-card card';

            container.appendChild(card);

            this.ladders[metric] = new ThresholdLadder(card, metric, cfg, (updated) => {
                this.dirty = true;
                this._showDirty();
            });
        }
    }

    _showDirty() {
        const indicator = document.getElementById('tl-save-indicator');
        if (indicator) indicator.style.display = '';
        const btn = document.getElementById('tl-save-btn');
        if (btn) btn.classList.add('tl-save-btn-dirty');
    }

    _clearDirty() {
        this.dirty = false;
        const indicator = document.getElementById('tl-save-indicator');
        if (indicator) indicator.style.display = 'none';
        const btn = document.getElementById('tl-save-btn');
        if (btn) btn.classList.remove('tl-save-btn-dirty');
    }

    async save() {
        if (!this.serverId) return;

        // Collect all ladder data and validate
        const payload = {};
        let hasErrors = false;

        for (const [metric, ladder] of Object.entries(this.ladders)) {
            if (ladder.hasErrors()) { hasErrors = true; }
            payload[metric] = ladder.getData();
        }

        if (hasErrors) {
            ui.toast('Fix validation errors before saving.', 'error');
            return;
        }

        const btn = document.getElementById('tl-save-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

        try {
            await api.req(`/servers/${this.serverId}/thresholds`, {
                method: 'PUT',
                body: JSON.stringify(payload),
            });
            this._clearDirty();
            ui.toast('Threshold rules saved successfully', 'success');
        } catch (e) {
            const details = e.details || (e.message ? [e.message] : ['Unknown error']);
            const msg = Array.isArray(details) ? details.join('\n') : String(details);
            ui.toast(`Save failed: ${msg}`, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Save Rules'; }
        }
    }
}

// Export / init
window.ThresholdManagerUI = ThresholdManagerUI;
window.ThresholdLadder    = ThresholdLadder;
