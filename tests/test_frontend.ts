const { JSDOM } = require('jsdom');

async function testFrontend() {
    const dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
        <body>
            <div id="pd-armor-container"></div>
            <div id="pd-offhand-container"></div>
        </body>
        </html>
    `);
    const { window } = dom;
    global.window = window;
    global.document = window.document;
    global.Image = window.Image;

    // Mock API and core modules
    window.players = {};
    window.players.assetsMapper = {
        getItemIconPath: (id) => `/assets/minecraft/textures/item/${id.replace('minecraft:', '')}.png`,
        MISSING_TEXTURE: '/assets/minecraft/textures/misc/unknown.png'
    };
    
    window.players.blockRenderer = {
        renderBlock: async () => {},
        renderEntityBlock: async () => {}
    };

    window.players.tooltipRenderer = {
        show: () => {},
        hide: () => {},
        update: () => {}
    };

    // Load scripts
    require('../src/public/js/players-tab/itemRenderer.js');
    require('../src/public/js/players-tab/armorSlots.js');
    require('../src/public/js/players-tab/offhandSlot.js');

    const armorData = {
        helmet: { id: 'minecraft:diamond_helmet', count: 1 },
        chestplate: { id: 'minecraft:diamond_chestplate', count: 1 },
        leggings: { id: 'minecraft:diamond_leggings', count: 1 },
        boots: { id: 'minecraft:diamond_boots', count: 1 }
    };
    const offhandData = { id: 'minecraft:shield', count: 1 };

    console.log('Testing renderArmor...');
    window.players.armorSlots.renderArmor(armorData, window.document.getElementById('pd-armor-container'));
    
    console.log('Testing renderOffhand...');
    window.players.offhandSlot.renderOffhand(offhandData, window.document.getElementById('pd-offhand-container'));

    console.log('HTML after renderArmor & renderOffhand:');
    console.log(window.document.body.innerHTML);
}

testFrontend().catch(console.error);
