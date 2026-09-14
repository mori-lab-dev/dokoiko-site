#!/usr/bin/env node
/**
 * dropPixabaySpotImages.mjs — Pixabay由来で本番に出ているspot画像の参照を外す。
 *
 * 出所照合の結果、Pixabayは日本語で引くと語の一部が一致しただけの無関係な
 * ストック写真を返していたことが分かった。目視でも裏が取れている。
 *   鳴子温泉「早稲田桟敷湯」 → 味噌チゲの器
 *   佐渡「北沢浮游選鉱場」   → 立体駐車場
 *   湯田温泉「白狐の湯」     → 雪原のホッキョクギツネ
 * 表示中391件のうち372件は、Pixabay側のタグにspot名がそもそも入っていない。
 *
 * 外すのは destinations.json の imageUrl と imageCredit だけで、
 * public/images/spots/ のファイルは消さない。後から戻せるようにしておく。
 *
 * 対象は「Pixabay由来」かつ「dist のHTMLに実際に出ている」もの。
 * データにあるだけで描画されていないものは、今回は触らない。
 *
 * usage: node scripts/dropPixabaySpotImages.mjs [--apply]
 * 出力: logs/dropped_pixabay_spots.json（戻すときに使う）
 */
import fs from 'fs';
import path from 'path';

const APPLY = process.argv.includes('--apply');
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];
const { rows } = JSON.parse(fs.readFileSync('logs/spot_origin_merged.json', 'utf8'));

const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
const byId = new Map(data.map((d) => [d.id, d]));

const htmlCache = new Map();
function shownInBuild(destId, url) {
  const p = path.join('dist', 'destinations', destId, 'index.html');
  if (!htmlCache.has(p)) htmlCache.set(p, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
  return htmlCache.get(p).includes(url);
}

const pix = rows.filter((r) => r.origin.via === 'pixabay');
const targets = pix.filter((r) => shownInBuild(r.destId, r.url));

let done = 0, ng = 0;
const dropped = [];
for (const r of targets) {
  const s = byId.get(r.destId)?.spots?.[r.idx];
  if (!s || s.name !== r.spotName || s.imageUrl !== r.url) {
    console.log(`❌ ${r.destId}/${r.idx} が照合時と一致しない`); ng++; continue;
  }
  dropped.push({ destId: r.destId, idx: r.idx, spotName: s.name, imageUrl: s.imageUrl, imageCredit: s.imageCredit ?? null, tags: r.origin.tags });
  delete s.imageUrl;
  delete s.imageCredit;   // 画像を外したらクレジットも意味を失う
  done++;
}
if (ng) { console.log(`\nNG ${ng}件。反映しない`); process.exit(1); }

console.log(`Pixabay由来 ${pix.length}件  うち表示中 ${targets.length}件  → 外す ${done}件`);
console.log(`データに残るが描画されていないPixabay由来 ${pix.length - targets.length}件（今回は触らない）`);

if (APPLY) {
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const f of FILES) fs.writeFileSync(f, json);
  fs.writeFileSync('logs/dropped_pixabay_spots.json', JSON.stringify(dropped, null, 1));
  console.log('✅ destinations.json を更新 / 戻す用に logs/dropped_pixabay_spots.json を保存');
} else {
  console.log('（--apply で反映）');
}
