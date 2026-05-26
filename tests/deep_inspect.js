const fs = require('fs');
const path = require('path');

const ASSETS = path.resolve(__dirname, '../assets/minecraft');

function getPngDimensions(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    return { width: buf.readInt32BE(16), height: buf.readInt32BE(20) };
}

function readModel(name) {
    const p = path.join(ASSETS, 'models', name + '.json');
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function resolveChain(modelId) {
    let chain = [];
    let current = modelId;
    let depth = 0;
    while (current && depth < 10) {
        let ns = 'minecraft', p = current;
        if (current.includes(':')) [ns, p] = current.split(':');
        const model = readModel(p);
        if (!model) { chain.push({ id: current, data: 'NOT FOUND' }); break; }
        chain.push({ id: current, parent: model.parent || null, textures: model.textures || {}, hasElements: !!model.elements, elementCount: model.elements ? model.elements.length : 0 });
        current = model.parent;
        depth++;
    }
    return chain;
}

// Check what models these items use
const items = [
    'block/sculk_sensor',
    'block/calibrated_sculk_sensor',
    'block/sculk_shrieker',
    'block/enchanting_table',
    'block/decorated_pot',
    'block/oak_shelf',
    'block/acacia_shelf',
];

console.log("=== MODEL CHAINS ===\n");
for (const item of items) {
    console.log(`--- ${item} ---`);
    const chain = resolveChain(item);
    for (const step of chain) {
        console.log(JSON.stringify(step));
    }
    console.log();
}

// Check texture file dimensions
console.log("\n=== TEXTURE DIMENSIONS ===");
const texFiles = [
    'textures/block/sculk_sensor_side.png',
    'textures/block/sculk_sensor_top.png',
    'textures/block/sculk_sensor_bottom.png',
    'textures/block/calibrated_sculk_sensor_top.png',
    'textures/block/sculk_shrieker_side.png',
    'textures/block/sculk_shrieker_top.png',
    'textures/block/enchanting_table_side.png',
    'textures/block/enchanting_table_top.png',
    'textures/block/enchanting_table_bottom.png',
    'textures/block/oak_shelf.png',
    'textures/block/acacia_shelf.png',
    'textures/entity/decorated_pot/decorated_pot_side.png',
    'textures/entity/decorated_pot/decorated_pot_base.png',
    'textures/entity/bed/red.png',
];

for (const tex of texFiles) {
    const full = path.join(ASSETS, tex);
    const dim = getPngDimensions(full);
    console.log(`${tex}: ${dim ? `${dim.width}x${dim.height}` : 'NOT FOUND'}`);
}
