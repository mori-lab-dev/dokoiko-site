#!/usr/bin/env node
/**
 * dropWrongPlaceImages.mjs — 所在地照合で「別の場所の写真」と確定し、かつ正しい代わりが見つからなかった
 * destination の main 画像と出典を外す（2026-10-08）。
 *
 * 別の場所の写真を出すより、グラデーションのフォールバックで出す方が正しい。画像は git に残るので戻せる。
 * 画素照合が合っている（= クレジットのファイルがそのまま手元の画像）のに所在地が ng のものだけを対象にする。
 * usage: node scripts/dropWrongPlaceImages.mjs id1 id2 ... [--apply]
 */
import fs from 'fs';
const APPLY = process.argv.includes('--apply');
const ids = process.argv.slice(2).filter((a) => a !== '--apply');
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];
const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
for (const id of ids) {
  const d = data.find((x) => x.id === id);
  if (!d) { console.log(`❌ ${id} が無い`); continue; }
  console.log(`  ${id} ${d.name}: 画像と出典を外す（出典 ${d.imageCredit?.url?.split('/wiki/')[1]?.slice(0, 50)}）`);
  d.images = [];
  delete d.imageCredit;
  if (APPLY) for (const p of [`public/images/${id}/main.jpg`, `public/images/${id}.jpg`]) if (fs.existsSync(p)) fs.unlinkSync(p);
}
if (APPLY) {
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const f of FILES) fs.writeFileSync(f, json);
  console.log('✅ 更新');
} else console.log('（--apply で反映）');
