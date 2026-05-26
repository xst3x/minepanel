const fs = require('fs');
const path = require('path');

const sidePath = path.resolve(__dirname, '../assets/minecraft/textures/entity/decorated_pot/decorated_pot_side.png');
const basePath = path.resolve(__dirname, '../assets/minecraft/textures/entity/decorated_pot/decorated_pot_base.png');

function getPngDimensions(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    // Width is at bytes 16-19, height at 20-23
    const width = buf.readInt32BE(16);
    const height = buf.readInt32BE(20);
    return { width, height };
}

console.log("Side PNG:", getPngDimensions(sidePath));
console.log("Base PNG:", getPngDimensions(basePath));
