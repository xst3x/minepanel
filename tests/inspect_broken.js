const { buildAssetsIndex } = require('../src/core/assetsResolver');

const index = buildAssetsIndex();
const targets = [
    'sculk_sensor',
    'calibrated_sculk_sensor',
    'sculk_shrieker',
    'enchanting_table',
    'decorated_pot',
    // shelves
    'oak_shelf',
    'spruce_shelf',
    'birch_shelf',
    'jungle_shelf',
    'acacia_shelf',
    'dark_oak_shelf',
    'mangrove_shelf',
    'cherry_shelf',
    'bamboo_shelf',
    'crimson_shelf',
    'warped_shelf',
    'pale_oak_shelf',
    // beds
    'white_bed',
    'orange_bed',
    'red_bed',
    'black_bed',
];

console.log("=== INSPECT BROKEN ITEMS ===");
for (const target of targets) {
    const val = index[target];
    if (val === undefined) {
        console.log(`${target}: NOT IN INDEX`);
    } else {
        console.log(`${target}:`, JSON.stringify(val, null, 2));
    }
}
