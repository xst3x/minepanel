const fs = require('fs');
const nbt = require('prismarine-nbt');

async function main() {
    const filePath = 'c:/Users/stefa/Desktop/MinePanel/servers/test-server-2/world/playerdata/4580bbc5-44ae-4442-b977-83877755b798.dat';
    const fileBuffer = fs.readFileSync(filePath);
    const result = await nbt.parse(fileBuffer);
    
    // Locate the Inventory list
    const inventoryList = result.parsed.value.Inventory;
    if (!inventoryList || !inventoryList.value || !inventoryList.value.value) {
        console.error('No inventory list found.');
        return;
    }
    
    const items = inventoryList.value.value;
    
    // Remove any existing armor/offhand if they exist (just to be safe)
    const cleanedItems = items.filter(item => {
        const slot = item.Slot ? item.Slot.value : -1;
        return !(slot === 100 || slot === 101 || slot === 102 || slot === 103 || slot === -106 || slot === 106);
    });
    
    // Add custom armor/offhand items
    cleanedItems.push({
        Slot: { type: 'byte', value: 103 }, // Helmet
        id: { type: 'string', value: 'minecraft:diamond_helmet' },
        Count: { type: 'byte', value: 1 }
    });
    cleanedItems.push({
        Slot: { type: 'byte', value: 102 }, // Chestplate
        id: { type: 'string', value: 'minecraft:diamond_chestplate' },
        Count: { type: 'byte', value: 1 }
    });
    cleanedItems.push({
        Slot: { type: 'byte', value: 101 }, // Leggings
        id: { type: 'string', value: 'minecraft:diamond_leggings' },
        Count: { type: 'byte', value: 1 }
    });
    cleanedItems.push({
        Slot: { type: 'byte', value: 100 }, // Boots
        id: { type: 'string', value: 'minecraft:diamond_boots' },
        Count: { type: 'byte', value: 1 }
    });
    cleanedItems.push({
        Slot: { type: 'byte', value: -106 }, // Offhand
        id: { type: 'string', value: 'minecraft:shield' },
        Count: { type: 'byte', value: 1 }
    });
    
    inventoryList.value.value = cleanedItems;
    
    // Write back the modified NBT
    const outBuffer = nbt.writeUncompressed(result.parsed);
    fs.writeFileSync(filePath, outBuffer);
    console.log('Successfully injected armor and offhand into player .dat file!');
}

main().catch(console.error);
