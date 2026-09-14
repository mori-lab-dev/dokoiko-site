#!/usr/bin/env node
/**
 * buildKagoshimaAreaData.mjs — 公式のエリア区分と、そこに入る旅先を src/data/kagoshimaAreas.json に固める。
 *
 * エリア名と所属市町村は公式サイト（/stay/ の「エリアで探す」）そのまま。
 * 旅先の割り当ては assignKagoshimaAreas.mjs で2ソース一致したものを使う。
 * 一致しなかった2件だけ、verifyKagoshimaUnresolved.mjs で個別に裏を取った結果を
 * ここに明示して入れる。根拠を残しておかないと、後から見て何を信じた割り当てか分からなくなるため。
 *
 * usage: node scripts/buildKagoshimaAreaData.mjs
 */
import fs from 'fs';

const areas = JSON.parse(fs.readFileSync('logs/kagoshima_areas.json', 'utf8'));
const { resolved, unresolved } = JSON.parse(fs.readFileSync('logs/kagoshima_area_assign.json', 'utf8'));
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));

// 2ソース一致しなかったぶんの、個別に確かめた結果。
const MANUAL = {
  // 国土地理院は空を返したが、OSMとWikidataがそろって屋久島町を指した。
  yakushima: { city: '屋久島町', area: 'その他離島エリア' },
  // 種子島は西之表市・中種子町・南種子町にまたがる島。Wikidataは県までしか持っていないが、
  // 3市町とも「その他離島エリア」なので、どの市町に置いてもエリアは変わらない。
  tanegashima: { city: '西之表市・中種子町・南種子町', area: 'その他離島エリア' },
};

const SLUG = {
  '北薩摩エリア': 'hokusatsuma',
  '霧島・姶良エリア': 'kirishima-aira',
  '中薩摩エリア': 'chusatsuma',
  '南薩摩エリア': 'minamisatsuma',
  '大隅エリア': 'osumi',
  'その他離島エリア': 'ritou',
};

const assign = new Map(resolved.map((r) => [r.id, r]));
for (const u of unresolved) {
  const m = MANUAL[u.id];
  if (!m) { console.error(`❌ ${u.id} の割り当てが決まっていない`); process.exit(1); }
  assign.set(u.id, { id: u.id, name: u.name, ...m });
}

const byId = new Map(dests.map((d) => [d.id, d]));
const out = areas.map((a) => {
  const ids = [...assign.values()].filter((r) => r.area === a.name).map((r) => r.id);
  // 掲載順は県別ページと同じ weight 降順にそろえる
  ids.sort((x, y) => (byId.get(y)?.weight ?? 1) - (byId.get(x)?.weight ?? 1));
  return {
    slug: SLUG[a.name],
    name: a.name,
    short: a.name.replace(/エリア$/, ''),
    towns: a.towns,
    destIds: ids,
    cities: Object.fromEntries(ids.map((id) => [id, assign.get(id).city])),
  };
});

const missingSlug = out.filter((a) => !a.slug);
if (missingSlug.length) {
  console.error(`❌ slugが無いエリア: ${missingSlug.map((a) => a.name).join(', ')}`);
  process.exit(1);
}
const placed = out.reduce((n, a) => n + a.destIds.length, 0);
const total = dests.filter((d) => d.prefecture === '鹿児島県').length;
if (placed !== total) {
  console.error(`❌ 割り当て漏れ: ${placed} / ${total}`);
  process.exit(1);
}

fs.writeFileSync('src/data/kagoshimaAreas.json', JSON.stringify(out, null, 2) + '\n');
for (const a of out) {
  const stays = a.destIds.filter((id) => byId.get(id)?.featured_stay?.name).length;
  console.log(`${a.name.padEnd(12)} /${a.slug.padEnd(15)} 市町村${String(a.towns.length).padStart(2)}  旅先${String(a.destIds.length).padStart(2)}  宿${stays}`);
}
console.log(`\n✅ ${placed}件すべて割り当て済み → src/data/kagoshimaAreas.json`);
