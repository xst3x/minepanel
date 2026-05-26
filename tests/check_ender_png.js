const fs = require('fs');

async function main() {
    // Check if ender.png exists and find its size
    const p1 = 'c:/Users/stefa/Desktop/MinePanel/assets/minecraft/textures/entity/chest/ender.png';
    const p2 = 'c:/Users/stefa/Desktop/MinePanel/assets/minecraft/textures/entity/chest/normal.png';
    console.log('ender.png exists:', fs.existsSync(p1));
    console.log('normal.png exists:', fs.existsSync(p2));
}

main().catch(console.error);
