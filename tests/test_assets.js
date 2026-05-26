const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.resolve(__dirname, '../assets');

const { buildAssetsIndex } = require('../src/core/assetsResolver.js');
const index = buildAssetsIndex();

const items = [
    'decorated_pot',
    'acacia_shelf',
    'rail',
    'powered_rail',
    'detector_rail',
    'activator_rail',
    'white_bed',
    'red_bed',
    'sculk_shrieker',
    'sculk_sensor',
    'calibrated_sculk_sensor',
    'grindstone',
    'lectern'
];

for (const id of items) {
    console.log(`${id}:`, JSON.stringify(index[id], null, 2));
}
