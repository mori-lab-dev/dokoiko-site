// 対象20件の選定（2026-11-09）。logs/gsc/_pick.json（seoPickTargets.mjs の出力）から選び、除いたものを理由つきで logs/gsc/_select.json に残す。
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = JSON.parse(fs.readFileSync(path.join(root, 'logs/gsc/_pick.json'), 'utf8'));
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const nm = new Map(); for (const d of dests) nm.set(d.name, [...(nm.get(d.name) ?? []), d.id]);
const AVG = rows.reduce((s, r) => s + r.c, 0) / rows.reduce((s, r) => s + r.i, 0);
const picked = [], excluded = [];
for (const r of rows) { // 表示回数の多い順
  const tag = r.id ?? r.url.replace('https://tabidokoiko.com', '');
  if (r.ctr >= AVG) continue; // 平均以上は対象外（除外の理由には載せない）
  if (!r.id) { excluded.push({ ...r, tag, why: /^\/hub\//.test(tag) ? 'ハブページ（title の型が旅先ページ用の指定と別。東京ハブは手書き済み）' : '旅先ページではない（トップ・一覧・about など）' }); continue; }
  const d = dests.find((x) => x.id === r.id);
  if (d.seo?.title) { excluded.push({ ...r, tag, why: '手書きの title がある' }); continue; }
  if (nm.get(d.name).length > 1) { excluded.push({ ...r, tag, why: `同名ページあり（${nm.get(d.name).join('・')}）。統合の判断待ち` }); continue; }
  if (picked.length < 20) picked.push({ ...r, tag }); 
}
fs.writeFileSync(path.join(root, 'logs/gsc/_select.json'), JSON.stringify({ avg: AVG, picked, excluded: excluded.filter((e) => e.i >= picked.at(-1).i) }, null, 1));
console.log('平均CTR', (AVG * 100).toFixed(2) + '%'); picked.forEach((p, i) => console.log(i + 1, p.id, p.name, p.i, p.c, p.pos.toFixed(1)));
console.log('--除外（対象の範囲内）'); excluded.filter((e) => e.i >= picked.at(-1).i).forEach((e) => console.log(e.i, e.tag, '|', e.why));
