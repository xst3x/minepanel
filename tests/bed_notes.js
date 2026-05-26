const fs = require('fs');
const path = require('path');

const imgPath = path.resolve(__dirname, '../assets/minecraft/textures/entity/bed/red.png');
console.log("File exists:", fs.existsSync(imgPath));

// Let's write a script to scan the 64x64 texture and print where the non-transparent pixels are.
// We can use a simple PNG parsing or just check standard format.
// Wait, is there a pngjs or similar? No, only standard node.
// We can use standard canvas or we can do it in the frontend!
// Wait! Let's look at the frontend bed rendering code in blockRenderer.js.
