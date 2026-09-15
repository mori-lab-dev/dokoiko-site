#!/usr/bin/env node
/**
 * fixOsorezanSeason.mjs — 恐山の bestSeason を開山期間に合わせる。
 *
 * destinations.json では bestSeason が「冬」になっていたが、恐山の開山は
 * 5月から10月までで、冬は閉山する。冬に勧めると、行っても門から先に入れない。
 * 記事側（src/data/articles/osorezan-area.json）はもともと
 * 「7〜8月が晴天率も高く…紅葉が始まる9〜10月も…」と書いてあり、そちらが正しい。
 *
 * 既存の bestSeason は「通年 / 冬 / 夏 / 秋 / 春 / 夏・秋 / …」という決まった
 * 語彙で持っているので、5〜10月に最も近い「夏・秋」を入れる。
 * 開山期間そのものは description 本文に「開山は5月から10月まで」と書いてある。
 *
 * usage: node scripts/fixOsorezanSeason.mjs [--apply]
 */
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];
const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));

const d = data.find((x) => x.id === 'osorezan-area');
if (!d) { console.error('❌ osorezan-area が見つからない'); process.exit(1); }

console.log(`bestSeason  ${d.bestSeason} → 夏・秋`);
console.log(`tags        ${(d.tags || []).join(',')}（冬は入っていないので変更なし）`);
console.log(`description に「開山は5月から10月まで」がある: ${String(d.description || '').includes('開山は5月から10月まで')}`);

// 冬をすすめている旅先のうち、本文で冬に入れないと書いているものが他にもないか見る
const suspects = data.filter((x) => /冬/.test(x.bestSeason || '')
  && /閉山|冬季閉鎖|冬は入れ|冬季休業|冬期休業|冬は休業/.test(x.description || ''));
if (suspects.length) {
  console.log('\n同じ食い違いが疑われるもの');
  for (const s of suspects) console.log(`  ${s.id.padEnd(22)} ${s.name.padEnd(12)} bestSeason=${s.bestSeason}`);
}

d.bestSeason = '夏・秋';

if (APPLY) {
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const f of FILES) fs.writeFileSync(f, json);
  console.log('\n✅ destinations.json を更新');
} else {
  console.log('\n（--apply で反映）');
}
