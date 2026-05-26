const osu = require('node-os-utils');
console.log('OSU keys:', Object.keys(osu));
console.log('CPU:', osu.cpu);
console.log('MEM:', osu.mem);
