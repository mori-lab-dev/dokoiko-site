#!/usr/bin/env node
/**
 * verifyDestCoords.mjs — destination の座標を4つのソースで突き合わせる（2026-10-13）。
 *
 *   ① Wikipedia(ja)   記事の座標（prop=coordinates）
 *   ② Wikidata        P625（座標）
 *   ③ OSM Nominatim   名称＋県で検索（1req/秒・UA必須）
 *   ④ 国土地理院      住所検索（AddressSearch）
 *
 * 各ソースの座標と現在値の距離を出し、2つ以上のソースが互いに 3km 以内で一致したら「合意」とする。
 * 現在値が合意座標から 3km を超えて離れていれば修正候補。
 * 島・離島は「島の代表点」と「港」で数km違うことがあるので、合意座標は中央値で出し、
 * 採用は人（呼び出し側）が根拠を見て決める。このスクリプトはデータを書き換えない。
 *
 * usage: node scripts/verifyDestCoords.mjs id1 id2 ... [--q "id=検索語"]   例: --q "shinojima=篠島 愛知県南知多町"
 */
import fs from 'fs';

const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const ids = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--q');
const qs = Object.fromEntries(args.flatMap((a, i) => (args[i - 1] === '--q' ? [a.split(/=(.*)/s).slice(0, 2)] : [])));
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));

const rad = (x) => (x * Math.PI) / 180;
const km = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return +(2 * 6371 * Math.asin(Math.sqrt(h))).toFixed(1);
};
async function j(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) }); if (r.ok) return await r.json(); } catch { /* retry */ }
    await sleep(1000 * (i + 1));
  }
  return null;
}

async function wikipedia(title) {
  const r = await j(`https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=coordinates|pageprops&ppprop=wikibase_item&redirects=1&titles=${encodeURIComponent(title)}`);
  const p = Object.values(r?.query?.pages || {})[0];
  const c = p?.coordinates?.[0];
  return { wp: c ? { lat: c.lat, lng: c.lon, title: p.title } : null, qid: p?.pageprops?.wikibase_item || null };
}
async function wikidata(qid) {
  if (!qid) return null;
  const r = await j(`https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&entity=${qid}&property=P625`);
  const v = r?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
  return v ? { lat: v.latitude, lng: v.longitude, qid } : null;
}
async function nominatim(q) {
  await sleep(1100);
  const r = await j(`https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ja&q=${encodeURIComponent(q)}`);
  return r?.[0] ? { lat: +r[0].lat, lng: +r[0].lon, name: r[0].display_name.slice(0, 40) } : null;
}
async function gsi(q) {
  const r = await j(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`);
  const f = r?.[0];
  return f ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], name: f.properties?.title } : null;
}

for (const id of ids) {
  const d = dests.find((x) => x.id === id);
  if (!d) { console.log(`❌ ${id} が無い`); continue; }
  const cur = { lat: d.lat, lng: d.lng };
  const q = qs[id] || `${d.name} ${d.prefecture}`;
  const { wp, qid } = await wikipedia(d.name);
  const src = { Wikipedia: wp, Wikidata: await wikidata(qid), OSM: await nominatim(q), 国土地理院: await gsi(q) };
  console.log(`\n■ ${id} ${d.name}（${d.prefecture}） 現在 ${cur.lat}, ${cur.lng}   検索語: ${q}`);
  const pts = [];
  for (const [k, v] of Object.entries(src)) {
    if (!v) { console.log(`   ${k.padEnd(8)} 取得できず`); continue; }
    pts.push({ k, ...v });
    console.log(`   ${k.padEnd(8)} ${v.lat.toFixed(4)}, ${v.lng.toFixed(4)}   現在との距離 ${String(km(cur, v)).padStart(5)}km  ${v.title || v.name || v.qid || ''}`);
  }
  // 互いに 3km 以内の点が2つ以上あれば合意（中央値）
  let best = [];
  for (const p of pts) { const g = pts.filter((o) => km(p, o) <= 3); if (g.length > best.length) best = g; }
  if (best.length >= 2) {
    const m = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    const c = { lat: +m(best.map((p) => p.lat)).toFixed(4), lng: +m(best.map((p) => p.lng)).toFixed(4) };
    console.log(`   → 合意 ${best.map((p) => p.k).join('+')} = ${c.lat}, ${c.lng}   現在との距離 ${km(cur, c)}km ${km(cur, c) > 3 ? '★修正候補' : '（現在値で問題なし）'}`);
  } else console.log('   → 合意なし（人の判断が要る）');
}
