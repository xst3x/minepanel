const fs = require('fs');

function getPngDimensions(filePath) {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(8);
    fs.readSync(fd, buffer, 0, 8, 16); // Read width and height from offset 16
    fs.closeSync(fd);
    
    const width = buffer.readUInt32BE(0);
    const height = buffer.readUInt32BE(4);
    return { width, height };
}

console.log('ender.png size:', getPngDimensions('c:/Users/stefa/Desktop/MinePanel/assets/minecraft/textures/entity/chest/ender.png'));
console.log('normal.png size:', getPngDimensions('c:/Users/stefa/Desktop/MinePanel/assets/minecraft/textures/entity/chest/normal.png'));
console.log('shulker.png size:', getPngDimensions('c:/Users/stefa/Desktop/MinePanel/assets/minecraft/textures/entity/shulker/shulker.png'));
