#!/usr/bin/env node
/**
 * surveyQuizClusters.mjs — 診断の1,191件のうち、近い旅先（15km以内）が5件以上集まっている地域の調査（2026-11-18）。読み取りのみ。サイトのファイルは変えない。
 *   群の作り方: 各旅先から 15km 以内の旅先（自分を含めて）が5件以上ある旅先を「芯」とし、芯どうしが15km以内でつながるものを1つの地域にする（DBSCAN と同じ・eps=15km・minPts=5）。
 *   芯から15km以内にある芯でない旅先も、その地域に入れる。座標は src/data/destinations.json（診断の x,y は投影した値なので使わない）。
 *   各地域: 件数・名前とURL・Search Console の表示/クリック（logs/gsc の記録。無い分は null）・内部リンク（dist の旅先ページ以外のHTMLから、その旅先ページへの href を持つページ数。診断 /quiz/ 配下は除く）・同名/重複の疑い。
 * usage: node scripts/surveyQuizClusters.mjs   出力: logs/quiz_20261118b/cluster_survey.json（dist が要る）
 */
import fs from 'fs';
import path from 'path';

const quiz = JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8'));
const dest = new Map(JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')).map((d) => [d.id, d]));
const all = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const EPS = 15, MINPTS = 5, R = 6371;
const km = (a, b) => { const r = (x) => (x * Math.PI) / 180; const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const pts = quiz.map((q) => { const d = dest.get(q.id); return { ...q, lat: d.lat, lng: d.lng, name: q.name }; });
const n = pts.length;
const nb = pts.map((p, i) => { const a = []; for (let j = 0; j < n; j++) if (km(p, pts[j]) <= EPS) a.push(j); return a; });
const core = nb.map((a) => a.length >= MINPTS);
// 芯どうしをつなぐ（union-find）
const par = Array.from({ length: n }, (_, i) => i); const find = (x) => (par[x] === x ? x : (par[x] = find(par[x])));
for (let i = 0; i < n; i++) if (core[i]) for (const j of nb[i]) if (core[j]) par[find(i)] = find(j);
const groups = new Map();
for (let i = 0; i < n; i++) { if (!core[i]) continue; const r = find(i); (groups.get(r) || groups.set(r, new Set()).get(r)).add(i); }
for (let i = 0; i < n; i++) { if (core[i]) continue; const c = nb[i].find((j) => core[j]); if (c !== undefined) groups.get(find(c)).add(i); }   // 芯でない旅先は、近い芯の地域に入れる
// Search Console（記録）
const gscFile = fs.readdirSync('logs/gsc').filter((f) => /^perf_pages_.*\.csv$/.test(f)).sort().pop();
const gsc = new Map();
for (const line of fs.readFileSync(path.join('logs/gsc', gscFile), 'utf8').split('\n').slice(1)) { const m = line.match(/^(\S+?),(\d+),(\d+),/); if (m) gsc.set(m[1].replace('https://tabidokoiko.com', ''), { clicks: +m[2], impressions: +m[3] }); }
// 内部リンク（dist）
const links = new Map(); const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (p === 'dist/quiz' || p === 'dist/_astro' || p === 'dist/images') continue; walk(p); } else if (e.name.endsWith('.html')) { const t = fs.readFileSync(p, 'utf8'); const self = '/' + path.relative('dist', path.dirname(p)) + '/'; const seen = new Set(); for (const m of t.matchAll(/href="(\/destinations\/[^/"#?]+\/)"/g)) if (m[1] !== self) seen.add(m[1]); for (const u of seen) links.set(u, (links.get(u) || 0) + 1); } } };
walk('dist');
const sameName = new Map(); for (const d of all) (sameName.get(d.name) || sameName.set(d.name, []).get(d.name)).push(d.id);
const out = [];
for (const set of groups.values()) {
  const idx = [...set]; if (idx.length < MINPTS) continue;
  const mem = idx.map((i) => pts[i]);
  const lat = mem.reduce((s, p) => s + p.lat, 0) / mem.length, lng = mem.reduce((s, p) => s + p.lng, 0) / mem.length;
  const prefs = {}; for (const p of mem) prefs[p.prefecture] = (prefs[p.prefecture] || 0) + 1;
  const items = mem.map((p) => {
    const g = gsc.get(p.url) || null; const d = dest.get(p.id);
    const dup = []; if ((sameName.get(p.name) || []).length > 1) dup.push(`同名: ${sameName.get(p.name).join(',')}`);
    for (const q of mem) if (q.id !== p.id && km(p, q) < 1) dup.push(`1km未満: ${q.name}`);
    for (const q of mem) if (q.id !== p.id && (q.name.includes(p.name) || p.name.includes(q.name)) && !dup.some((x) => x.includes(q.name))) dup.push(`名前が重なる: ${q.name}`);
    return { id: p.id, name: p.name, prefecture: p.prefecture, url: p.url, code: p.code, win: p.win, type: d.type, gsc: g, 内部リンク: links.get(p.url) || 0, 疑い: dup };
  }).sort((a, b) => b.win - a.win);
  out.push({ 件数: items.length, 重心: [+lat.toFixed(2), +lng.toFixed(2)], 県: prefs, win合計: items.reduce((s, x) => s + x.win, 0), 表示: items.reduce((s, x) => s + (x.gsc?.impressions || 0), 0), クリック: items.reduce((s, x) => s + (x.gsc?.clicks || 0), 0), items });
}
out.sort((a, b) => b.件数 - a.件数);
fs.writeFileSync('logs/quiz_20261118b/cluster_survey.json', JSON.stringify({ 条件: `15km以内に自分を含め${MINPTS}件以上（DBSCAN eps=15km minPts=5）`, gsc記録: gscFile, 地域数: out.length, 地域: out }, null, 1));
console.log('地域', out.length, '件数', out.map((g) => g.件数).join(','), '/ 合計', out.reduce((s, g) => s + g.件数, 0), '/', n, '  GSC:', gscFile, '行', gsc.size);
for (const g of out) console.log(`${g.件数}件 重心${g.重心} 県${JSON.stringify(g.県)} win${g.win合計} 表示${g.表示} クリック${g.クリック}`);
