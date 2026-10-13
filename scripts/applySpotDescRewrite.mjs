#!/usr/bin/env node
/**
 * applySpotDescRewrite.mjs — rewriteSpotDesc.mjs の結果を spots[].description に反映する（2026-10-13）。
 * スポット名が一致し、元の説明がまだ同じ（途中で別の編集が入っていない）ものだけ書き換える。元の説明は logs/spot_desc_backup.json に足し込む。
 * usage: node scripts/applySpotDescRewrite.mjs logs/spot_desc_new_*.json [--apply]
 */
import fs from 'fs';
const APPLY = process.argv.includes('--apply');
const files = process.argv.slice(2).filter((a) => a !== '--apply');
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];
const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
const byId = new Map(data.map((d) => [d.id, d]));
const backup = {};
let n = 0, skip = 0;
for (const f of files) for (const [key, v] of Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')))) {
  const [id, idx] = key.split('#');
  const s = byId.get(id)?.spots?.[Number(idx)];
  if (!s || typeof s !== 'object' || s.name !== v.name) { skip++; continue; }
  backup[key] = s.description;
  s.description = v.text;
  n++;
}
console.log(`反映 ${n}件 / 見送り ${skip}件`);
if (APPLY) {
  const BK = 'logs/spot_desc_backup.json';
  const prev = fs.existsSync(BK) ? JSON.parse(fs.readFileSync(BK, 'utf8')) : {};
  fs.writeFileSync(BK, JSON.stringify({ ...prev, ...backup }, null, 1));
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const f of FILES) fs.writeFileSync(f, json);
  console.log('✅ 更新 / 元の説明は logs/spot_desc_backup.json');
}
