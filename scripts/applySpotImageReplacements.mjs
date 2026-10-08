#!/usr/bin/env node
/**
 * applySpotImageReplacements.mjs — replaceSpotImages.mjs の結果を destinations.json の spots に反映する。
 * imageUrl（API が返した 500px の thumb URL）と imageCredit を入れる。
 *
 * usage: node scripts/applySpotImageReplacements.mjs logs/replace_spots_*.json [--apply]
 */
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const files = process.argv.slice(2).filter((a) => a !== '--apply');
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];
const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
const byId = new Map(data.map((d) => [d.id, d]));

let n = 0;
for (const f of files) {
  for (const a of JSON.parse(fs.readFileSync(f, 'utf8')).adopted || []) {
    const s = byId.get(a.id)?.spots?.[a.idx];
    if (!s || typeof s !== 'object' || s.name !== a.name) { console.log(`❌ ${a.id}#${a.idx} ${a.name}: スポットが一致しない`); continue; }
    s.imageUrl = a.imageUrl;
    s.imageCredit = a.imageCredit;
    n++;
  }
}
console.log(`反映 ${n}件`);
if (APPLY) {
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const f of FILES) fs.writeFileSync(f, json);
  console.log('✅ 更新');
} else console.log('（--apply で反映）');
