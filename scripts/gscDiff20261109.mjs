// 11/6 と 11/9 の URL検査を並べる（読み取りのみ）。使い方: node scripts/gscDiff20261109.mjs [前の日付] [後の日付]
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [A, B] = [process.argv[2] ?? '2026-11-06', process.argv[3] ?? '2026-11-09'];
const rd = (d) => new Map(fs.readFileSync(path.join(root, `logs/gsc/inspect_${d}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error).map((r) => [decodeURIComponent(r.url), r]));
const a = rd(A), b = rd(B);
const jp = (u) => /[^\x00-\x7F]/.test(u); // 比べる側のキーは decode 済み。日本語を含む URL
const cnt = (m, f) => [...m.values()].filter(f).length;
console.log(`記録: ${A} ${a.size}件 / ${B} ${b.size}件 / 共通 ${[...b.keys()].filter((u) => a.has(u)).length}件`);
for (const [n, m] of [[A, a], [B, b]]) {
  const jps = [...m.values()].filter((r) => jp(decodeURIComponent(r.url)));
  console.log(`\n[${n}] 日本語URL(%エンコード) ${jps.length}件: sitemap欄あり ${jps.filter((r) => (r.sitemap ?? []).length).length} / なし ${jps.filter((r) => !(r.sitemap ?? []).length).length}`);
  const asc = [...m.values()].filter((r) => !jp(decodeURIComponent(r.url))); console.log(`  ASCII URL ${asc.length}件: sitemap欄あり ${asc.filter((r) => (r.sitemap ?? []).length).length}`);
  const cs = {}; for (const r of m.values()) cs[r.coverageState ?? '(なし)'] = (cs[r.coverageState ?? '(なし)'] ?? 0) + 1;
  console.log('  coverageState:', Object.entries(cs).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${v}`).join(' / '));
  console.log(`  verdict PASS ${cnt(m, (r) => r.verdict === 'PASS')} / 一度もクロールされていない(lastCrawlTime なし) ${cnt(m, (r) => !r.lastCrawlTime)}`);
}
const tr = {}; const ex = {};
for (const [u, r] of b) { const p = a.get(u); if (!p) continue; const k = `${p.coverageState} → ${r.coverageState}`; if (p.coverageState !== r.coverageState) { tr[k] = (tr[k] ?? 0) + 1; (ex[k] ??= []).push(u.replace('https://tabidokoiko.com', '')); } }
console.log('\ncoverageState が変わった URL:');
for (const [k, v] of Object.entries(tr).sort((x, y) => y[1] - x[1])) console.log(`  ${k}: ${v}件 例 ${ex[k].slice(0, 3).join(' , ')}`);
const lost = [...a].filter(([u, r]) => r.verdict === 'PASS' && b.get(u)?.verdict !== 'PASS');
const gain = [...b].filter(([u, r]) => r.verdict === 'PASS' && a.get(u)?.verdict !== 'PASS');
console.log(`\nPASS を外れた ${lost.length}件 / PASS になった ${gain.length}件`);
const lk = {}; for (const [u] of lost) { const r = b.get(u); const k = r ? `${r.coverageState}` : '(今回なし)'; lk[k] = (lk[k] ?? 0) + 1; }
console.log('  外れた先:', JSON.stringify(lk));
console.log('  外れた例:', lost.slice(0, 6).map(([u]) => u.replace('https://tabidokoiko.com', '')).join(' , '));
const lostPrev = lost.map(([u]) => ({ jp: jp(u), hub: /\/hub\//.test(u), dest: /\/destinations\//.test(u) }));
console.log(`  外れたうち 旅先 ${lostPrev.filter((x) => x.dest).length} / ハブ ${lostPrev.filter((x) => x.hub).length} / 日本語URL ${lostPrev.filter((x) => x.jp).length}`);
const crawlNew = [...b].filter(([u, r]) => r.lastCrawlTime && !a.get(u)?.lastCrawlTime).length;
console.log(`一度もクロールされていなかったが、今回はクロール済みになった: ${crawlNew}件`);
