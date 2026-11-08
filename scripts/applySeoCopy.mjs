// 表示のあるページの title・description を検索語に合わせて直す（2026-11-09）。
//  入力: scripts/data/seoCopy20261109.json（id・title・description）/ logs/gsc/_select.json（変更前の表示・クリック・順位）
//  出力: destinations.json の seo を { title, description } にする（auto を外す＝手書き扱い）/ logs/seo_changes_2026-11-09.{md,json}
//  変更前の title・description は dist（直前に本番へ出した版）から読む。記録は初回だけ作り、再実行しても上書きしない。
// 使い方: node scripts/applySeoCopy.mjs [--dry]
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATE = '2026-11-09', DRY = process.argv.includes('--dry');
const copy = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/seoCopy20261109.json'), 'utf8'));
const sel = JSON.parse(fs.readFileSync(path.join(root, 'logs/gsc/_select.json'), 'utf8'));
const dp = path.join(root, 'src/data/destinations.json');
const dests = JSON.parse(fs.readFileSync(dp, 'utf8'));
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const jp = path.join(root, `logs/seo_changes_${DATE}.json`);
const have = fs.existsSync(jp) ? JSON.parse(fs.readFileSync(jp, 'utf8')) : null;
const recs = [];
for (const c of copy) {
  const d = dests.find((x) => x.id === c.id); if (!d) throw new Error('id なし ' + c.id);
  const m = sel.picked.find((p) => p.id === c.id);
  const old = have?.items.find((i) => i.id === c.id);
  let before = old?.before;
  if (!before) {
    const h = fs.readFileSync(path.join(root, 'dist/destinations', c.id, 'index.html'), 'utf8');
    before = { title: dec(h.match(/<title>([\s\S]*?)<\/title>/)[1]).trim(), description: dec(h.match(/<meta name="description" content="([^"]*)"/)[1]).trim() };
  }
  recs.push({ id: c.id, name: d.name, url: `https://tabidokoiko.com/destinations/${encodeURIComponent(c.id)}/`, before, after: { title: c.title, description: c.description },
    metricsBefore: old?.metricsBefore ?? { period: '2026-08-01〜2026-11-06（perf_pages_2026-11-06.csv）', impressions: m.i, clicks: m.c, position: Math.round(m.pos * 10) / 10 } });
  if (!DRY) d.seo = { title: c.title, description: c.description };
}
if (DRY) { console.log(`dry: ${recs.length}件`); process.exit(0); }
fs.writeFileSync(dp, JSON.stringify(dests, null, 2) + '\n');
if (!have) {
  fs.writeFileSync(jp, JSON.stringify({ date: DATE, avgCtr: sel.avg, items: recs, excluded: sel.excluded.map((e) => ({ tag: e.tag, impressions: e.i, why: e.why })) }, null, 1) + '\n');
  const L = [`# title・description の変更（${DATE}）`, '', `対象: 検索で表示のあるページのうち、クリック率が全体平均（${(sel.avg * 100).toFixed(2)}%）より低いものを表示回数の多い順に20件。`, `変更前の表示・クリック・順位は ${recs[0].metricsBefore.period}。2週間後（${'2026-11-23'}以降）の比較は npm run gsc の差分に出る。`, ''];
  recs.forEach((r, i) => L.push(`## ${i + 1}. ${r.name}（${r.id}）`, `- URL: ${r.url}`, `- 変更日: ${DATE}`, `- 変更前の表示 ${r.metricsBefore.impressions}・クリック ${r.metricsBefore.clicks}・平均順位 ${r.metricsBefore.position}`, `- 変更前 title: ${r.before.title}`, `- 変更後 title: ${r.after.title}`, `- 変更前 description: ${r.before.description}`, `- 変更後 description: ${r.after.description}`, ''));
  L.push('## 除いたページ', '', ...sel.excluded.map((e) => `- ${e.tag}（表示 ${e.i}）: ${e.why}`), '');
  fs.writeFileSync(path.join(root, `logs/seo_changes_${DATE}.md`), L.join('\n'));
}
console.log(`seo を更新: ${recs.length}件`);
