const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'bedrock');

const files = fs
  .readdirSync(dir)
  .filter(f => f.endsWith('.js') && f !== 'index.js');

const resolvers = files.map(f => {
  const mod = require(path.join(dir, f));

  return {
    name: f.replace('.js', ''),
    stable: mod,
    preview: mod.preview || null
  };
});

(async () => {
  console.log('\n=== BEDROCK RESOLVERS STATUS ===\n');

  for (const r of resolvers) {

    // STABLE
    try {
      const stable = r.stable.getLatestVersion?.() || r.stable.getLatestRelease?.();
      const res = stable ? await stable : null;
      console.log(`✔ ${r.name} (stable) →`, res);
    } catch (e) {
      console.log(`✖ ${r.name} (stable) →`, e.message);
    }

    // PREVIEW
    if (r.preview) {
      try {
        const res = await r.preview.getLatestVersion?.();
        console.log(`✔ ${r.name} (preview) →`, res);
      } catch (e) {
        console.log(`✖ ${r.name} (preview) →`, e.message);
      }
    } else {
      console.log(`— ${r.name} (preview) → not implemented`);
    }

    console.log('');
  }

  console.log('================================\n');
})();