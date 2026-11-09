// 統合した旧ページ（scripts/data/mergedPages.json）の検査（2026-11-09）。dist が要る。
//  1. 旧URLが転送ページ: canonical が残す側を向く・meta refresh が残す側・noindex なし
//  2. 旧URLが sitemap.xml に載っていない（残す側は載っている）
//  3. destinations.json に旧 id が無い（残す側はある）
//  4. dist の他のページ（転送ページ以外）の内部リンクに旧URLが残っていない
// 使い方: node scripts/auditMergedPages.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const pairs = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/mergedPages.json'), 'utf8')).pairs;
const dests = new Set(JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8')).map((d) => d.id));
if (!fs.existsSync(path.join(dist, 'sitemap.xml'))) { console.log('dist なし（npm run build が要る）'); process.exit(1); }
const sitemap = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
const bad = { stub: [], sitemap: [], data: [], links: [] };
const fromSet = new Set(pairs.map((p) => p.from));
const enc = (id) => encodeURIComponent(id);
for (const { from, to } of pairs) {
  const f = path.join(dist, 'destinations', from, 'index.html');
  if (!fs.existsSync(f)) { bad.stub.push(`${from}（dist なし）`); }
  else {
    const h = fs.readFileSync(f, 'utf8');
    const canon = h.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
    const refresh = h.match(/<meta http-equiv="refresh" content="([^"]*)"/)?.[1];
    if (canon !== `https://tabidokoiko.com/destinations/${enc(to)}/`) bad.stub.push(`${from}: canonical が ${canon ?? 'なし'}`);
    if (refresh !== `0; url=/destinations/${to}/`) bad.stub.push(`${from}: meta refresh が ${refresh ?? 'なし'}`);
    if (/<meta[^>]+name="robots"[^>]*noindex/i.test(h)) bad.stub.push(`${from}: noindex がある`);
  }
  if (sitemap.includes(`/destinations/${enc(from)}/`) || sitemap.includes(`/destinations/${from}/`)) bad.sitemap.push(`${from}（sitemap に載っている）`);
  if (!sitemap.includes(`/destinations/${enc(to)}/`)) bad.sitemap.push(`${to}（残す側が sitemap に無い）`);
  if (dests.has(from)) bad.data.push(`${from}（destinations.json に残っている）`);
  if (!dests.has(to)) bad.data.push(`${to}（残す側が destinations.json に無い）`);
}
const walk = (dir, out = []) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.html')) out.push(p); } return out; };
const needles = pairs.flatMap((p) => [[p.from, `/destinations/${p.from}/`], [p.from, `/destinations/${enc(p.from)}/`]]);
const hit = new Map();
for (const f of walk(dist)) {
  const rel = path.relative(dist, f);
  const m = rel.match(/^destinations\/([^/]+)\/index\.html$/);
  if (m && fromSet.has(decodeURIComponent(m[1]))) continue; // 転送ページ自身
  const h = fs.readFileSync(f, 'utf8');
  for (const [id, n] of needles) if (h.includes(`href="${n}`) || h.includes(`"${n}"`)) { (hit.get(id) ?? hit.set(id, []).get(id)).push(rel); }
}
for (const [id, files] of hit) bad.links.push(`${id}: ${files.length}ページ（例 ${files.slice(0, 3).join(', ')}）`);
const fmt = (a) => (a.length ? ' ' + a.join(' / ') : '');
console.log(`統合した旧ページの検査 ${pairs.length}組`);
console.log(`転送ページの形が不正（canonical・meta refresh・noindex）: ${bad.stub.length}件${fmt(bad.stub)}`);
console.log(`sitemap の不整合（旧URLが載っている・残す側が無い）: ${bad.sitemap.length}件${fmt(bad.sitemap)}`);
console.log(`データの不整合（旧 id が残る・残す側が無い）: ${bad.data.length}件${fmt(bad.data)}`);
console.log(`内部リンクに旧URLが残るページ: ${bad.links.length}件${fmt(bad.links)}`);
process.exit(Object.values(bad).some((a) => a.length) ? 1 : 0);
