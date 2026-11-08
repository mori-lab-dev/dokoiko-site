// 対象ページの検索語と本文の素材を出す（読み取りのみ）。使い方: node scripts/seoQueries.mjs id1 id2 ...
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const D = '2026-11-06';
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const rows = fs.readFileSync(path.join(root, `logs/gsc/perf_${D}.csv`), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
// date,page,query,clicks,impressions,ctr,position
const q = new Map();
for (const r of rows) { const pg = decodeURIComponent(r[1]); const m = pg.match(/\/destinations\/([^/]+)\/$/); if (!m) continue; const o = q.get(m[1]) ?? new Map(); const k = r[2]; const e = o.get(k) ?? { c: 0, i: 0 }; e.c += +r[3]; e.i += +r[4]; o.set(k, e); q.set(m[1], o); }
for (const id of process.argv.slice(2)) {
  const d = dests.find((x) => x.id === id);
  console.log(`\n== ${id} ${d.name} ${d.prefecture}`);
  console.log('検索語:', [...(q.get(id) ?? [])].sort((a, b) => b[1].i - a[1].i).slice(0, 6).map(([k, v]) => `${k}(${v.i}/${v.c})`).join(' / '));
  console.log('spots:', (d.spots ?? []).map((s) => s.name).join('・'));
  console.log('desc:', d.description);
  console.log('seo:', d.seo?.description);
}
