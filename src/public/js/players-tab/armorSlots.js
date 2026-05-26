(function() {
    window.players = window.players || {};

    const ARMOR_OUTLINES = {
        helmet: `<svg viewBox="0 0 32 32" class="mc-armor-svg" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 20 L8 13 Q8 6 16 6 Q24 6 24 13 L24 20 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <rect x="5" y="16" width="4" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/>
            <rect x="23" y="16" width="4" height="7" rx="1" stroke="currentColor" stroke-width="1.5"/>
            <line x1="8" y1="19" x2="24" y2="19" stroke="currentColor" stroke-width="1.2" opacity="0.5"/>
        </svg>`,
        chestplate: `<svg viewBox="0 0 32 32" class="mc-armor-svg" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="12" y="4" width="8" height="4" rx="1" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 10 L12 8 L12 14 L5 16 Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            <path d="M27 10 L20 8 L20 14 L27 16 Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            <path d="M10 8 L22 8 L24 28 L8 28 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <line x1="16" y1="8" x2="16" y2="28" stroke="currentColor" stroke-width="1" opacity="0.4"/>
        </svg>`,
        leggings: `<svg viewBox="0 0 32 32" class="mc-armor-svg" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="7" y="5" width="18" height="5" rx="1" stroke="currentColor" stroke-width="1.5"/>
            <path d="M7 10 L15 10 L13 28 L7 28 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M25 10 L17 10 L19 28 L25 28 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <rect x="13" y="6" width="6" height="3" rx="0.5" stroke="currentColor" stroke-width="1.2" opacity="0.55"/>
        </svg>`,
        boots: `<svg viewBox="0 0 32 32" class="mc-armor-svg" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="5" width="10" height="14" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M3 19 L14 19 L15 25 L2 25 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <rect x="18" y="5" width="10" height="14" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M17 19 L28 19 L30 25 L18 25 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>`
    };

    function renderArmor(armorData, containerEl) {
        if (!containerEl) return;

        let armorCol = containerEl.querySelector('.mc-armor-column');
        if (!armorCol) {
            armorCol = document.createElement('div');
            armorCol.className = 'mc-armor-column';
            ['helmet', 'chestplate', 'leggings', 'boots'].forEach(type => {
                const slot = document.createElement('div');
                slot.className = `mc-slot mc-slot-${type}`;
                slot.dataset.slotType = type;
                armorCol.appendChild(slot);
            });
            containerEl.innerHTML = '';
            containerEl.appendChild(armorCol);
        }

        const renderer = window.players.itemRenderer;
        ['helmet', 'chestplate', 'leggings', 'boots'].forEach(type => {
            const slotEl = armorCol.querySelector(`.mc-slot-${type}`);
            const item = (armorData && armorData[type]) ? armorData[type] : null;
            if (item) {
                renderer.renderItem(item, slotEl);
            } else {
                slotEl.innerHTML = ARMOR_OUTLINES[type];
                slotEl.classList.remove('has-item');
                slotEl.onmouseenter = null;
                slotEl.onmouseleave = null;
                slotEl.onmousemove = null;
            }
        });
    }

    window.players.armorSlots = { renderArmor };
})();
