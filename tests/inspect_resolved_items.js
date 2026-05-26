const { buildAssetsIndex } = require('../src/core/assetsResolver');

const index = buildAssetsIndex();

const testItems = [
    'chipped_anvil',
    'damaged_anvil',
    'anvil',
    'grindstone',
    'shield',
    'item_frame',
    'yellow_bed',
    'red_bed',
    'bed',
    'oak_slab',
    'decorated_pot',
    'creaking_heart'
];

console.log('Inspection of resolved asset index entries:');
for (const item of testItems) {
    console.log(`\n=== ${item} ===`);
    console.log(JSON.stringify(index[item], null, 2));
}
