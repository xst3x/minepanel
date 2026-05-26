const { buildAssetsIndex } = require('../src/core/assetsResolver');

const index = buildAssetsIndex();
const targets = [
    'acacia_shelf',
    'decorated_pot',
    'end_portal_frame',
    'grindstone',
    'sculk_sensor',
    'calibrated_sculk_sensor',
    'enchanting_table'
];

console.log("=== INSPECT RESOLVED ITEMS ===");
for (const target of targets) {
    console.log(`${target}:`, JSON.stringify(index[target], null, 2));
}
