(function() {
    window.players = window.players || {};

    const SHIELD_OUTLINE = `<svg viewBox="0 0 32 32" class="mc-armor-svg" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
        <!-- Shield main body -->
        <path d="M6 5 L26 5 L26 18 Q26 27 16 30 Q6 27 6 18 Z"
              stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        <!-- Inner shield emblem lines -->
        <path d="M6 13 L26 13" stroke="currentColor" stroke-width="1" opacity="0.4"/>
        <path d="M11 5 L11 13" stroke="currentColor" stroke-width="1" opacity="0.4"/>
        <path d="M21 5 L21 13" stroke="currentColor" stroke-width="1" opacity="0.4"/>
        <!-- Center diamond -->
        <path d="M16 16 L19 20 L16 27 L13 20 Z" stroke="currentColor" stroke-width="1.2" opacity="0.55"/>
    </svg>`;

    function renderOffhand(offhandData, containerEl) {
        if (!containerEl) return;

        let slotEl = containerEl.querySelector('.mc-slot-offhand');
        if (!slotEl) {
            slotEl = document.createElement('div');
            slotEl.className = 'mc-slot mc-slot-offhand';
            containerEl.innerHTML = '';
            containerEl.appendChild(slotEl);
        }

        const renderer = window.players.itemRenderer;
        if (offhandData) {
            renderer.renderItem(offhandData, slotEl);
        } else {
            slotEl.innerHTML = SHIELD_OUTLINE;
            slotEl.classList.remove('has-item');
            slotEl.onmouseenter = null;
            slotEl.onmouseleave = null;
            slotEl.onmousemove = null;
        }
    }

    window.players.offhandSlot = { renderOffhand };
})();
