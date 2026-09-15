#!/usr/bin/env node
/**
 * resolvePrefBoxNg.mjs — 座標が別の県に落ちていた旅先の、正しい座標を引き直す。
 *
 * auditAllPrefBox で県が食い違った26件のうち、複数県表記（「長野県・岐阜県」など）
 * による誤検出を除いた17件が対象。
 * 引き方は以前18件を直したときと同じで、4ソースから取って
 * 独立2ソースが5km以内で一致したものだけを採る。
 *   ja.Wikipedia の座標 / Wikidata の P625 / Nominatim / 国土地理院の住所検索
 * 一致しなかったものは直さない。当て推量で動かすと、いま直している問題を作り直す。
 *
 * 採用後に、その座標が宣言した県に入るかを逆ジオコーディングで確かめる。
 * そこまで通ったものだけを反映対象にする。
 *
 * usage: node scripts/resolvePrefBoxNg.mjs [--apply]
 */
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];

/** id → [ja.Wikipedia記事名, OSM/GSIの検索語] */
const TARGETS = {
  'ryujin-onsen':        ['龍神温泉', '和歌山県田辺市龍神村龍神'],
  'gokayama':            ['五箇山', '富山県南砺市相倉'],
  'oku-izumo':           ['奥出雲町', '島根県仁多郡奥出雲町三成'],
  'sakaiminato':         ['境港市', '鳥取県境港市上道町'],
  'ebino-kogen':         ['えびの高原', '宮崎県えびの市末永'],
  'oze':                 ['尾瀬', '群馬県利根郡片品村戸倉'],
  'shigaraki':           ['信楽町', '滋賀県甲賀市信楽町長野'],
  'niyodogawa':          ['仁淀川', '高知県吾川郡いの町'],
  'kisakata':            ['象潟町', '秋田県にかほ市象潟町'],
  'innoshima':           ['因島', '広島県尾道市因島土生町'],
  'ebino':               ['えびの市', '宮崎県えびの市栗下'],
  'otari-onsen':         ['小谷温泉', '長野県北安曇郡小谷村中土'],
  'uradome':             ['浦富海岸', '鳥取県岩美郡岩美町浦富'],
  'shishikui':           ['宍喰町', '徳島県海部郡海陽町宍喰浦'],
  'metasequoia':         ['メタセコイア並木', '滋賀県高島市マキノ町蛭口'],
  'gokase':              ['五ヶ瀬町', '宮崎県西臼杵郡五ヶ瀬町三ヶ所'],
  'gen_茨城_水郷筑波国定公園': ['水郷筑波国定公園', '茨城県潮来市潮来'],
};

const R = 6371, rad = (x) => (x * Math.PI) / 180;
const km = (a, b, c, e) => {
  const dLat = rad(c - a), dLng = rad(e - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
  return +(2 * R * Math.asin(Math.sqrt(h))).toFixed(2);
};
async function jget(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) }); if (r.ok) return await r.json(); }
    catch { /* 再試行 */ }
    await sleep(900 * (i + 1));
  }
  return null;
}

async function wiki(title) {
  const j = await jget('https://ja.wikipedia.org/w/api.php?action=query&prop=coordinates&colimit=max'
    + `&titles=${encodeURIComponent(title)}&format=json&formatversion=2&redirects=1`);
  const c = j?.query?.pages?.[0]?.coordinates?.[0];
  return c ? { src: 'wikipedia', lat: c.lat, lng: c.lon } : null;
}
async function wikidata(title) {
  const s = await jget('https://www.wikidata.org/w/api.php?action=wbsearchentities'
    + `&search=${encodeURIComponent(title)}&language=ja&uselang=ja&format=json&limit=3`);
  for (const h of s?.search || []) {
    const e = await jget(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${h.id}&props=claims&format=json`);
    const v = e?.entities?.[h.id]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    if (v) return { src: 'wikidata', lat: v.latitude, lng: v.longitude };
    await sleep(300);
  }
  return null;
}
async function osm(q) {
  const j = await jget('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp'
    + `&accept-language=ja&q=${encodeURIComponent(q)}`);
  const h = j?.[0];
  return h ? { src: 'osm', lat: +h.lat, lng: +h.lon } : null;
}
async function gsiSearch(q) {
  const j = await jget(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`);
  const c = j?.[0]?.geometry?.coordinates;
  return c ? { src: 'gsi', lat: c[1], lng: c[0] } : null;
}

const muniJs = await (await fetch('https://maps.gsi.go.jp/js/muni.js', { headers: UA })).text();
const muni = new Map();
for (const m of muniJs.matchAll(/MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']+)'/g)) {
  const p = m[2].split(',');
  muni.set(m[1], { pref: p[1], city: p[3] });
}
async function reversePref(lat, lng) {
  const j = await jget(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`);
  const cd = j?.results?.muniCd;
  return cd ? muni.get(String(cd).padStart(5, '0')) || muni.get(String(cd)) || null : null;
}

const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
const byId = new Map(data.map((d) => [d.id, d]));

const accept = [], reject = [];
for (const [id, [title, query]] of Object.entries(TARGETS)) {
  const d = byId.get(id);
  if (!d) { console.log(`❌ ${id} が見つからない`); continue; }

  const cands = [];
  for (const f of [() => wiki(title), () => wikidata(title), () => gsiSearch(query), () => osm(query)]) {
    const c = await f();
    if (c) cands.push(c);
    await sleep(1300);
  }

  // 2ソースが5km以内で一致する組を探す
  let pair = null;
  for (let i = 0; i < cands.length && !pair; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const dist = km(cands[i].lat, cands[i].lng, cands[j].lat, cands[j].lng);
      if (dist <= 5) { pair = [cands[i], cands[j], dist]; break; }
    }
  }
  if (!pair) {
    reject.push({ id, name: d.name, why: '2ソースが5km以内で一致しない', cands });
    console.log(`❌ ${id.padEnd(24)} ${String(d.name).slice(0, 10).padEnd(12)} 一致なし  ${cands.map((c) => `${c.src}(${c.lat.toFixed(3)},${c.lng.toFixed(3)})`).join(' ')}`);
    continue;
  }
  const lat = +((pair[0].lat + pair[1].lat) / 2).toFixed(5);
  const lng = +((pair[0].lng + pair[1].lng) / 2).toFixed(5);

  const box = await reversePref(lat, lng);
  await sleep(400);
  const moved = km(d.lat, d.lng, lat, lng);
  if (!box || box.pref !== d.prefecture) {
    reject.push({ id, name: d.name, why: `新しい座標も宣言県に入らない（${box?.pref ?? '取得できず'}${box?.city ?? ''}）`, lat, lng });
    console.log(`❌ ${id.padEnd(24)} ${String(d.name).slice(0, 10).padEnd(12)} 新座標も県外 ${box?.pref ?? '?'}${box?.city ?? ''}`);
    continue;
  }
  accept.push({ id, name: d.name, prefecture: d.prefecture, from: [d.lat, d.lng], to: [lat, lng], movedKm: moved, agree: `${pair[0].src}×${pair[1].src} ${pair[2]}km`, box });
  console.log(`✅ ${id.padEnd(24)} ${String(d.name).slice(0, 10).padEnd(12)} ${moved}km移動  ${pair[0].src}×${pair[1].src}(${pair[2]}km)  → ${box.pref}${box.city}`);
}

console.log(`\n採用 ${accept.length}件 / 見送り ${reject.length}件`);
fs.writeFileSync('logs/prefbox_resolve.json', JSON.stringify({ accept, reject }, null, 1));

if (APPLY && accept.length) {
  for (const a of accept) {
    const d = byId.get(a.id);
    d.lat = a.to[0];
    d.lng = a.to[1];
  }
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const f of FILES) fs.writeFileSync(f, json);
  console.log('✅ destinations.json を更新');
} else if (!APPLY) {
  console.log('（--apply で反映）');
}
