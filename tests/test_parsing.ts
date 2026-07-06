const http = require('http');

function getPlayer() {
    // Send request to localhost:8080/api/servers/test-server-2/players/4580bbc5-44ae-4442-b977-83877755b798
    // Note: We need authenticateToken which means we need a JWT token or we can just run the function in playerRoutes directly.
    // Let's just require the route file or parse the playerdata file manually using the playerRoutes.js logic.
}

const fs = require('fs');
const nbt = require('prismarine-nbt');
const path = require('path');

async function testParsing() {
    const fileBuffer = fs.readFileSync('c:/Users/stefa/Desktop/MinePanel/servers/test-server-2/world/playerdata/4580bbc5-44ae-4442-b977-83877755b798.dat');
    const result = await nbt.parse(fileBuffer);
    const data = (result.parsed && result.parsed.value) ? result.parsed.value : (result.value || result);

    const simplifyNbt = (tag) => {
        if (!tag) return null;
        if (tag.type !== undefined && tag.value !== undefined) {
            return simplifyNbt(tag.value);
        }
        if (Array.isArray(tag)) {
            return tag.map(simplifyNbt);
        }
        if (typeof tag === 'object') {
            const res = {};
            for (const [key, val] of Object.entries(tag)) {
                res[key] = simplifyNbt(val);
            }
            return res;
        }
        return tag;
    };

    const extractItems = (nbtList) => {
        if (!nbtList || !nbtList.value || !nbtList.value.value) return [];
        return nbtList.value.value.map(item => {
            const slot = (item.Slot && item.Slot.value !== undefined) ? item.Slot.value : -1;
            const id = (item.id && item.id.value !== undefined) ? item.id.value : 'unknown';
            const countVal = (item.Count && item.Count.value !== undefined) ? item.Count.value : 1;
            
            return { 
                slot, 
                id, 
                count: countVal
            };
        });
    };

    const rawInventory = extractItems(data.Inventory);
    const armor = { helmet: null, chestplate: null, leggings: null, boots: null };
    let offhand = null;

    rawInventory.forEach(item => {
        const slot = item.slot;
        if (slot === 100) {
            armor.boots = item;
        } else if (slot === 101) {
            armor.leggings = item;
        } else if (slot === 102) {
            armor.chestplate = item;
        } else if (slot === 103) {
            armor.helmet = item;
        } else if (slot === -106 || slot === 106 || slot === 150) {
            offhand = item;
        }
    });

    console.log('Parsed Armor:', armor);
    console.log('Parsed Offhand:', offhand);
}

testParsing().catch(console.error);
