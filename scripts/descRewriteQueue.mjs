#!/usr/bin/env node
/**
 * descRewriteQueue.mjs — リライトの順番を決める。
 *
 * 優先度は指示どおり
 *   1. 「ここでしか」を含む
 *   2. 「味わえない」を含む
 *   3. そのほかの禁止句に当たる
 *   4. それ以外で新基準に落ちる（初期の一括生成分）
 * 同じ段の中は weight（掲載の重み）が大きい順。よく見られるページから直す。
 *
 * usage: node scripts/descRewriteQueue.mjs [取り出す件数]
 * 出力: logs/desc_queue.json（先頭N件ぶんの、書き直しに要る材料を全部入れる）
 */
import fs from 'fs';
import { checkDesc } from './descStyleCheck.mjs';

const N = Number(process.argv[2] || 50);
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));

const tier = (t) => (t.includes('ここでしか') ? 1 : t.includes('味わえない') ? 2 : 3);

/**
 * gen_ / niche_ で始まる一括生成分は、spots に地理的な誤りが混ざっている。
 *   オーロラ温泉（陸別町）の spot に「天塩川流域の秘境谷」＝道北の川
 *   相乗温泉の spot に「鮫角灯台」「八戸市街地の朝市」＝100km以上離れた八戸
 *   落合温泉の spot に「弘前市周辺へのアクセス経由となる津軽伝統工芸品販売地点」
 * この材料の上に新しい文章を書くと、裏の取れない事実をきれいな文にして
 * 広げることになる。先に spots 側の監査が要るので、この回では外す。
 */
const GENERATED = /^(gen_|niche_)/;

const bad = dests
  .filter((d) => d.description && !checkDesc(d.description).ok)
  .filter((d) => !GENERATED.test(d.id))
  .map((d) => ({ d, tier: tier(d.description), w: d.weight ?? 1 }))
  .sort((a, b) => a.tier - b.tier || b.w - a.w || a.d.id.localeCompare(b.d.id));

const counts = [1, 2, 3].map((t) => bad.filter((x) => x.tier === t).length);
console.log(`基準に落ちる ${bad.length}件`);
console.log(`  1段目「ここでしか」    ${counts[0]}件`);
console.log(`  2段目「味わえない」    ${counts[1]}件`);
console.log(`  3段目 そのほか         ${counts[2]}件`);

const take = bad.slice(0, N).map(({ d, tier, w }) => ({
  id: d.id, name: d.name, prefecture: d.prefecture, destType: d.destType,
  tags: d.tags || [], tier, weight: w,
  bestSeason: d.bestSeason ?? null, mainSpot: d.mainSpot ?? null,
  railGateway: d.railGateway ?? null, busGateway: d.busGateway ?? null,
  ferryGateway: d.ferryGateway ?? null, airportGateway: d.airportGateway ?? null,
  accessHub: d.accessHub ?? null, railNote: d.railNote ?? null,
  featured_stay: d.featured_stay
    ? { name: d.featured_stay.name, catchcopy: d.featured_stay.catchcopy,
        accessStation: d.featured_stay.accessStation ?? null,
        shuttleInfo: d.featured_stay.shuttleInfo ?? null }
    : null,
  spots: (d.spots || []).filter((s) => s && typeof s === 'object')
    .map((s) => ({ name: s.name, description: s.description ?? null })),
  description: d.description,
  check: checkDesc(d.description).issues,
}));

fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync('logs/desc_queue.json', JSON.stringify(take, null, 1));
console.log(`\n先頭${take.length}件 → logs/desc_queue.json`);
for (const t of take) console.log(`  ${String(t.tier)} ${String(t.weight).padStart(3)} ${t.id.padEnd(22)} ${t.name}`);
