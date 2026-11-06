// 2026-09 に destinations.json へ最初に載った旅先の調査（2026-11-06・読み取りのみ）。
//   node scripts/gscSept66.mjs [--date 2026-11-06] [--month 2026-09]
// 使うもの: git の履歴（destinations.json の各コミット時点の中身）、保存済みの logs/gsc/*、dist（内部リンク）。変更しない。
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { root } from './travelTimeBound.mjs';

const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const date = arg('--date', '2026-11-06'), MONTH = arg('--month', '2026-09');
const REG = '送信して登録されました', CNI = 'クロール済み - インデックス未登録';
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30 });
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

// ── 履歴: 各コミット時点の旅先ごとの中身 ──
const commits = git('log', '--reverse', '--format=%H|%aI|%s', '--', 'src/data/destinations.json').split('\n').filter(Boolean).map((l) => { const [h, d, ...s] = l.split('|'); return { h, d: d.slice(0, 10), t: d, s: s.join('|') }; });
const hist = new Map(); // id -> { first:{h,d,s}, changes:[{h,d,s,desc:boolean}], lastDesc }
let prev = new Map();
for (const c of commits) {
  let arr; try { arr = JSON.parse(git('show', `${c.h}:src/data/destinations.json`)); } catch { continue; }
  const cur = new Map();
  for (const e of arr) {
    const j = JSON.stringify(e); cur.set(e.id, { j, desc: e.description });
    let h = hist.get(e.id);
    if (!h) { hist.set(e.id, { first: c, changes: [], descFirst: e.description }); continue; }
    const p = prev.get(e.id);
    if (p && p.j !== j) h.changes.push({ ...c, desc: p.desc !== e.description });
  }
  prev = cur;
}

// ── 現在の中身・GSC・内部リンク ──
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const insp = new Map(fs.readFileSync(path.join(root, `logs/gsc/inspect_${date}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return [dec(r.url), r]; }));
const perfPages = new Map(fs.readFileSync(path.join(root, `logs/gsc/perf_pages_${date}.csv`), 'utf8').split('\n').slice(1).filter(Boolean).map((l) => { const c = l.split(','); return [dec(c[0]), { clicks: +c[1], imp: +c[2] }]; }));
const back = new Map(); // id -> Set(source page)
{
  const dist = path.join(root, 'dist'); const walk = (d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['_astro', 'images', 'data'].includes(e.name)) walk(p, o); } else if (e.name.endsWith('.html')) o.push(p); } return o; };
  for (const f of walk(dist)) {
    const src = path.relative(dist, f); const h = fs.readFileSync(f, 'utf8');
    for (const m of h.matchAll(/href="\/destinations\/([^"\/#?]+)\/?"/g)) { const id = dec(m[1]); if (src === path.join('destinations', id, 'index.html')) continue; (back.get(id) || back.set(id, new Set()).get(id)).add(src); }
  }
}
const hasArticle = (id) => fs.existsSync(path.join(root, 'src/data/articles', `${id}.json`));
const rows = dests.map((d) => {
  const h = hist.get(d.id); const url = `https://tabidokoiko.com/destinations/${d.id}/`; const r = insp.get(dec(url));
  const ch = h?.changes || [];
  return {
    id: d.id, name: d.name, pref: d.prefecture, type: d.id.startsWith('gen_') ? 'gen_' : d.id.startsWith('niche_') ? 'niche_' : '通常',
    month: h?.first.d.slice(0, 7), firstC: h?.first, state: r?.coverageState || '(未検査)', reg: r?.coverageState === REG,
    feat: !!d.featured_stay, img: (d.images?.length || 0) > 0, imgN: d.images?.length || 0, spots: (d.spots || []).length, descLen: (d.description || '').length,
    customSeo: !!(d.seo && !d.seo.auto && d.seo.title), art: hasArticle(d.id), links: back.get(d.id)?.size || 0,
    chTotal: ch.length, chDesc: ch.filter((x) => x.desc).length, descRewritten: h ? h.descFirst !== d.description : false, ch,
    imp: perfPages.get(dec(url)) || null, crawl: r?.lastCrawlTime ? r.lastCrawlTime.slice(0, 7) : '(なし)', inSm: Array.isArray(r?.sitemap) && r.sitemap.length > 0,
  };
});

// ── 出力 ──
const out = []; const P = (s = '') => out.push(s);
const med = (a) => { if (!a.length) return '-'; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '-');
const tally = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
const small = (n) => (n < 10 ? '（少ないので断定できない）' : '');
function summarize(label, g) {
  P(`  ${label}: ${g.length}件${small(g.length)}`);
  if (!g.length) return;
  P(`    型: ${tally(g, (x) => x.type).map(([k, n]) => `${k} ${n}`).join(' / ')}`);
  P(`    都道府県(上位6): ${tally(g, (x) => x.pref).slice(0, 6).map(([k, n]) => `${k} ${n}`).join(' / ')}`);
  P(`    featured_stay あり ${pct(g.filter((x) => x.feat).length, g.length)} / 画像あり ${pct(g.filter((x) => x.img).length, g.length)}（枚数の中央値 ${med(g.map((x) => x.imgN))}） / 記事ファイルあり ${pct(g.filter((x) => x.art).length, g.length)} / 個別seo title あり ${g.filter((x) => x.customSeo).length}件`);
  P(`    spots の数 中央値 ${med(g.map((x) => x.spots))} / description の字数 中央値 ${med(g.map((x) => x.descLen))} / 内部リンク(被リンクページ数) 中央値 ${med(g.map((x) => x.links))}`);
  P(`    公開後に変更されたコミット数 中央値 ${med(g.map((x) => x.chTotal))}（0回 ${g.filter((x) => !x.chTotal).length}件） / うち description が変わったコミット数 中央値 ${med(g.map((x) => x.chDesc))}（0回 ${g.filter((x) => !x.chDesc).length}件） / description が最初の文と違う ${pct(g.filter((x) => x.descRewritten).length, g.length)}`);
  P(`    表示あり ${pct(g.filter((x) => x.imp).length, g.length)} / sitemap欄あり ${pct(g.filter((x) => x.inSm).length, g.length)} / 最後のクロール月: ${tally(g, (x) => x.crawl).map(([k, n]) => `${k} ${n}`).join(' / ')}`);
  P(`    coverageState: ${tally(g, (x) => x.state).map(([k, n]) => `${k} ${n}`).join(' / ')}`);
}

const m9 = rows.filter((r) => r.month === MONTH);
P(`# ${MONTH} に destinations.json へ最初に載った旅先（読み取りのみ）`); P('');
P(`履歴: destinations.json の ${commits.length} コミットを順に読んだ（最初 ${commits[0].d}・最後 ${commits.at(-1).d}）。destinations.json に載った最初のコミットの日付を「公開日」の代わりにしている（デプロイ日ではない）。`);
P(`旅先 ${rows.length}件の公開月: ${tally(rows, (r) => r.month).map(([k, n]) => `${k} ${n}`).join(' / ')}`); P('');
P(`## 1. ${MONTH} の ${m9.length}件が載ったコミット`);
const byC = new Map(); for (const r of m9) { const k = r.firstC.h; (byC.get(k) || byC.set(k, []).get(k)).push(r); }
for (const [h, g] of [...byC.entries()].sort((a, b) => a[1][0].firstC.t.localeCompare(b[1][0].firstC.t))) {
  P(`  ${h.slice(0, 8)} ${g[0].firstC.t.slice(0, 16)} 「${g[0].firstC.s}」: ${g.length}件 / 登録 ${g.filter((x) => x.reg).length}`);
  P(`    ${g.map((x) => `${x.id}${x.reg ? '(登録)' : ''}`).join('、')}`);
}
P(''); P('## 2. 登録済みと未登録の比較');
const regs = m9.filter((r) => r.reg), nregs = m9.filter((r) => !r.reg);
summarize(`${MONTH} 登録済み`, regs); summarize(`${MONTH} 未登録`, nregs);
P(''); P('## 3. 他の月との比較');
for (const mo of ['2026-05', '2026-08']) {
  const g = rows.filter((r) => r.month === mo);
  summarize(`${mo} 登録済み`, g.filter((r) => r.reg)); summarize(`${mo} 未登録`, g.filter((r) => !r.reg));
}
P(''); P('  [型ごとの登録率: 月 × 型]');
for (const mo of ['2026-05', '2026-08', MONTH]) for (const t of ['通常', 'gen_', 'niche_']) { const g = rows.filter((r) => r.month === mo && r.type === t); if (g.length) P(`    ${mo} × ${t}: ${g.length}件中 登録 ${g.filter((r) => r.reg).length} (${pct(g.filter((r) => r.reg).length, g.length)})${small(g.length)}`); }
P('  [画像・featured_stay・記事の有無ごとの登録率: 月別]');
for (const mo of ['2026-05', '2026-08', MONTH]) for (const [lab, f] of [['featured_stay あり', (r) => r.feat], ['featured_stay なし', (r) => !r.feat], ['記事あり', (r) => r.art], ['記事なし', (r) => !r.art], ['表示あり', (r) => !!r.imp], ['表示なし', (r) => !r.imp]]) { const g = rows.filter((r) => r.month === mo && f(r)); if (g.length) P(`    ${mo} × ${lab}: ${g.length}件中 登録 ${g.filter((r) => r.reg).length} (${pct(g.filter((r) => r.reg).length, g.length)})${small(g.length)}`); }
P('');
P('## 4. 公開後に変更されたコミット(66件が触れられたコミットのメッセージ上位)');
const msg = new Map(); for (const r of m9) for (const c of r.ch) msg.set(`${c.h.slice(0, 8)} ${c.d} ${c.s}`, (msg.get(`${c.h.slice(0, 8)} ${c.d} ${c.s}`) || 0) + 1);
for (const [k, n] of [...msg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) P(`  ${n}件 ${k}`);
P('  (比較)05月の群で最も多かったコミット:');
const msg5 = new Map(); for (const r of rows.filter((r) => r.month === '2026-05')) for (const c of r.ch) msg5.set(`${c.h.slice(0, 8)} ${c.d} ${c.s}`, (msg5.get(`${c.h.slice(0, 8)} ${c.d} ${c.s}`) || 0) + 1);
for (const [k, n] of [...msg5.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)) P(`    ${n}件 ${k}`);
P(''); P(`## 5. ${MONTH} の ${m9.length}件の一覧(id / 型 / 県 / 状態 / featured / 画像 / spots / 被リンク / 変更回数)`);
for (const r of m9.sort((a, b) => a.firstC.t.localeCompare(b.firstC.t))) P(`  ${r.id} / ${r.type} / ${r.pref} / ${r.reg ? '登録' : r.state.split(' - ')[0]} / ${r.feat ? 'F' : '-'} / 画像${r.imgN} / spots${r.spots} / 被リンク${r.links} / 変更${r.chTotal}(desc${r.chDesc})`);
const body = out.join('\n') + '\n';
fs.writeFileSync(path.join(root, `logs/gsc/sept66_${date}.md`), body);
console.log(body);
