(function() {
    window.players = window.players || {};

    let tooltipEl = null;
    let currentItem = null;
    let isShiftPressed = false;

    function initTooltip() {
        if (tooltipEl) return;
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'mc-tooltip';
        tooltipEl.style.display = 'none';
        document.body.appendChild(tooltipEl);

        // Listen for Shift key
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') {
                isShiftPressed = true;
                updateTooltipContent();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') {
                isShiftPressed = false;
                updateTooltipContent();
            }
        });
    }

    function show(item, e) {
        currentItem = item;
        initTooltip();
        updateTooltipContent();
        
        tooltipEl.style.display = 'block';
        positionTooltip(e);
    }

    function hide() {
        currentItem = null;
        if (tooltipEl) {
            tooltipEl.style.display = 'none';
        }
    }

    function update(e) {
        positionTooltip(e);
    }

    function positionTooltip(e) {
        if (!tooltipEl) return;
        
        const offset = 15;
        let x = e.pageX + offset;
        let y = e.pageY + offset;

        // Keep inside viewport bounds
        const tooltipRect = tooltipEl.getBoundingClientRect();
        if (x + tooltipRect.width > window.innerWidth) {
            x = e.pageX - tooltipRect.width - offset;
        }
        if (y + tooltipRect.height > window.innerHeight) {
            y = e.pageY - tooltipRect.height - offset;
        }

        tooltipEl.style.left = `${x}px`;
        tooltipEl.style.top = `${y}px`;
    }

    function updateTooltipContent() {
        if (!tooltipEl || !currentItem) return;

        const { id, count, parsed, simplified } = currentItem;
        const parser = window.players.nbtParser;

        let nameHtml = '';
        let colorClass = 'mc-name-normal';

        if (parsed && parsed.customName) {
            nameHtml = parser.parseFormatting(parsed.customName);
            colorClass = 'mc-name-custom';
        } else {
            // Clean up item id for displayName
            const name = id.replace(/^minecraft:/i, '').replace(/_/g, ' ');
            nameHtml = name.charAt(0).toUpperCase() + name.slice(1);
            if (parsed && parsed.enchantments && parsed.enchantments.length > 0) {
                colorClass = 'mc-name-enchanted';
            }
        }

        let html = `<div class="mc-tooltip-name ${colorClass}">${nameHtml}</div>`;
        html += `<div class="mc-tooltip-meta">${escapeHtml(id)} <span class="mc-count-label">x${count}</span></div>`;

        // Enchantments
        if (parsed && parsed.enchantments && parsed.enchantments.length > 0) {
            html += `<div class="mc-tooltip-section mc-enchants">`;
            parsed.enchantments.forEach(enc => {
                const name = parser.getEnchantmentName(enc.id);
                const lvlStr = parser.toRoman(enc.lvl);
                html += `<div class="mc-enchant-line">${escapeHtml(name)} ${lvlStr}</div>`;
            });
            html += `</div>`;
        }

        // Lore
        if (parsed && parsed.lore && parsed.lore.length > 0) {
            html += `<div class="mc-tooltip-section mc-lore">`;
            parsed.lore.forEach(line => {
                html += `<div class="mc-lore-line">${parser.parseFormatting(line)}</div>`;
            });
            html += `</div>`;
        }

        // Attributes
        if (parsed && parsed.attributes && parsed.attributes.length > 0) {
            html += `<div class="mc-tooltip-section mc-attributes">`;
            parsed.attributes.forEach(attr => {
                let cleanName = attr.name.replace('generic.', '').replace(/_/g, ' ');
                cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
                const sign = attr.amount >= 0 ? '+' : '';
                html += `<div class="mc-attribute-line">${sign}${attr.amount} ${escapeHtml(cleanName)}</div>`;
            });
            html += `</div>`;
        }

        // Unbreakable / Durability
        if (parsed && (parsed.unbreakable || parsed.damage > 0)) {
            html += `<div class="mc-tooltip-section mc-durability">`;
            if (parsed.unbreakable) {
                html += `<div class="mc-unbreakable-line">Unbreakable</div>`;
            }
            if (parsed.damage > 0) {
                html += `<div class="mc-damage-line">Damage: ${parsed.damage}</div>`;
            }
            html += `</div>`;
        }

        // Shift hint & raw NBT
        if (simplified) {
            if (isShiftPressed) {
                html += `<div class="mc-tooltip-section mc-raw-nbt">`;
                html += `<div class="mc-raw-title">Raw NBT Data:</div>`;
                html += `<pre><code>${escapeHtml(JSON.stringify(simplified, null, 2))}</code></pre>`;
                html += `</div>`;
            } else {
                html += `<div class="mc-tooltip-hint">Hold [SHIFT] to view raw NBT</div>`;
            }
        }

        tooltipEl.innerHTML = html;
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    window.players.tooltipRenderer = {
        show,
        hide,
        update
    };
})();
