#!/usr/bin/env node
/**
 * parseKagoshimaAreas.mjs — かごしま観光応援割の公式エリア区分を、公式サイトから直接読み取る。
 *
 * 区分の根拠はエリアマップ画像ではなく /stay/ の「エリアで探す」フィルタ。
 * 画像は目で読むしかないが、こちらは details > summary（エリア名）と
 * input[name=area][value=市町村名] の組でエリアと市町村の対応が機械的に取れる。
 * 画像と突き合わせて食い違いがないかも確認できる。
 *
 * usage: node scripts/parseKagoshimaAreas.mjs
 * 出力: logs/kagoshima_areas.json
 */
import fs from 'fs';

const URL = 'https://shukuhakuwari.pref.kagoshima.jp/stay/';
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) DokoIko-AreaCheck/1.0' };

const html = await (await fetch(URL, { headers: UA, signal: AbortSignal.timeout(30000) })).text();

// <details class="area-accordion"> … </details> をひとまとまりずつ取る
const blocks = html.split(/<details class="area-accordion"/).slice(1);
const areas = [];
for (const b of blocks) {
  const body = b.split('</details>')[0];
  const name = (body.match(/<summary[^>]*>\s*([^<\n]+?)\s*</) || [])[1];
  if (!name) continue;
  const towns = [...body.matchAll(/name="area"\s+value="([^"]+)"/g)].map((m) => m[1]);
  areas.push({ name, towns });
}

for (const a of areas) {
  console.log(`■ ${a.name}  (${a.towns.length})`);
  console.log(`   ${a.towns.join(' / ')}`);
}
const total = areas.reduce((n, a) => n + a.towns.length, 0);
console.log(`\nエリア ${areas.length} / 市町村 ${total}`);

// 県内の市町村は全部で43。取りこぼしがあれば区分が不完全ということ。
if (total !== 43) console.log(`⚠️ 市町村の合計が43ではない（${total}）。公式側の更新を確認すること`);

fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync('logs/kagoshima_areas.json', JSON.stringify(areas, null, 1));
console.log('→ logs/kagoshima_areas.json');
