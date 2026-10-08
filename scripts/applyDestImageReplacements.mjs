#!/usr/bin/env node
/**
 * applyDestImageReplacements.mjs — replaceDestImages.mjs の結果（main.jpg は配置済み）を destinations.json に反映する。
 * imageCredit を新しいファイルの出典に差し替える。画素照合（pixelDiffAfter）が6を超えるものは反映しない
 * （置いた画像と出典が一致していないということなので）。
 *
 * usage: node scripts/applyDestImageReplacements.mjs logs/replace_dest_*.json [--apply]
 */
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const files = process.argv.slice(2).filter((a) => a !== '--apply');
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];
const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
const byId = new Map(data.map((d) => [d.id, d]));

let n = 0, skip = 0;
for (const f of files) {
  for (const a of JSON.parse(fs.readFileSync(f, 'utf8')).adopted || []) {
    const d = byId.get(a.id);
    if (!d) { console.log(`❌ ${a.id} が無い`); skip++; continue; }
    if (a.pixelDiffAfter == null || a.pixelDiffAfter > 6) { console.log(`⚠️  ${a.id} 画素差 ${a.pixelDiffAfter}: 反映しない`); skip++; continue; }
    d.imageCredit = a.credit;
    if (!Array.isArray(d.images) || !d.images.length) d.images = [`/images/${d.id}/main.jpg`];
    else d.images[0] = `/images/${d.id}/main.jpg`;
    n++;
  }
}
console.log(`反映 ${n}件 / 見送り ${skip}件`);
if (APPLY) {
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const f of FILES) fs.writeFileSync(f, json);
  console.log('✅ 更新');
} else console.log('（--apply で反映）');
