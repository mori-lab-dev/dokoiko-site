#!/usr/bin/env node
/**
 * applySpotOriginCredits.mjs — 出所が確定したローカルspot画像に imageCredit を書き込む。
 *
 * 対象は analyzeSpotOrigin.mjs でバイト一致まで取れたものだけ。
 * 推測は入れない。照合できなかった170件には何も書かない。
 *
 * Openverse由来には CC BY / CC BY-SA が多く、表示義務がある。
 * ここが今まで丸ごと抜けていたので、それを埋めるのが主目的。
 * Pixabay由来は表示義務が無いので attributionRequired: false にするが、
 * どこから来たファイルなのかを残すために author と url は書く。
 *
 * 写真が本当にその場所かどうかは、この作業では判断しない（別の課題）。
 *
 * usage: node scripts/applySpotOriginCredits.mjs [--apply]
 */
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];
const { rows } = JSON.parse(fs.readFileSync('logs/spot_origin_merged.json', 'utf8'));

const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
const byId = new Map(data.map((d) => [d.id, d]));

let wrote = 0, skipped = 0, ng = 0;
const stat = {};
for (const r of rows) {
  const d = byId.get(r.destId);
  const s = d?.spots?.[r.idx];
  if (!s || s.name !== r.spotName) { console.log(`❌ ${r.destId}/${r.idx} が照合時と一致しない`); ng++; continue; }
  if (s.imageUrl !== r.url) { console.log(`❌ ${r.destId}/${r.idx} の画像URLが変わっている`); ng++; continue; }
  if (s.imageCredit) { skipped++; continue; }
  if (!r.credit) { skipped++; continue; }
  s.imageCredit = r.credit;
  stat[r.origin.via] = (stat[r.origin.via] || 0) + 1;
  wrote++;
}

if (ng) { console.log(`\nNG ${ng}件。反映しない`); process.exit(1); }

const needAttr = rows.filter((r) => r.credit?.attributionRequired).length;
console.log(`書き込む ${wrote}件 / すでに有り・対象外 ${skipped}件`);
for (const [k, v] of Object.entries(stat)) console.log(`  ${k}  ${v}件`);
console.log(`うち表示義務あり ${needAttr}件（これまで表示できていなかったぶん）`);

if (APPLY) {
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const f of FILES) fs.writeFileSync(f, json);
  console.log('✅ destinations.json を更新');
} else {
  console.log('（--apply で反映）');
}
