#!/usr/bin/env node
/**
 * fixPrefBoxFinal.mjs — 県境検査で最後に残った5件を直す。
 *
 * 前の2本（resolvePrefBoxNg / fixPrefBoxRemainder）で26件→6件まで減った。
 * 残りは一律には直せないので、1件ずつ中身を見て決めた。
 *
 * 座標を直すもの
 *   銀山温泉  spotsは能登屋旅館・白銀の滝で銀山温泉そのもの。最寄りも大石田駅。
 *             座標だけが宮城県大崎市に落ちていた。
 *             wikipedia(38.5697,140.5311)とGSI(38.5780,140.5477)が1.6kmで一致。
 *   山崎の古い町並み  本文が「京都府大山崎町の西国街道」で、spotsの主役は
 *             国宝茶室の妙喜庵待庵（京都府大山崎町）。座標は大阪府島本町側にあった。
 *             wikipedia と GSI が妙喜庵で45m以内に一致。
 *
 * 県の宣言を直すもの（座標は動かさない）
 *   鳥海山    本文に「山形・秋田両県にまたがる」と書いてあり、spotsも
 *             鉾立（秋田）と胴腹滝（山形）に分かれている。山頂は山形県側。
 *             宣言が秋田県だけなのが実態と合っていない。
 *   四国カルスト  本文に「愛媛と高知の県境にある」とある。姫鶴平は愛媛側だが、
 *             GSIでしか引けず2ソース一致の条件を満たさないので座標は動かさない。
 *   比叡山延暦寺  idが shiga-otsu で、座標も滋賀県大津市。延暦寺の所在地は
 *             滋賀県大津市坂本本町。宣言の京都府のほうが誤り。
 *
 * 御嶽山・八ヶ岳・白神山地・しまなみ海道が既に「県A・県B」の表記なので、
 * それに合わせる。
 *
 * usage: node scripts/fixPrefBoxFinal.mjs [--apply]
 */
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];

const COORD = [
  { id: 'ginzan-onsen', lat: 38.57383, lng: 140.53941, was: '宮城県大崎市', to: '山形県尾花沢市' },
  { id: 'niche_大阪_3', lat: 34.89223, lng: 135.68059, was: '大阪府島本町', to: '京都府大山崎町' },
];
const PREF = [
  { id: 'chokai-san',    from: '秋田県', to: '秋田県・山形県' },
  { id: 'shikoku-karst', from: '愛媛県', to: '愛媛県・高知県' },
  { id: 'shiga-otsu',    from: '京都府', to: '滋賀県' },
];

const R = 6371, rad = (x) => (x * Math.PI) / 180;
const km = (a, b, c, e) => {
  const dLat = rad(c - a), dLng = rad(e - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
  return +(2 * R * Math.asin(Math.sqrt(h))).toFixed(2);
};

const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
const byId = new Map(data.map((d) => [d.id, d]));

let ng = 0;
for (const c of COORD) {
  const d = byId.get(c.id);
  if (!d) { console.log(`❌ ${c.id} が見つからない`); ng++; continue; }
  console.log(`座標 ${c.id.padEnd(16)} ${String(d.name).slice(0, 10).padEnd(12)} ${km(d.lat, d.lng, c.lat, c.lng)}km移動  ${c.was} → ${c.to}`);
  d.lat = c.lat; d.lng = c.lng;
}
for (const p of PREF) {
  const d = byId.get(p.id);
  if (!d) { console.log(`❌ ${p.id} が見つからない`); ng++; continue; }
  if (d.prefecture !== p.from) { console.log(`❌ ${p.id} の宣言が「${p.from}」ではない（${d.prefecture}）`); ng++; continue; }
  console.log(`県   ${p.id.padEnd(16)} ${String(d.name).slice(0, 10).padEnd(12)} ${p.from} → ${p.to}`);
  d.prefecture = p.to;
}
if (ng) { console.log(`\nNG ${ng}件。反映しない`); process.exit(1); }

console.log('\n熊野（三重県宣言／座標は和歌山県新宮市）はここでは触らない。');
console.log('spotsが熊野那智大社・那智の滝・瀞峡で、いずれも和歌山側。');
console.log('既存の nachikatsuura（那智勝浦）と実質重なるため、県を直すだけでは収まらない。');

if (APPLY) {
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const f of FILES) fs.writeFileSync(f, json);
  console.log('\n✅ destinations.json を更新');
} else {
  console.log('\n（--apply で反映）');
}
