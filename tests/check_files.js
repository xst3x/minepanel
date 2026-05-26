const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.resolve(__dirname, '../assets');

const files = [
    'minecraft/textures/block/cherry_planks.png',
    'minecraft/textures/block/enchanting_table_side.png',
    'minecraft/textures/block/enchanting_table_top.png',
    'minecraft/textures/block/beehive_side.png',
    'minecraft/textures/block/beehive_end.png',
    'minecraft/textures/block/beehive_front_honey.png',
    'minecraft/textures/block/scaffolding_side.png',
    'minecraft/textures/block/scaffolding_top.png',
    'minecraft/textures/entity/bed/yellow.png',
    'minecraft/textures/block/tripwire_hook.png',
    'minecraft/textures/item/item_frame.png'
];

for (const f of files) {
    const full = path.join(ASSETS_DIR, f);
    console.log(`${f}:`, fs.existsSync(full) ? 'EXISTS' : 'NOT FOUND');
}
