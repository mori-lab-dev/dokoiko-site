// 東北の秘湯 追加分の座標ゲート（2026-11-06）。Wikipedia / Wikidata / OSM(厳格) / 国土地理院 の独立2ソースが5km以内で一致し、
// 逆ジオコーディングで所在の県・市町村が合い、既存の旅先と3km以内で重ならないものだけ通す。
// 使い方: node scripts/tohokuHitouCoords.mjs   → logs/tohoku_hitou_coords.json
import fs from 'fs';
const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const km = (a, b, c, d) => Math.hypot((a - c) * 111, (b - d) * 111 * Math.cos((a * Math.PI) / 180));
// [id, 名前, 県, 市町村, Wikipedia記事候補, OSM名称トークン]
const CANDIDATES = [
  ['hinoemata-onsen', '檜枝岐温泉', '福島県', '檜枝岐村', ['檜枝岐温泉', '檜枝岐村'], ['檜枝岐温泉', '檜枝岐']],
  ['nakanosawa-onsen', '中ノ沢温泉', '福島県', '猪苗代町', ['中ノ沢温泉'], ['中ノ沢温泉', '中ノ沢']],
];
const existing = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const deleted = new Set(JSON.parse(fs.readFileSync('src/data/deletedIds.json', 'utf8')));
async function wiki(titles) { for (const t of titles) { try { const p = (await (await fetch(`https://ja.wikipedia.org/w/api.php?action=query&prop=coordinates&colimit=max&titles=${encodeURIComponent(t)}&format=json&formatversion=2&redirects=1`, { headers: UA })).json())?.query?.pages?.[0]; const c = p?.coordinates?.[0]; if (c) return { src: 'wikipedia', lat: c.lat, lng: c.lon, note: p.title }; } catch {} await sleep(320); } return null; }
async function wikidata(label) { try { const sj = await (await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(label)}&language=ja&uselang=ja&format=json&limit=4&origin=*`, { headers: UA })).json(); for (const hit of sj.search || []) { await sleep(220); const ent = (await (await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hit.id}&props=claims|labels&format=json&origin=*`, { headers: UA })).json()).entities?.[hit.id]; const c = ent?.claims?.P625?.[0]?.mainsnak?.datavalue?.value; if (c) return { src: 'wikidata', lat: c.latitude, lng: c.longitude, note: hit.id }; } } catch {} return null; }
async function osm(tokens, pref) { for (const token of tokens) { try { const rows = await (await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(token)}&format=json&limit=10&countrycodes=jp&addressdetails=1&namedetails=1`, { headers: UA })).json(); await sleep(1100); for (const x of rows) { const nm = [x.namedetails?.name, x.namedetails?.['name:ja'], (x.display_name || '').split(',')[0]].filter(Boolean).join(' '); const pr = x.address?.province || x.address?.state || ''; if (!nm.includes(token) || pr !== pref) continue; return { src: 'osm', lat: +x.lat, lng: +x.lon, note: nm.slice(0, 30) }; } } catch { await sleep(1100); } } return null; }
async function gsi(name) { try { const j = await (await fetch(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(name)}`, { headers: UA })).json(); await sleep(400); for (const x of Array.isArray(j) ? j : []) { const title = x.properties?.title || ''; const [lng, lat] = x.geometry?.coordinates ?? []; if (lat == null || !title.includes(name)) continue; return { src: 'gsi', lat, lng, note: title.slice(0, 30) }; } } catch {} return null; }
const out = [];
for (const [id, name, pref, city, wt, ot] of CANDIDATES) {
  const rec = { id, name, prefecture: pref, city, checks: {} };
  if (existing.some((d) => d.id === id) || deleted.has(id)) { rec.pass = false; rec.checks.duplicate = 'id重複または削除済みid'; out.push(rec); continue; }
  const srcs = []; for (const f of [() => wiki(wt), () => wikidata(name), () => osm(ot, pref), () => gsi(name)]) { const r = await f(); if (r) srcs.push(r); }
  rec.sources = srcs; let best = null;
  for (let i = 0; i < srcs.length; i++) for (let k = i + 1; k < srcs.length; k++) { const d = km(srcs[i].lat, srcs[i].lng, srcs[k].lat, srcs[k].lng); if (d <= 5 && (!best || d < best.d)) best = { a: srcs[i], b: srcs[k], d }; }
  if (!best) { rec.pass = false; rec.checks.coords = `一致なし (${srcs.map((s) => `${s.src}:${s.lat},${s.lng}`).join(' / ') || 'なし'})`; out.push(rec); console.log('❌', name, rec.checks.coords); continue; }
  rec.verifiedBy = [best.a.src, best.b.src]; rec.distanceKm = +best.d.toFixed(2);
  rec.lat = +((best.a.lat + best.b.lat) / 2).toFixed(5); rec.lng = +((best.a.lng + best.b.lng) / 2).toFixed(5);
  const j = await (await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${rec.lat}&lon=${rec.lng}&format=json&zoom=12&addressdetails=1&accept-language=ja`, { headers: UA })).json(); await sleep(1200);
  const a = j.address || {}; rec.reverse = `${a.province || a.state || '?'}${a.city || a.town || a.village || a.county || '?'}`;
  rec.checks.prefCity = (a.province || a.state) === pref && (a.city || a.town || a.village || a.county || '').includes(city.replace(/[市町村]$/, '')) ? '一致' : `不一致(${rec.reverse})`;
  const near = existing.filter((d) => typeof d.lat === 'number').map((d) => ({ name: d.name, km: km(rec.lat, rec.lng, d.lat, d.lng) })).filter((x) => x.km < 3).sort((x, y) => x.km - y.km);
  rec.checks.nearby = near.length ? near.map((x) => `${x.name}(${x.km.toFixed(1)}km)`).join(', ') : 'なし';
  rec.pass = rec.checks.prefCity === '一致' && rec.checks.nearby === 'なし';
  out.push(rec); console.log(rec.pass ? '✅' : '❌', name, rec.verifiedBy.join('×'), rec.distanceKm + 'km', rec.lat, rec.lng, rec.reverse, '近接=' + rec.checks.nearby);
}
fs.writeFileSync('logs/tohoku_hitou_coords.json', JSON.stringify(out, null, 2) + '\n');
