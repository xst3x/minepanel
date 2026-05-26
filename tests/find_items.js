const fs = require('fs');
const path = require('path');

const ITEMS_DIR = path.resolve(__dirname, '../assets/minecraft/items');
if (fs.existsSync(ITEMS_DIR)) {
    const files = fs.readdirSync(ITEMS_DIR);
    console.log(`Total files in items: ${files.length}`);
    console.log('Sample files:', files.slice(0, 20));
    
    // Check if cherry_planks.json or planks.json or similar exists
    const planksFiles = files.filter(f => f.includes('planks'));
    console.log('Planks-related files:', planksFiles);
    
    // Check if enchanting_table.json exists
    const enchantingTableFiles = files.filter(f => f.includes('enchanting'));
    console.log('Enchanting-related files:', enchantingTableFiles);
} else {
    console.log('items directory does not exist');
}
