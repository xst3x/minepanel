(function() {
    window.players = window.players || {};

    function renderEnderChest(enderChestData, containerEl) {
        if (!containerEl) return;

        // Check if slots already exist
        let gridEl = containerEl.querySelector('.mc-enderchest-grid');
        if (!gridEl) {
            gridEl = document.createElement('div');
            gridEl.className = 'mc-enderchest-grid mc-grid-3x9';

            // Build 27 empty slots
            for (let i = 0; i < 27; i++) {
                const slot = document.createElement('div');
                slot.className = 'mc-slot mc-slot-ender';
                slot.dataset.slotIndex = i;
                gridEl.appendChild(slot);
            }
            containerEl.innerHTML = '';
            containerEl.appendChild(gridEl);
        }

        // Update slots
        const slots = gridEl.querySelectorAll('.mc-slot-ender');
        const renderer = window.players.itemRenderer;

        for (let i = 0; i < 27; i++) {
            const slotEl = slots[i];
            const item = (enderChestData && enderChestData[i]) ? enderChestData[i] : null;
            renderer.renderItem(item, slotEl);
        }
    }

    window.players.enderChest = {
        renderEnderChest
    };
})();
