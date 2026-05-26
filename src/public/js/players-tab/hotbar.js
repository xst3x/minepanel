(function() {
    window.players = window.players || {};

    function renderHotbar(hotbarData, containerEl) {
        if (!containerEl) return;

        // Check if slots already exist
        let hotbarGrid = containerEl.querySelector('.mc-hotbar-grid');
        if (!hotbarGrid) {
            hotbarGrid = document.createElement('div');
            hotbarGrid.className = 'mc-hotbar-grid mc-grid-1x9';

            // Build 9 empty slots
            for (let i = 0; i < 9; i++) {
                const slot = document.createElement('div');
                slot.className = 'mc-slot';
                slot.dataset.slotIndex = i;
                hotbarGrid.appendChild(slot);
            }
            containerEl.innerHTML = '';
            containerEl.appendChild(hotbarGrid);
        }

        // Update slots
        const slots = hotbarGrid.querySelectorAll('.mc-slot');
        const renderer = window.players.itemRenderer;

        for (let i = 0; i < 9; i++) {
            const slotEl = slots[i];
            const item = (hotbarData && hotbarData[i]) ? hotbarData[i] : null;
            renderer.renderItem(item, slotEl);
        }
    }

    window.players.hotbar = {
        renderHotbar
    };
})();
