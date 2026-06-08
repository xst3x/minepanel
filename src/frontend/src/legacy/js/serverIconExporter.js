(function () {
    'use strict';

    const DEFAULT_SIDEBAR_SVG = `
        <svg class="sidebar-server-icon sidebar-server-icon-default" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="2" y="2" width="20" height="8" rx="2"/>
            <rect x="2" y="14" width="20" height="8" rx="2"/>
        </svg>`;

    const iconBlobCache = new Map();

    function formatItemLabel(id) {
        return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function getPresetItems() {
        return window.serverIconItems?.PRESET_ITEMS || [];
    }

    function resolveItemId(itemId) {
        if (window.serverIconItems?.resolveItemId) {
            return window.serverIconItems.resolveItemId(itemId);
        }
        return itemId.replace(/^minecraft:/i, '').toLowerCase();
    }

    function waitForRender(slot, timeoutMs = 2500) {
        return new Promise((resolve, reject) => {
            const started = Date.now();
            const tick = () => {
                const canvas = slot.querySelector('canvas.mc-item-canvas');
                const img = slot.querySelector('img.mc-item-icon');
                if (canvas && canvas.width > 0 && canvas.height > 0) {
                    resolve({ type: 'canvas', el: canvas });
                    return;
                }
                if (img) {
                    if (img.complete && img.naturalWidth > 0) {
                        resolve({ type: 'img', el: img });
                        return;
                    }
                    img.onload = () => resolve({ type: 'img', el: img });
                    img.onerror = () => reject(new Error('Texture failed to load'));
                    return;
                }
                if (Date.now() - started > timeoutMs) {
                    reject(new Error('Item render timed out'));
                    return;
                }
                requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });
    }

    function scaleCanvas(srcCanvas, size) {
        const out = document.createElement('canvas');
        out.width = size;
        out.height = size;
        const ctx = out.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(srcCanvas, 0, 0, size, size);
        return out;
    }

    async function renderItemToCanvas(itemId, serverId) {
        const mapper = window.players?.assetsMapper;
        const itemRenderer = window.players?.itemRenderer;
        if (!mapper || !itemRenderer) throw new Error('Asset loader not available');

        await mapper.init(serverId);

        const resolvedId = resolveItemId(itemId);
        const slot = document.createElement('div');
        slot.className = 'mc-slot has-item';
        slot.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:32px;height:32px;pointer-events:none';
        document.body.appendChild(slot);

        try {
            await itemRenderer.renderItem(
                { id: `minecraft:${resolvedId}`, count: 1 },
                slot,
                { skipTooltip: true }
            );
            const rendered = await waitForRender(slot);

            const srcCanvas = document.createElement('canvas');
            srcCanvas.width = 32;
            srcCanvas.height = 32;
            const ctx = srcCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            if (rendered.type === 'canvas') {
                ctx.drawImage(rendered.el, 0, 0, 32, 32);
            } else {
                ctx.drawImage(rendered.el, 0, 0, 32, 32);
            }

            return scaleCanvas(srcCanvas, 64);
        } finally {
            slot.remove();
        }
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('Canvas conversion failed'));
            }, 'image/png');
        });
    }

    async function renderItemToPngBlob(itemId, serverId) {
        const canvas = await renderItemToCanvas(itemId, serverId);
        return canvasToBlob(canvas);
    }

    function invalidateIconCache(serverId) {
        const cached = iconBlobCache.get(serverId);
        if (cached) {
            URL.revokeObjectURL(cached);
            iconBlobCache.delete(serverId);
        }
    }

    function invalidateAllIconCache() {
        iconBlobCache.forEach(url => URL.revokeObjectURL(url));
        iconBlobCache.clear();
    }

    async function fetchIconUrl(serverId) {
        if (iconBlobCache.has(serverId)) return iconBlobCache.get(serverId);
        const token = window.state?.token || localStorage.getItem('mp_token');
        try {
            const res = await fetch(`/api/servers/${serverId}/properties/icon?t=${Date.now()}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            if (!res.ok) return null;
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            iconBlobCache.set(serverId, url);
            return url;
        } catch {
            return null;
        }
    }

    async function mountSidebarIcon(btn, serverId) {
        const wrap = document.createElement('span');
        wrap.className = 'sidebar-server-icon-wrap';
        wrap.innerHTML = DEFAULT_SIDEBAR_SVG;
        btn.insertBefore(wrap, btn.firstChild);

        const url = await fetchIconUrl(serverId);
        if (url) {
            const img = document.createElement('img');
            img.className = 'sidebar-server-icon';
            img.src = url;
            img.alt = '';
            wrap.innerHTML = '';
            wrap.appendChild(img);
        }
    }

    window.serverIconHelper = {
        get PRESET_ITEMS() { return getPresetItems(); },
        formatItemLabel,
        resolveItemId,
        renderItemToCanvas,
        renderItemToPngBlob,
        fetchIconUrl,
        mountSidebarIcon,
        invalidateIconCache,
        invalidateAllIconCache,
        DEFAULT_SIDEBAR_SVG
    };
})();
