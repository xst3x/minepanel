(function() {
    window.players = window.players || {};

    function renderGrid(inventoryData, containerEl) {
        if (!containerEl) return;

        // Check if slots already exist inside the container
        let gridEl = containerEl.querySelector('.mc-inventory-grid');
        if (!gridEl) {
            gridEl = document.createElement('div');
            gridEl.className = 'mc-inventory-grid mc-grid-3x9';
            
            // Build 27 empty slots once
            for (let i = 0; i < 27; i++) {
                const slot = document.createElement('div');
                slot.className = 'mc-slot';
                slot.dataset.slotIndex = i;
                gridEl.appendChild(slot);
            }
            containerEl.innerHTML = '';
            containerEl.appendChild(gridEl);
        }

        // Update slots
        const slots = gridEl.querySelectorAll('.mc-slot');
        const renderer = window.players.itemRenderer;
        
        for (let i = 0; i < 27; i++) {
            const slotEl = slots[i];
            const item = (inventoryData && inventoryData[i]) ? inventoryData[i] : null;
            renderer.renderItem(item, slotEl);
        }
    }

    window.players.inventoryGrid = {
        renderGrid
    };
})();
