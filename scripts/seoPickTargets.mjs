// 検索で表示されているページの title・description 改善の対象選び（2026-11-09）。読み取りのみ。
// 使い方: node scripts/seoPickTargets.mjs [perf_pages の日付]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = process.argv[2] ?? '2026-11-06';
const rd = (f) => fs.readFileSync(path.join(root, 'logs/gsc', f), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const rows = rd(`perf_pages_${D}.csv`).map(([p, c, i, , pos]) => ({ url: decodeURIComponent(p), c: +c, i: +i, pos: +pos }));
const tc = rows.reduce((s, r) => s + r.c, 0), ti = rows.reduce((s, r) => s + r.i, 0);
console.log(`全体 クリック${tc} 表示${ti} CTR ${(tc / ti * 100).toFixed(2)}%`);
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));
const out = [];
for (const r of rows.sort((a, b) => b.i - a.i)) {
  const m = r.url.match(/\/destinations\/([^/]+)\/$/);
  const d = m && byId.get(m[1]);
  out.push({ ...r, ctr: r.c / r.i, id: d?.id, name: d?.name, pref: d?.prefecture, hasSeo: !!(d?.seo ?? d?.carFree?.seo) });
}
fs.writeFileSync(path.join(root, 'logs/gsc/_pick.json'), JSON.stringify(out, null, 1));
for (const r of out.slice(0, 60)) console.log(`${r.i}\t${r.c}\t${(r.ctr * 100).toFixed(1)}%\t${r.pos.toFixed(1)}\t${r.hasSeo ? 'SEO ' : ''}${r.id ?? r.url.replace('https://tabidokoiko.com', '')}\t${r.name ?? ''}`);
