const fs = require('fs');
const path = require('path');
const nbt = require('prismarine-nbt');

const pFile = 'c:\\Users\\stefa\\Desktop\\MinePanel\\servers\\test\\world\\playerdata\\4580bbc5-44ae-4442-b977-83877755b798.dat';

if (!fs.existsSync(pFile)) {
    console.error("Player file does not exist!");
    process.exit(1);
}

const fileBuffer = fs.readFileSync(pFile);
nbt.parse(fileBuffer).then(result => {
    console.log("=== PARSED NBT RESULT KEYS ===");
    console.log(Object.keys(result));
    
    const data = result.parsed || result.value || result;
    console.log("\n=== ROOT DATA KEYS ===");
    console.log(Object.keys(data));
    
    if (data.value) {
        console.log("\n=== data.value KEYS ===");
        console.log(Object.keys(data.value));
        
        const inner = data.value;
        console.log("\n=== inner.Inventory ===");
        console.log(JSON.stringify(inner.Inventory, null, 2));
        
        console.log("\n=== inner.EnderItems ===");
        console.log(JSON.stringify(inner.EnderItems, null, 2));
    } else {
        console.log("\n=== Inventory tag directly ===");
        console.log(JSON.stringify(data.Inventory, null, 2));
        
        console.log("\n=== EnderItems tag directly ===");
        console.log(JSON.stringify(data.EnderItems, null, 2));
    }
}).catch(err => {
    console.error("Error parsing:", err);
});
