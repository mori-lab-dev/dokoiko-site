// 置換した値（P1）の旧値が、同じページの「あらゆる文字列」（dest のすべての欄・記事のすべての欄）に残っていないかを調べる（2026-11-18・読み取りのみ）。メタ（seo.description・seo.title・lead）を含む
import fs from 'fs';
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dl = J('src/data/destinations.json'); const byId = new Map(dl.map((d) => [d.id, d]));
const edits = ['d', 'e', 'g', 'h'].flatMap((x) => J(`scripts/data/mergeFactFixes20261118${x}.json`).fixes.flatMap((f) => f.edits)).filter((e) => e.rule === 'P1');
const walk = (o, p, out) => { if (typeof o === 'string') out.push([p, o]); else if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${p}[${i}]`, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, p ? `${p}.${k}` : k, out); return out; };
const res = []; const seen = new Set();
for (const e of edits) { if (!byId.has(e.page) || !e.old || String(e.old).length < 2) continue; const key = `${e.page}|${e.old}|${e.new}`; if (seen.has(key)) continue; seen.add(key);
  const af = `src/data/articles/${e.page}.json`; const strs = [...walk(byId.get(e.page), 'dest', []), ...(fs.existsSync(af) ? walk(J(af), 'article', []) : [])];
  for (const [p, s] of strs) { if (!s.includes(e.old)) continue; if (s.includes(e.new) && !s.replace(e.new, '').includes(e.old)) continue; res.push({ page: e.page, 種類: e.種類, 置換: `${e.old} → ${e.new}`, 場所: p, 文字列: s.slice(Math.max(0, s.indexOf(e.old) - 30), s.indexOf(e.old) + 40) }); } }
fs.writeFileSync('logs/priority_meta_20261118/scan_old_values_all.json', JSON.stringify(res, null, 1)); console.log(res.length); for (const r of res) console.log(r.page, '|', r.置換.slice(0, 40), '|', r.場所, '|', r.文字列.replace(/\n/g, ' '));
