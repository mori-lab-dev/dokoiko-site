#!/usr/bin/env node
/**
 * fixQuizCoords20261118.mjs — 座標の点検（scripts/checkQuizCoordSources.mjs）で、ずれが確認できた旅先の座標を直す（2026-11-18）。
 * 直す条件（10/13 の座標ずれの修正と同じ）: 独立した2つの情報源（ウィキペディア日本語版・同英語版・OpenStreetMap）が5km以内で一致し、
 *   どの情報源も自分の座標から5km以内に無い。新しい座標は、一致した情報源の平均。国土地理院の住所検索は票に数えない。
 * 変更前は logs/quiz_20261118/coord_fix_before.json に退避する。--apply で destinations.json（src と public/data）を書き換える。
 */
import fs from 'fs';
const R = 6371;
const km = (a, b) => { const r = (x) => (x * Math.PI) / 180; const h = Math.sin(r(b[0] - a[0]) / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(r(b[1] - a[1]) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const rows = JSON.parse(fs.readFileSync('logs/quiz_20261118/coord_sources.json', 'utf8'));
const fixes = [];
for (const r of rows) {
  const votes = Object.entries(r.情報源).filter(([k]) => !k.endsWith('参考')).map(([k, v]) => [k, [v.lat, v.lng]]);
  if (votes.length < 2) continue;
  if (votes.some(([, p]) => km(r.自分, p) <= 5)) continue;
  const agree = votes.filter(([, a], i) => votes.some(([, b], j) => j !== i && km(a, b) <= 5));
  if (agree.length < 2) continue;
  const lat = agree.reduce((s, [, p]) => s + p[0], 0) / agree.length, lng = agree.reduce((s, [, p]) => s + p[1], 0) / agree.length;
  fixes.push({ id: r.id, name: r.name, prefecture: r.prefecture, before: r.自分, after: [+lat.toFixed(4), +lng.toFixed(4)], 動かす距離km: +km(r.自分, [lat, lng]).toFixed(1), 根拠: agree.map(([k, p]) => `${k} ${p[0].toFixed(4)},${p[1].toFixed(4)}`) });
}
console.log(fixes.map((f) => `${f.name}（${f.prefecture}）${f.before} → ${f.after}（${f.動かす距離km}km）`).join('\n'));
if (process.argv.includes('--apply')) {
  fs.writeFileSync('logs/quiz_20261118/coord_fix_before.json', JSON.stringify(fixes, null, 1));
  for (const file of ['src/data/destinations.json', 'public/data/destinations.json']) {
    const t = fs.readFileSync(file, 'utf8'); const data = JSON.parse(t);
    for (const f of fixes) { const d = data.find((x) => x.id === f.id); if (d) { d.lat = f.after[0]; d.lng = f.after[1]; } }
    const indent = t.startsWith('[\n  ') ? 2 : t.startsWith('[\n ') ? 1 : 0;
    fs.writeFileSync(file, JSON.stringify(data, null, indent || undefined) + (t.endsWith('\n') ? '\n' : ''));
  }
  console.log(`${fixes.length}件を直した`);
}
