#!/usr/bin/env node
/**
 * checkQuizCoords.mjs — 診断の旅先の座標が、明らかにずれていないかの点検（2026-11-18）。直さない。一覧にするだけ。
 *   A. 海の上: Natural Earth（10m・日本の輪郭）の陸の中に入っていない旅先。最寄りの海岸線の頂点までの距離（km）つき（頂点間の距離なので目安。小さな島は輪郭に無いことがある）
 *   B. 県の外れ（推測）: 同じ県の旅先のうち、いちばん近い別の旅先まで 120km 以上離れているもの（県の形そのものは持っていないので、座標の外れ値としての目安）
 * usage: node scripts/checkQuizCoords.mjs <ne_10m_admin_0_countries.geojson>    出力: logs/quiz_20261117/coords_check.json
 */
import fs from 'fs';
import { geoContains, geoDistance } from 'd3-geo';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('usage: node scripts/checkQuizCoords.mjs <ne_10m_admin_0_countries.geojson>'); process.exit(1); }
const jp = JSON.parse(fs.readFileSync(src, 'utf8')).features.find((f) => f.properties.ADMIN === 'Japan');
const polys = jp.geometry.coordinates.map((p) => ({ type: 'Polygon', coordinates: p }));
const boxes = polys.map((g) => { const xs = g.coordinates[0].map((c) => c[0]), ys = g.coordinates[0].map((c) => c[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
const verts = jp.geometry.coordinates.flatMap((p) => p[0]);
const dest = Object.fromEntries(JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')).map((d) => [d.id, d]));
const quiz = JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8'));
const R = 6371;
const sea = [];
for (const q of quiz) {
  const d = dest[q.id]; const pt = [d.lng, d.lat];
  let inside = false;
  for (let i = 0; i < polys.length && !inside; i++) { const b = boxes[i]; if (pt[0] < b[0] || pt[0] > b[2] || pt[1] < b[1] || pt[1] > b[3]) continue; if (geoContains(polys[i], pt)) inside = true; }
  if (!inside) { let m = Infinity; for (const v of verts) { const g = geoDistance(pt, v); if (g < m) m = g; } sea.push({ id: q.id, name: q.name, prefecture: q.prefecture, lat: d.lat, lng: d.lng, 最寄りの海岸線の頂点までkm: +(m * R).toFixed(1) }); }
}
const byPref = new Map(); for (const q of quiz) { const l = byPref.get(q.prefecture) || []; l.push(q); byPref.set(q.prefecture, l); }
const far = [];
for (const [pref, list] of byPref) {
  if (list.length < 2) continue;
  for (const a of list) {
    let m = Infinity; for (const b of list) if (b !== a) { const g = geoDistance([dest[a.id].lng, dest[a.id].lat], [dest[b.id].lng, dest[b.id].lat]) * R; if (g < m) m = g; }
    if (m >= 120) far.push({ id: a.id, name: a.name, prefecture: pref, lat: dest[a.id].lat, lng: dest[a.id].lng, 同じ県の最寄りの旅先までkm: +m.toFixed(0) });
  }
}
const out = { 旅先数: quiz.length, 海の上_陸の外: sea.sort((a, b) => b.最寄りの海岸線の頂点までkm - a.最寄りの海岸線の頂点までkm), 県の外れ_推測: far.sort((a, b) => b.同じ県の最寄りの旅先までkm - a.同じ県の最寄りの旅先までkm) };
fs.writeFileSync('logs/quiz_20261117/coords_check.json', JSON.stringify(out, null, 1));
console.log(`陸の外: ${sea.length}件（うち海岸線の頂点から5km超 ${sea.filter((s) => s.最寄りの海岸線の頂点までkm > 5).length}件）／ 同じ県の最寄りまで120km以上: ${far.length}件`);
