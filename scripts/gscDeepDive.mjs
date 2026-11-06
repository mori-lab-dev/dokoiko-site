// Search Console 取得結果の掘り下げ（2026-11-06・読み取りのみ）。保存済みの logs/gsc/*_<date>.* と、手元のデータ・本番の sitemap.xml だけを使う。
//   node scripts/gscDeepDive.mjs [--date 2026-11-06]
// 出力: logs/gsc/deepdive_<date>.md（と標準出力に要約）。サイトのコード・データは変更しない。
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { root } from './travelTimeBound.mjs';

const date = process.argv.includes('--date') ? process.argv[process.argv.indexOf('--date') + 1] : '2026-11-06';
const L = path.join(root, 'logs/gsc');
const SITE = 'https://tabidokoiko.com';
const REG = '送信して登録されました', CNI = 'クロール済み - インデックス未登録';

// ── 読み込み ──
const rows = fs.readFileSync(path.join(L, `inspect_${date}.jsonl`), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
function csv(file) {
  const t = fs.readFileSync(file, 'utf8'); const out = []; let row = [], f = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n') { row.push(f); out.push(row); row = []; f = ''; } else if (c !== '\r') f += c;
  }
  if (f || row.length) { row.push(f); out.push(row); }
  const h = out.shift(); return out.filter((r) => r.length === h.length).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
const perfDetail = csv(path.join(L, `perf_${date}.csv`));
const perfPages = csv(path.join(L, `perf_pages_${date}.csv`));
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const destById = new Map(dests.map((d) => [d.id, d]));
const nameCount = {}; for (const d of dests) nameCount[d.name] = (nameCount[d.name] || 0) + 1;

// 公開日（destinations.json に id が最初に現れたコミットの日付）
const firstAdd = new Map();
{
  const out = execFileSync('git', ['log', '-p', '-U0', '--no-color', '--format=@@%aI', '--', 'src/data/destinations.json'], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30 });
  let cur = null;
  for (const line of out.split('\n')) {
    if (/^@@\d{4}-/.test(line)) { cur = line.slice(2, 12); continue; }
    const m = line.match(/^\+ {0,6}"id": "([^"]+)"/);
    if (m && cur && (!firstAdd.has(m[1]) || cur < firstAdd.get(m[1]))) firstAdd.set(m[1], cur);
  }
}

// 本番の sitemap.xml
const smXml = await (await fetch(`${SITE}/sitemap.xml`)).text();
const smEntries = [...smXml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({ loc: m[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/)[1], lastmod: (m[1].match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || null }));
const smSet = new Set(smEntries.map((e) => e.loc)); const smLastmod = new Map(smEntries.map((e) => [e.loc, e.lastmod]));

// ── ページの特徴 ──
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
function feat(url) {
  const p = url.replace(SITE, ''); const dp = dec(p);
  let type = '固定ページ', id = null, idType = '-';
  if (p === '/') type = 'トップ';
  else if (p.startsWith('/hub/')) { type = 'ハブ'; id = dec(p.split('/')[2]); }
  else if (p.startsWith('/destinations/') && p.split('/').filter(Boolean).length === 2) {
    id = dec(p.split('/')[2]); idType = id.startsWith('gen_') ? 'gen_' : id.startsWith('niche_') ? 'niche_' : '通常'; type = '旅先';
  } else if (p.startsWith('/ouen-wari')) type = '応援割';
  const d = id && type === '旅先' ? destById.get(id) : null;
  return { url, path: p, type, id, idType, d, ascii: !/[^\x00-\x7f]/.test(dec(p)), pref: d?.prefecture || null, added: id ? firstAdd.get(id) || null : null, dup: d ? nameCount[d.name] > 1 : null, decoded: dp };
}
const F = rows.map((r) => ({ ...r, ...feat(r.url) }));
for (const f of F) { f.inSm = smSet.has(f.url); f.hasSm = Array.isArray(f.sitemap) && f.sitemap.length > 0; f.crawlMonth = f.lastCrawlTime ? f.lastCrawlTime.slice(0, 7) : '(なし)'; f.lastmod = smLastmod.get(f.url) || null; }
const imp = new Map(perfPages.map((r) => [dec(r.page), { clicks: +r.clicks, impressions: +r.impressions, position: +r.position }]));
for (const f of F) f.imp = imp.get(dec(f.url)) || null;

// ── 集計の部品 ──
const out = []; const P = (s = '') => out.push(s);
const pct = (a, b) => (b ? `${Math.round((a / b) * 1000) / 10}%` : '-');
const small = (n) => (n < 10 ? '（少ないので断定できない）' : '');
const tally = (arr, key) => { const m = new Map(); for (const x of arr) { const k = typeof key === 'function' ? key(x) : x[key]; m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
const line = (arr, key, label = '') => tally(arr, key).map(([k, n]) => `${k}: ${n}`).join(' / ');
const cross = (title, arr, key, split) => { P(`  [${title}]`); for (const [k, n] of tally(arr, key)) { const g = arr.filter((x) => (typeof key === 'function' ? key(x) : x[key]) === k); P(`    ${k} (${n}): ${split.map(([lab, fn]) => `${lab} ${g.filter(fn).length}`).join(' / ')}`); } };

P(`# Search Console 掘り下げ ${date}（読み取りのみ・保存値と手元データだけ）`); P('');
P('## 1. sitemap の「載っていない扱い」');
const sIn = F.filter((f) => f.hasSm), sOut = F.filter((f) => !f.hasSm);
P(`  検査したURL ${F.length} / 本番 sitemap.xml の <loc> ${smEntries.length}（重複除く ${smSet.size}）`);
P(`  検査したURLのうち、いま取得した sitemap.xml に載っている: ${F.filter((f) => f.inSm).length} / 載っていない: ${F.filter((f) => !f.inSm).length}`);
P(`  sitemap にあって検査していないURL: ${[...smSet].filter((u) => !rows.some((r) => r.url === u)).length}`);
P(`  API の sitemap フィールド: あり ${sIn.length} / 空 ${sOut.length}`);
P(`  あり側の値: ${[...new Set(sIn.flatMap((f) => f.sitemap))].join(', ')}`);
P(`  空 438件の 現在の sitemap.xml への掲載: 載っている ${sOut.filter((f) => f.inSm).length} / 載っていない ${sOut.filter((f) => !f.inSm).length}`);
const D = [['sitemap あり', sIn], ['sitemap 空', sOut]];
const attrs = [
  ['ページの種類', (f) => (f.type === '旅先' ? `旅先/${f.idType}` : f.type)],
  ['URLの文字', (f) => (f.ascii ? '英数字' : '日本語')],
  ['coverageState', 'coverageState'],
  ['最後のクロール月', 'crawlMonth'],
  ['sitemap.xml の lastmod', (f) => (f.lastmod ? 'あり' : 'なし')],
  ['googleCanonical', (f) => (f.googleCanonical ? 'あり' : 'なし')],
];
for (const [t, k] of attrs) { P(`  [${t}]`); for (const [lab, g] of D) P(`    ${lab} (${g.length}): ${line(g, k)}`); }
P(`  [都道府県（旅先のみ・上位）]`); for (const [lab, g] of D) P(`    ${lab}: ${tally(g.filter((f) => f.pref), 'pref').slice(0, 8).map(([k, n]) => `${k} ${n}`).join(' / ')}`);
cross('日本語URL×英数字URL での sitemap 空の率', F, (f) => (f.ascii ? '英数字' : '日本語'), [['あり', (f) => f.hasSm], ['空', (f) => !f.hasSm]]);
cross('ページの種類ごとの sitemap 空', F, (f) => (f.type === '旅先' ? `旅先/${f.idType}` : f.type), [['あり', (f) => f.hasSm], ['空', (f) => !f.hasSm]]);
{
  // 空のものが「ページごとに偏るか」: lastmod の有無・id の型・ASCII
  const e = sOut; P(`  空438件のうち: 日本語URL ${e.filter((f) => !f.ascii).length} / 英数字URL ${e.filter((f) => f.ascii).length}`);
  P(`  日本語URL ${F.filter((f) => !f.ascii).length}件のうち空: ${pct(F.filter((f) => !f.ascii && !f.hasSm).length, F.filter((f) => !f.ascii).length)} / 英数字URL ${F.filter((f) => f.ascii).length}件のうち空: ${pct(F.filter((f) => f.ascii && !f.hasSm).length, F.filter((f) => f.ascii).length)}`);
}


// 英数字URLなのに sitemap が空の群を、英数字URLで sitemap ありの群と比べる
{
  const a = F.filter((f) => f.ascii && f.hasSm), b = F.filter((f) => f.ascii && !f.hasSm);
  P(''); P(`  ■ 英数字URLだけに絞った比較: sitemap あり ${a.length} / 空 ${b.length}`);
  for (const [t, k] of [['種類', (f) => (f.type === '旅先' ? `旅先/${f.idType}` : f.type)], ['coverageState', 'coverageState'], ['最後のクロール月', 'crawlMonth'], ['lastmod', (f) => (f.lastmod ? 'あり' : 'なし')], ['公開月', (f) => f.added ? f.added.slice(0, 7) : '(旅先以外)'], ['同名あり', (f) => (f.dup === null ? '(旅先以外)' : f.dup ? '同名あり' : '同名なし')], ['表示あり', (f) => (f.imp ? '表示あり' : '表示なし')]]) { P(`    [${t}]`); P(`      あり: ${line(a, k)}`); P(`      空: ${line(b, k)}`); }
  P(`    都道府県 あり: ${tally(a.filter((f) => f.pref), 'pref').slice(0, 10).map(([k, n]) => `${k} ${n}`).join(' / ')}`);
  P(`    都道府県 空: ${tally(b.filter((f) => f.pref), 'pref').slice(0, 10).map(([k, n]) => `${k} ${n}`).join(' / ')}`);
  P(`    空のハブ: ${b.filter((f) => f.type === 'ハブ').map((f) => f.path).join(' ')}`);
  P(`    空の群の lastmod の最古〜最新: ${b.map((f) => f.lastmod).filter(Boolean).sort()[0]} 〜 ${b.map((f) => f.lastmod).filter(Boolean).sort().slice(-1)[0]} / ありの群: ${a.map((f) => f.lastmod).filter(Boolean).sort()[0]} 〜 ${a.map((f) => f.lastmod).filter(Boolean).sort().slice(-1)[0]}`);
  P(`    inspectedAt(同じ実行) の範囲: ${F.map((f) => f.inspectedAt).sort()[0].slice(11, 16)}〜${F.map((f) => f.inspectedAt).sort().slice(-1)[0].slice(11, 16)}（UTC）。空の群の検査時刻: ${b.map((f) => f.inspectedAt).sort()[0].slice(11, 16)}〜${b.map((f) => f.inspectedAt).sort().slice(-1)[0].slice(11, 16)} / ありの群: ${a.map((f) => f.inspectedAt).sort()[0].slice(11, 16)}〜${a.map((f) => f.inspectedAt).sort().slice(-1)[0].slice(11, 16)}`);
}

// sitemap のURL表記と canonical の照合
P(''); P('### sitemap.xml のURL表記と canonical の照合');
const smForm = { 'https': 0, 'http': 0, 'www付き': 0, '末尾スラッシュあり': 0, '末尾スラッシュなし(ルート以外)': 0, 'パーセント符号': 0, '符号が小文字(%e3…)': 0, '日本語のまま': 0, 'クエリ/フラグメント': 0 };
for (const u of smSet) {
  if (u.startsWith('https://')) smForm.https++; else smForm.http++;
  if (/\/\/www\./.test(u)) smForm['www付き']++;
  const pth = u.replace(/^https?:\/\/[^/]+/, '');
  if (pth.endsWith('/')) smForm['末尾スラッシュあり']++; else smForm['末尾スラッシュなし(ルート以外)']++;
  if (/%[0-9A-Fa-f]{2}/.test(u)) smForm['パーセント符号']++;
  if (/%[0-9a-f]{2}/.test(u) && /%[0-9a-f]{2}/.test(u.replace(/%[0-9A-F]{2}/g, ''))) smForm['符号が小文字(%e3…)']++;
  if (/[^\x00-\x7f]/.test(u)) smForm['日本語のまま']++;
  if (/[?#]/.test(u)) smForm['クエリ/フラグメント']++;
}
P('  sitemap.xml 側: ' + Object.entries(smForm).map(([k, v]) => `${k} ${v}`).join(' / '));
const cmp = { 'userCanonical = sitemapのURL（そのまま）': 0, '符号を戻すと一致（表記だけ違う）': 0, '実質違う': 0, 'userCanonicalなし': 0 };
const cmpG = { 'googleCanonical = sitemapのURL（そのまま）': 0, '符号を戻すと一致': 0, '実質違う': 0, 'googleCanonicalなし': 0 };
const cmpEx = [];
for (const f of F) {
  if (!f.userCanonical) cmp['userCanonicalなし']++; else if (f.userCanonical === f.url) cmp['userCanonical = sitemapのURL（そのまま）']++; else if (dec(f.userCanonical) === dec(f.url)) { cmp['符号を戻すと一致（表記だけ違う）']++; if (cmpEx.length < 2) cmpEx.push(f); } else cmp['実質違う']++;
  if (!f.googleCanonical) cmpG['googleCanonicalなし']++; else if (f.googleCanonical === f.url) cmpG['googleCanonical = sitemapのURL（そのまま）']++; else if (dec(f.googleCanonical) === dec(f.url)) cmpG['符号を戻すと一致']++; else cmpG['実質違う']++;
}
P('  userCanonical と sitemap のURL: ' + Object.entries(cmp).map(([k, v]) => `${k} ${v}`).join(' / '));
P('  googleCanonical と sitemap のURL: ' + Object.entries(cmpG).map(([k, v]) => `${k} ${v}`).join(' / '));
// 表記だけ違う側がどちらの形か（日本語のまま／符号）
{
  const diff = F.filter((f) => f.userCanonical && f.userCanonical !== f.url && dec(f.userCanonical) === dec(f.url));
  P(`  表記だけ違う ${diff.length}件: userCanonical が日本語のまま ${diff.filter((f) => /[^\x00-\x7f]/.test(f.userCanonical)).length} / sitemap のURLが日本語のまま ${diff.filter((f) => /[^\x00-\x7f]/.test(f.url)).length} / どちらも符号 ${diff.filter((f) => !/[^\x00-\x7f]/.test(f.userCanonical) && !/[^\x00-\x7f]/.test(f.url)).length}`);
  P(`  表記だけ違うものの sitemap 空: ${diff.filter((f) => !f.hasSm).length}/${diff.length}`);
}
// dist の <link rel="canonical"> と sitemap
let distOk = 0, distSame = 0, distEnc = 0, distDiff = 0, distMissing = 0; const distEx = [];
for (const f of F) {
  const rel = f.path === '/' ? 'index.html' : path.join(dec(f.path), 'index.html');
  const fp = path.join(root, 'dist', rel); if (!fs.existsSync(fp)) { distMissing++; continue; }
  const h = fs.readFileSync(fp, 'utf8'); const m = h.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/) || h.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/);
  if (!m) { distMissing++; continue; } distOk++;
  f.distCanon = m[1];
  if (m[1] === f.url) distSame++; else if (dec(m[1]) === dec(f.url)) { distEnc++; if (distEx.length < 2) distEx.push([f.url, m[1]]); } else { distDiff++; if (distEx.length < 4) distEx.push([f.url, m[1]]); }
}
P(`  dist の canonical タグ（${distOk}件を読めた・読めない ${distMissing}）と sitemap のURL: 同一 ${distSame} / 符号の表記だけ違う ${distEnc} / 実質違う ${distDiff}`);
// 本番を直接取得（各群から無作為に一部）
const sample = [...F.filter((f) => !f.hasSm).slice(0, 8), ...F.filter((f) => f.hasSm).slice(0, 8), ...F.filter((f) => !f.ascii).slice(0, 4)];
let liveSame = 0, liveEnc = 0, liveDiff = 0, liveFail = 0;
for (const f of sample) {
  try {
    const r = await fetch(f.url, { redirect: 'manual' }); const h = await r.text();
    const m = h.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/);
    if (r.status !== 200 || !m) { liveFail++; continue; }
    if (m[1] === f.url) liveSame++; else if (dec(m[1]) === dec(f.url)) liveEnc++; else liveDiff++;
  } catch { liveFail++; }
}
P(`  本番を直接取得した ${sample.length}件（空の群 8・ありの群 8・日本語URL 4）の canonical と sitemap のURL: 同一 ${liveSame} / 表記だけ違う ${liveEnc} / 実質違う ${liveDiff} / 取得できず ${liveFail}`);
P(`  重複(同じURLが sitemap に2回): ${smEntries.length - smSet.size}`);

// ── 2. 登録済みの共通点 ──
P(''); P('## 2. 登録済み(送信して登録されました)と未登録の比較（全ページ）');
const reg = F.filter((f) => f.coverageState === REG), nreg = F.filter((f) => f.coverageState !== REG);
P(`  登録済み ${reg.length} / 未登録(その他の状態) ${nreg.length}`);
const regTab = (title, key) => { P(`  [${title}]`); for (const [k] of tally(F, key)) { const g = F.filter((f) => (typeof key === 'function' ? key(f) : f[key]) === k); const r = g.filter((f) => f.coverageState === REG).length; P(`    ${k}: ${g.length}件中 登録 ${r} (${pct(r, g.length)})${small(g.length)}`); } };
regTab('URLの文字', (f) => (f.ascii ? '英数字' : '日本語'));
regTab('ID の型（旅先）', (f) => (f.type === '旅先' ? f.idType : `(${f.type})`));
regTab('sitemap フィールド', (f) => (f.hasSm ? 'あり' : '空'));
regTab('表示(検索パフォーマンス)の有無', (f) => (f.imp ? '表示あり' : '表示なし'));
regTab('同名ページの重複（旅先）', (f) => (f.dup === null ? '(旅先以外)' : f.dup ? '同名あり' : '同名なし'));
regTab('公開月（旅先・destinations.json に最初に載ったコミットの月）', (f) => (f.added ? f.added.slice(0, 7) : f.type === '旅先' ? '(不明)' : '(旅先以外)'));
// 日本語URL × ID型
P('  [日本語URL × ID型（旅先）]');
for (const [a, b] of [['英数字', '通常'], ['英数字', 'gen_'], ['英数字', 'niche_'], ['日本語', '通常'], ['日本語', 'gen_'], ['日本語', 'niche_']]) {
  const g = F.filter((f) => f.type === '旅先' && (f.ascii ? '英数字' : '日本語') === a && f.idType === b); if (!g.length) continue;
  const r = g.filter((f) => f.coverageState === REG).length; P(`    ${a} × ${b}: ${g.length}件中 登録 ${r} (${pct(r, g.length)})${small(g.length)}`);
}
// 同名重複
P('  [同名ページ（destinations.json の name が複数）]');
const dupNames = Object.entries(nameCount).filter(([, n]) => n > 1);
P(`    同名のグループ ${dupNames.length}（${dupNames.map(([n, c]) => `${n}×${c}`).join('、')}）`);
for (const [n] of dupNames) {
  const g = F.filter((f) => f.d && f.d.name === n);
  P(`    ${n}: ${g.map((f) => `${f.id}=${f.coverageState === REG ? '登録' : f.coverageState === CNI ? '未登録(クロール済)' : '未登録(' + f.coverageState.split(' - ')[0] + ')'}`).join(' / ')}`);
}
// 登録済みを一覧（IDの型と月）
P(`  登録済み ${reg.length}件の公開月: ${line(reg.filter((f) => f.type === '旅先'), (f) => (f.added ? f.added.slice(0, 7) : '(不明)'))}`);
P(`  登録済み ${reg.length}件の種類: ${line(reg, (f) => (f.type === '旅先' ? `旅先/${f.idType}` : f.type))}`);
P(`  登録済みのうち 日本語URL ${reg.filter((f) => !f.ascii).length} / 英数字URL ${reg.filter((f) => f.ascii).length}（全体では 日本語 ${F.filter((f) => !f.ascii).length} / 英数字 ${F.filter((f) => f.ascii).length}）`);

// ── 3. 検索パフォーマンス ──
P(''); P('## 3. 検索パフォーマンスの手がかり');
const withImp = F.filter((f) => f.imp);
P(`  表示のあるページ（sitemap のURLに一致）: ${withImp.length} / perf_pages の行 ${perfPages.length}（sitemap にないURLの行: ${perfPages.filter((r) => !F.some((f) => dec(f.url) === dec(r.page))).length}）`);
P(`  表示のあるページの coverageState: ${line(withImp, 'coverageState')}`);
P(`  表示のないページ(${F.length - withImp.length})の coverageState: ${line(F.filter((f) => !f.imp), 'coverageState')}`);
P(`  登録済み ${reg.length}件のうち表示あり ${reg.filter((f) => f.imp).length} (${pct(reg.filter((f) => f.imp).length, reg.length)}) / クロール済み-未登録 ${F.filter((f) => f.coverageState === CNI).length}件のうち表示あり ${F.filter((f) => f.coverageState === CNI && f.imp).length} (${pct(F.filter((f) => f.coverageState === CNI && f.imp).length, F.filter((f) => f.coverageState === CNI).length)})`);
const cniImp = withImp.filter((f) => f.coverageState === CNI);
P(`  表示ありの「クロール済み-未登録」: ${cniImp.length}ページ / 表示合計 ${cniImp.reduce((s, f) => s + f.imp.impressions, 0)}回 / クリック ${cniImp.reduce((s, f) => s + f.imp.clicks, 0)}回`);
P(`    ページ上位: ${cniImp.sort((a, b) => b.imp.impressions - a.imp.impressions).slice(0, 8).map((f) => `${f.id || f.path}(${f.imp.impressions}回)`).join('、')}`);
// その検索語
const cniUrls = new Set(cniImp.map((f) => dec(f.url)));
const qAgg = new Map();
for (const r of perfDetail) if (cniUrls.has(dec(r.page))) { const a = qAgg.get(r.query) || { imp: 0, clk: 0, pos: 0, pages: new Set() }; a.imp += +r.impressions; a.clk += +r.clicks; a.pos += +r.position * +r.impressions; a.pages.add(r.page); qAgg.set(r.query, a); }
const qList = [...qAgg.entries()].sort((a, b) => b[1].imp - a[1].imp);
P(`  上の${cniImp.length}ページに出ている検索語（日×ページ×検索語の行）: ${qList.length}種 / 表示 ${qList.reduce((s, [, a]) => s + a.imp, 0)}回（匿名化された検索語は含まない）`);
P('  上位20（表示回数 / クリック / 平均順位 / 出たページ数）:');
for (const [q, a] of qList.slice(0, 20)) P(`    ${q}: ${a.imp} / ${a.clk} / ${Math.round((a.pos / a.imp) * 10) / 10} / ${a.pages.size}`);
const oneWord = (q) => !/[\s　]/.test(q);
const qi = qList.reduce((s, [, a]) => s + a.imp, 0);
P(`  検索語が1語(空白なし)の割合: 種類 ${pct(qList.filter(([q]) => oneWord(q)).length, qList.length)} / 表示回数 ${pct(qList.filter(([q]) => oneWord(q)).reduce((s, [, a]) => s + a.imp, 0), qi)}`);
// 検索語が、ページの旅先名と一致するか
let match = 0, matchImp = 0;
for (const r of perfDetail) if (cniUrls.has(dec(r.page))) { const f = F.find((x) => dec(x.url) === dec(r.page)); const nm = f?.d?.name; if (nm && (r.query === nm || r.query.startsWith(nm))) { match += 1; matchImp += +r.impressions; } }
P(`  検索語がそのページの旅先名で始まる行: ${match}行 / 表示 ${matchImp}回（全 ${qi}回中 ${pct(matchImp, qi)}）`);
// 種類別
P('  [種類別の表示・クリック・順位（perf_pages 全ページ。順位は表示回数での加重平均）]');
const typeOf = (u) => { const f = feat(u); return f.type === '旅先' ? `旅先/${f.idType}` : f.type; };
const byT = new Map();
for (const r of perfPages) { const k = typeOf(r.page); const a = byT.get(k) || { pages: 0, imp: 0, clk: 0, pos: 0 }; a.pages++; a.imp += +r.impressions; a.clk += +r.clicks; a.pos += +r.position * +r.impressions; byT.set(k, a); }
for (const [k, a] of [...byT.entries()].sort((x, y) => y[1].imp - x[1].imp)) P(`    ${k}: ページ ${a.pages} / 表示 ${a.imp} / クリック ${a.clk} / クリック率 ${pct(a.clk, a.imp)} / 平均順位 ${Math.round((a.pos / a.imp) * 10) / 10}${small(a.pages)}`);
{
  const a = [...byT.values()].reduce((s, x) => ({ imp: s.imp + x.imp, clk: s.clk + x.clk }), { imp: 0, clk: 0 });
  P(`    合計: 表示 ${a.imp} / クリック ${a.clk} / クリック率 ${pct(a.clk, a.imp)}`);
}
// ハブごとの上位
const hubs = perfPages.filter((r) => r.page.includes('/hub/')).sort((a, b) => +b.impressions - +a.impressions).slice(0, 5);
P(`  ハブ上位: ${hubs.map((r) => `${dec(r.page.split('/')[4])}(${r.impressions}回/${r.clicks}クリック/順位${Math.round(+r.position * 10) / 10})`).join('、')}`);
// 表示ページの登録率: 表示のあるページ中の登録の割合 vs 無いページ
P(`  表示あり ${withImp.length}件中の登録率 ${pct(withImp.filter((f) => f.coverageState === REG).length, withImp.length)} / 表示なし ${F.length - withImp.length}件中の登録率 ${pct(F.filter((f) => !f.imp && f.coverageState === REG).length, F.length - withImp.length)}`);

const body = out.join('\n') + '\n';
fs.writeFileSync(path.join(L, `deepdive_${date}.md`), body);
console.log(body);
