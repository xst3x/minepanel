(function () {
    'use strict';
    window.players = window.players || {};

    async function renderItem(item, slotEl, options = {}) {
        slotEl.innerHTML = '';
        slotEl.classList.remove('has-item');
        if (!item) return;
        slotEl.classList.add('has-item');

        const wrapper = document.createElement('div');
        wrapper.className = 'mc-item-wrapper';

        const resolvedId = window.serverIconItems?.resolveItemId(item.id) || item.id;
        const assetName = resolvedId.replace(/^minecraft:/i, '').toLowerCase();
        const mapper = window.players.assetsMapper;
        const renderer = window.players.blockRenderer;
        const iconData = mapper.getItemIconPath(resolvedId);
        const isObj = typeof iconData === 'object' && iconData !== null;
        const skipTooltip = options.skipTooltip || slotEl.classList.contains('icon-item-picker-slot');

        if (assetName === 'shield') {
            const canvas = document.createElement('canvas');
            canvas.className = 'mc-item-canvas';
            canvas.width = 32;
            canvas.height = 32;
            wrapper.appendChild(canvas);

            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;

            const drawShield = (src) => new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    ctx.clearRect(0, 0, 32, 32);
                    ctx.drawImage(img, 1, 1, 12, 22, 9, 3, 14, 26);
                    resolve();
                };
                img.onerror = resolve;
                img.src = src;
            });

            await drawShield('/assets/minecraft/textures/entity/shield_base_nopattern.png')
                .catch(() => drawShield('/assets/minecraft/textures/entity/shield_base.png'));

        } else if (isObj && iconData.entityType) {
            const canvas = document.createElement('canvas');
            canvas.className = 'mc-item-canvas';
            wrapper.appendChild(canvas);
            const et = iconData.entityType;
            if (et === 'chest') {
                await renderer.renderEntityBlock(canvas, iconData.texture, 'chest');
            } else if (et === 'shulker') {
                await renderer.renderEntityBlock(canvas, iconData.texture, 'shulker');
            } else if (et === 'bed') {
                await renderer.renderEntityBlock(canvas, iconData.texture, 'bed');
            } else if (et === 'decorated_pot') {
                await renderer.renderEntityBlock(canvas, iconData.texture, 'decorated_pot');
            } else if (et && et.startsWith('head_')) {
                await renderer.renderEntityBlock(canvas, iconData.texture, et);
            } else if (et && et.startsWith('banner_')) {
                await renderer.renderEntityBlock(canvas, iconData.texture, et);
            } else if (et === 'conduit') {
                await renderer.renderEntityBlock(canvas, iconData.texture, 'conduit');
            } else if (et === 'copper_golem_statue') {
                await renderer.renderEntityBlock(canvas, iconData.texture, 'copper_golem_statue');
            } else {
                await renderer.renderEntityBlock(canvas, iconData.texture, 'generic');
            }

        } else if (isObj && iconData.side) {
            const canvas = document.createElement('canvas');
            canvas.className = 'mc-item-canvas';
            wrapper.appendChild(canvas);
            await renderer.renderBlock(
                canvas,
                iconData.top || iconData.side,
                iconData.side,
                iconData.front || null,
                resolvedId,
                iconData.itemShape
            );

        } else if (isObj && iconData.flat) {
            const canvas = document.createElement('canvas');
            canvas.className = 'mc-item-canvas';
            canvas.width = 32;
            canvas.height = 32;
            wrapper.appendChild(canvas);
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            await new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    ctx.clearRect(0, 0, 32, 32);
                    ctx.drawImage(img, 0, 0, 32, 32);
                    if (iconData.tint) {
                        ctx.globalCompositeOperation = 'multiply';
                        ctx.fillStyle = iconData.tint;
                        ctx.fillRect(0, 0, 32, 32);
                        ctx.globalCompositeOperation = 'destination-in';
                        ctx.drawImage(img, 0, 0, 32, 32);
                        ctx.globalCompositeOperation = 'source-over';
                    }
                    resolve();
                };
                img.onerror = () => {
                    img.src = mapper.MISSING_TEXTURE;
                    img.onload = resolve;
                };
                img.src = iconData.flat;
            });

        } else {
            const iconPath = isObj
                ? (iconData.side || iconData.texture || mapper.MISSING_TEXTURE)
                : (iconData || mapper.MISSING_TEXTURE);
            const img = document.createElement('img');
            img.className = 'mc-item-icon';
            img.src = iconPath;
            img.alt = assetName;
            if (skipTooltip) img.loading = 'eager';
            else img.setAttribute('loading', 'lazy');
            img.onerror = () => {
                if (!img.dataset.failed) {
                    img.dataset.failed = 'true';
                    img.src = mapper.MISSING_TEXTURE;
                }
            };
            wrapper.appendChild(img);
        }

        if (item.count > 1) {
            const badge = document.createElement('span');
            badge.className = 'mc-item-count';
            badge.textContent = item.count;
            wrapper.appendChild(badge);
        }

        const label = document.createElement('div');
        label.className = 'mc-item-label';
        label.textContent = assetName;
        wrapper.appendChild(label);

        slotEl.appendChild(wrapper);

        if (!skipTooltip) {
            const tooltip = window.players.tooltipRenderer;
            slotEl.onmouseenter = (e) => tooltip.show(item, e);
            slotEl.onmouseleave = () => tooltip.hide();
            slotEl.onmousemove = (e) => tooltip.update(e);
        } else {
            slotEl.onmouseenter = null;
            slotEl.onmouseleave = null;
            slotEl.onmousemove = null;
        }

        slotEl.onclick = (e) => {
            e.stopPropagation();
            document.querySelectorAll('.mc-slot').forEach(s => s.classList.remove('selected'));
            slotEl.classList.add('selected');
        };
    }

    window.players.itemRenderer = { renderItem };
})();
