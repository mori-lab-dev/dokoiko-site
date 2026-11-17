#!/usr/bin/env node
/**
 * checkQuizCoordSources.mjs — 診断の座標の点検で「海岸線から5km超」になった旅先を、ほかの情報源の座標と照らす（2026-11-18）。直さず、表にする。
 *   10/13 の座標ずれの修正と同じ考え方: 独立した情報源（ウィキペディア日本語版・同英語版・OpenStreetMap Nominatim）の座標を取り、
 *   「自分の座標から5km以内に、独立した情報源があるか」と「情報源どうしが5km以内で一致しているか」を見る。
 *   国土地理院の住所検索は、施設の位置でなく地名ラベルの代表点を返すので、候補の手掛かりとして出すだけで票に数えない（CLAUDE.md の決まり）。
 * usage: node scripts/checkQuizCoordSources.mjs     入力: logs/quiz_20261117/coords_check.json   出力: logs/quiz_20261118/coord_sources.json
 */
import fs from 'fs';
const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = 6371;
const km = (a, b) => { const r = (x) => (x * Math.PI) / 180; const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2; return +(2 * R * Math.asin(Math.sqrt(h))).toFixed(1); };
async function j(url) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) }); if (r.ok) return await r.json(); } catch { /* retry */ } await sleep(1500); } return null; }
const wiki = async (lang, title) => { const d = await j(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=coordinates|pageprops&ppprop=disambiguation&redirects=1&titles=${encodeURIComponent(title)}`); const p = Object.values(d?.query?.pages || {})[0]; if (!p || p.missing !== undefined || p.pageprops) return null; const c = p.coordinates?.[0]; return c ? { title: p.title, lat: c.lat, lng: c.lon } : null; };
const todo = JSON.parse(fs.readFileSync('logs/quiz_20261117/coords_check.json', 'utf8')).海の上_陸の外.filter((x) => x.最寄りの海岸線の頂点までkm > 5);
const dest = Object.fromEntries(JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')).map((d) => [d.id, d]));
const out = [];
for (const t of todo) {
  const d = dest[t.id]; const own = [d.lat, d.lng]; const src = {};
  const titles = [d.name, d.mainSpot, `${d.name} (${d.prefecture.replace(/[県府]$/, '')})`].filter(Boolean);
  for (const lang of ['ja', 'en']) { for (const ti of titles) { const w = await wiki(lang, ti); await sleep(200); if (w) { src[`wiki_${lang}`] = w; break; } } }
  const n = await j(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&accept-language=ja&countrycodes=jp&q=${encodeURIComponent(`${d.name} ${d.prefecture}`)}`); await sleep(1100);
  if (n && n[0]) src.osm = { title: n[0].display_name.slice(0, 60), lat: +n[0].lat, lng: +n[0].lon, type: n[0].type };
  const gsi = await j(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(d.name)}`); await sleep(300);
  const gc = (gsi || []).find((g) => (g.properties?.title || '').includes(d.prefecture.replace(/[県府]$/, '')) || true);
  if (gc) src.gsi_参考 = { title: gc.properties?.title, lat: gc.geometry.coordinates[1], lng: gc.geometry.coordinates[0] };
  const row = { id: t.id, name: t.name, prefecture: t.prefecture, 自分: own, 海岸線の頂点までkm: t.最寄りの海岸線の頂点までkm, 情報源: {} };
  for (const [k, v] of Object.entries(src)) row.情報源[k] = { ...v, 自分からkm: km(own, [v.lat, v.lng]) };
  const votes = Object.entries(row.情報源).filter(([k]) => !k.endsWith('参考'));
  row.自分と5km以内で一致する独立な情報源 = votes.filter(([, v]) => v.自分からkm <= 5).map(([k]) => k);
  row.独立な情報源どうしが5km以内で一致 = votes.length >= 2 && votes.some(([, a], i) => votes.some(([, b], j) => j > i && km([a.lat, a.lng], [b.lat, b.lng]) <= 5));
  out.push(row); console.log(`${t.name}（${t.prefecture}） ${t.最寄りの海岸線の頂点までkm}km: 情報源 ${votes.map(([k, v]) => `${k}=${v.自分からkm}km`).join(' ') || 'なし'}`);
}
fs.mkdirSync('logs/quiz_20261118', { recursive: true });
fs.writeFileSync('logs/quiz_20261118/coord_sources.json', JSON.stringify(out, null, 1));
