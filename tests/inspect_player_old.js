const fs = require('fs');
const nbt = require('prismarine-nbt');

async function main() {
    const fileBuffer = fs.readFileSync('c:/Users/stefa/Desktop/MinePanel/servers/test-server-2/world/playerdata/4580bbc5-44ae-4442-b977-83877755b798.dat_old');
    const result = await nbt.parse(fileBuffer);
    const data = (result.parsed && result.parsed.value) ? result.parsed.value : (result.value || result);
    
    if (data.Inventory && data.Inventory.value && data.Inventory.value.value) {
        const items = data.Inventory.value.value.map(item => {
            return {
                slot: item.Slot ? item.Slot.value : null,
                id: item.id ? item.id.value : null,
                count: item.Count ? item.Count.value : (item.count ? item.count.value : null)
            };
        });
        console.log('All Inventory Items in .dat_old:', JSON.stringify(items, null, 2));
    } else {
        console.log('No inventory found.');
    }
}

main().catch(console.error);
