// Fetch blue gem data from bluegem.app CDN (same source as CSFloat)
// Format: { [defindex]: { [paintindex]: { [paintseed]: { pb, bb } } } }
// pb = playside_blue %, bb = backside_blue %

const https = require('https');
const fs = require('fs');
const zlib = require('zlib');

const items = [
  { name: 'AK-47', defindex: 7, paintindex: 44 },
  { name: 'Five-SeveN', defindex: 3, paintindex: 44 },
  { name: 'Five-SeveN', defindex: 3, paintindex: 831 },
  { name: 'Desert Eagle', defindex: 1, paintindex: 1054 },
  { name: 'Karambit', defindex: 507, paintindex: 44 },
  { name: 'Bayonet', defindex: 500, paintindex: 44 },
  { name: 'M9 Bayonet', defindex: 508, paintindex: 44 },
  { name: 'Butterfly Knife', defindex: 515, paintindex: 44 },
  { name: 'Falchion Knife', defindex: 512, paintindex: 44 },
  { name: 'Flip Knife', defindex: 505, paintindex: 44 },
  { name: 'Gut Knife', defindex: 506, paintindex: 44 },
  { name: 'Huntsman Knife', defindex: 509, paintindex: 44 },
  { name: 'Bowie Knife', defindex: 514, paintindex: 44 },
  { name: 'Shadow Daggers', defindex: 516, paintindex: 44 },
  { name: 'Navaja Knife', defindex: 520, paintindex: 44 },
  { name: 'Stiletto Knife', defindex: 522, paintindex: 44 },
  { name: 'Talon Knife', defindex: 523, paintindex: 44 },
  { name: 'Ursus Knife', defindex: 519, paintindex: 44 },
  { name: 'Nomad Knife', defindex: 518, paintindex: 44 },
  { name: 'Paracord Knife', defindex: 517, paintindex: 44 },
  { name: 'Survival Knife', defindex: 503, paintindex: 44 },
  { name: 'Skeleton Knife', defindex: 525, paintindex: 44 },
  { name: 'Classic Knife', defindex: 526, paintindex: 44 },
  { name: 'Kukri Knife', defindex: 521, paintindex: 44 },
];

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) { resolve(null); res.resume(); return; }
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

async function main() {
  const result = {};
  let total = 0;

  for (const item of items) {
    const url = `https://cdn.bluegem.app/patterns/${encodeURIComponent(item.name)}.json`;
    process.stdout.write(`Fetching ${item.name}... `);
    const data = await fetchJSON(url);
    if (!data) { console.log('SKIP'); continue; }

    if (!result[item.defindex]) result[item.defindex] = {};
    if (!result[item.defindex][item.paintindex]) result[item.defindex][item.paintindex] = {};

    if (Array.isArray(data)) {
      for (const e of data) {
        const seed = e.seed ?? e.paint_seed ?? e.paintseed;
        if (seed === undefined) continue;
        result[item.defindex][item.paintindex][seed] = {
          pb: Math.round((e.playside_blue ?? e.playside?.blue ?? 0) * 10) / 10,
          bb: Math.round((e.backside_blue ?? e.backside?.blue ?? 0) * 10) / 10,
        };
        total++;
      }
    } else {
      for (const [seed, e] of Object.entries(data)) {
        result[item.defindex][item.paintindex][seed] = {
          pb: Math.round((e.playside_blue ?? 0) * 10) / 10,
          bb: Math.round((e.backside_blue ?? 0) * 10) / 10,
        };
        total++;
      }
    }
    console.log(`${Object.keys(result[item.defindex][item.paintindex]).length} seeds`);
  }

  const json = JSON.stringify(result);
  console.log(`\nTotal: ${total} entries, ${(json.length / 1024).toFixed(0)}KB raw`);

  fs.writeFileSync('data/bluegem.json', json);
  const compressed = zlib.gzipSync(Buffer.from(json));
  fs.writeFileSync('data/bluegem.json.gz', compressed);
  console.log(`Compressed: ${(compressed.length / 1024).toFixed(0)}KB gzip`);
}

main().catch(console.error);
