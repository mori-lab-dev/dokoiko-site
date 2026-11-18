#!/usr/bin/env node
/**
 * verifyMergeContent20261118.mjs — 統合の「事実が減っていない・増えていない」の照合（2026-11-18）。読み取りのみ。dist が要る。
 *   元の各ページ（backup/merge_20261118/ の変更前の destinations.json と記事）の文を、1つずつ、統合ページ（dist のHTML・JSON-LD）の中で探す。
 *   減っていない: 元の文（description・lead・節の title/body/info/imageAlt・spots の説明と画像の出典・modelCourse・tips・bestSeason・宿・見出し画像の出典）が、そのまま統合ページにある
 *   増えていない: 統合ページの article.groups の文は、すべて元のページの文と一致する（ページの作りを説明する description だけが新しい）
 * 出力: logs/merge_20261118/content_check.md（照合表）・content_check.json。1件でも「無い」があれば終了コード 1。
 */
import fs from 'fs';
import path from 'path';
const B = 'backup/merge_20261118';
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const before = new Map(J(`${B}/destinations.json`).map((d) => [d.id, d]));
const after = new Map(J('src/data/destinations.json').map((d) => [d.id, d]));
const pairs = J('scripts/data/mergedPages.json').pairs.filter((p) => p.hash);
const reps = [...new Set(pairs.map((p) => p.to))];
const artBefore = (id) => { const f = `${B}/articles/${id}.json`; return fs.existsSync(f) ? J(f) : null; };
const dec = (s) => s.replace(/&#38;|&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
const nz = (s) => dec(String(s)).replace(/\s+/g, '');
// 数字の食い違いの修正（scripts/data/mergeConflictFixes20261118.json）: 元の文に、承認済みの修正（公式の値への置換・確認できない数字の削除）を当てた文を「期待する文」にする
const FIX = fs.readdirSync('scripts/data').filter((f) => /^merge(Conflict|Fact)Fixes.*\.json$/.test(f)).sort().flatMap((f) => JSON.parse(fs.readFileSync(`scripts/data/${f}`, 'utf8')).fixes.flatMap((x) => x.edits))   // rule 付きの編集（優先ページ・R1/R2/R3）: 統合ページの見出しの欄（group）は、その見出しの元のページの文にだけ当てる。見どころの説明（spot）は文の単位なので、そのまま当てる。group も spot も無い編集（優先ページの記事の欄）は当てない（old が短く、無関係な文にも当たるため）
let curAll = [];   // 今照合している統合ページの全メンバー（spot の編集は、そのページの編集だけを当てる）
const fixed = (t, id) => { let x = String(t ?? ''); for (const e of FIX) { if (e.rule && !(e.group ? e.group === id : (!!e.spot && curAll.includes(e.page)))) continue; if (x.includes(e.old)) x = x.split(e.old).join(e.new); } return x; };
const rows = []; let missing = 0, extra = 0;
const strs = (o, out = []) => { if (typeof o === 'string') out.push(o); else if (Array.isArray(o)) o.forEach((x) => strs(x, out)); else if (o && typeof o === 'object') Object.values(o).forEach((x) => strs(x, out)); return out; };

for (const rep of reps) {
  const html = fs.readFileSync(`dist/destinations/${rep}/index.html`, 'utf8');
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => { try { return strs(JSON.parse(m[1])).join(''); } catch { return ''; } }).join('');
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '');
  const pageT = nz(body), ldT = nz(ld);
  const find = (t) => (pageT.includes(nz(t)) ? '統合ページの本文にある' : ldT.includes(nz(t)) ? '統合ページの構造化データ（spots）にある' : null);
  const members = pairs.filter((p) => p.to === rep).map((p) => p.from); const all = [rep, ...members]; curAll = all;
  const rd = after.get(rep);
  const spotTexts = (rd.spots || []).map((s) => nz(s.description || ''));
  const check = (src, kind, text0, opts = {}) => {
    if (!text0) return; const text = fixed(text0, src);
    let where = find(text);
    if (!where && opts.spot) {   // 同じ場所を1つにまとめた spot: 文ごとに、統合後の spot の説明に含まれるか
      const ss = String(text).match(/[^。]+。?/g) || [text];
      if (ss.every((x) => spotTexts.some((t) => t.includes(nz(x))))) where = '同じ場所の spot に統合（文は原文のまま）';
    }
    if (!where) missing++;
    rows.push({ 統合ページ: rep, 元のページ: src, 種別: kind, 文: String(text).replace(/\s+/g, ' ').slice(0, 60), 結果: where || '無い' });
  };
  for (const id of all) {
    const d = before.get(id), a = artBefore(id);
    check(id, 'description', d.description);
    if (a?.lead) check(id, 'lead', a.lead);
    for (const s of (a?.sections || [])) { check(id, '節の見出し', s.title); check(id, '節の本文', s.body); if (s.info) check(id, '節の info', s.info); }
    if (!a) for (const sp of (d.spots || [])) { check(id, 'spot（記事なし・節として表示）', sp.name); check(id, 'spot の説明（節として表示）', sp.description); }
    for (const sp of (d.spots || [])) { check(id, 'spot の説明（構造化データ）', sp.description, { spot: true }); if (sp.imageCredit && (sp.imageCredit.author || sp.imageCredit.license) && sp.imageUrl) { if (sp.imageCredit.attributionRequired === false) rows.push({ 統合ページ: rep, 元のページ: id, 種別: 'spot の画像の出典（表示義務なし）', 文: sp.imageCredit.author || '', 結果: '元のページも表示していない（パブリックドメイン・attributionRequired:false）' }); else check(id, 'spot の画像の出典', sp.imageCredit.author || ''); } }
    if (a?.modelCourse) { check(id, 'モデルコース（日帰り）', a.modelCourse.daytrip); check(id, 'モデルコース（1泊）', a.modelCourse.onenight); }
    if (a?.tips) check(id, 'tips', typeof a.tips === 'string' ? a.tips : a.tips.join('\n'));
    if (a?.bestSeason) check(id, 'bestSeason', a.bestSeason);
    if (id !== rep && d.imageCredit?.author && (d.images || [])[0]) check(id, '見出し画像の出典（元のページのヒーロー画像の出典）', d.imageCredit.author);
    if (d.featured_stay?.name) { const kept = rd.featured_stay?.name === d.featured_stay.name; const w = pageT.includes(nz(d.featured_stay.name)); if (!w) missing++; rows.push({ 統合ページ: rep, 元のページ: id, 種別: '宿', 文: d.featured_stay.name + (kept ? '（おすすめの宿のカードを残した）' : '（宿名だけ見出しの下に書いた・カードは残していない）'), 結果: w ? '統合ページの本文にある' : '無い' }); if (!kept && d.featured_stay.catchcopy) rows.push({ 統合ページ: rep, 元のページ: id, 種別: '宿のキャッチコピー', 文: d.featured_stay.catchcopy.slice(0, 40), 結果: '載せていない（宿名だけにする決定。1軒しかカードにしない）' }); }
  }
  // 増えていない: groups の文が元の文と一致するか
  const art = J(`src/data/articles/${rep}.json`);
  const srcAll = all.flatMap((id) => { const d = before.get(id), a = artBefore(id); return [d.description, a?.lead, ...(a?.sections || []).flatMap((s) => [s.title, s.body, s.info, s.imageAlt]), ...(d.spots || []).flatMap((s) => [s.name, s.description]), a?.tips, a?.bestSeason, ...(a?.modelCourse ? Object.values(a.modelCourse) : [])].filter(Boolean).map((x) => nz(fixed(x, id))); });
  const srcSet = new Set(srcAll);
  const titles = new Set(Object.values(Object.fromEntries(art.groups.map((g) => [g.id, g.title]))));
  for (const g of art.groups) {
    const texts = [g.lead, g.description, g.tips, g.bestSeason, ...(g.sections || []).flatMap((s) => [s.title, s.body, s.info]), ...(g.modelCourse ? Object.values(g.modelCourse) : [])].filter(Boolean);
    for (const t of texts) if (!srcSet.has(nz(t))) { extra++; rows.push({ 統合ページ: rep, 元のページ: g.id, 種別: '増えた文（元に無い）', 文: String(t).slice(0, 60), 結果: '元に無い' }); }
  }
  rows.push({ 統合ページ: rep, 元のページ: '-', 種別: 'ページの作りの説明（新しく書いた1か所）', 文: rd.description.slice(0, 80), 結果: '見出しの名前とページの作りだけ（事実なし）' });
}
fs.writeFileSync('logs/merge_20261118/content_check.json', JSON.stringify({ 照合: rows.length, 元の文がない: missing, 元に無い文: extra, 行: rows }, null, 1));
const md = ['| 統合ページ | 元のページ | 種別 | 文（先頭60字） | 結果 |', '|---|---|---|---|---|', ...rows.map((r) => `| ${r.統合ページ} | ${r.元のページ} | ${r.種別} | ${r.文.replace(/\|/g, '/')} | ${r.結果} |`)];
const chgs = ['changes', 'changes_b', 'changes_c'].filter((n) => fs.existsSync(`logs/conflicts_20261118/${n}.json`)).map((n) => JSON.parse(fs.readFileSync(`logs/conflicts_20261118/${n}.json`, 'utf8')));
const chg = chgs.length ? { 確認日: chgs.map((c) => c.確認日).join('・'), 変更の前後: chgs.flatMap((c) => c.変更の前後) } : null;
const chgMd = chg ? ['', '## 数字の食い違いの修正（元の文からの変更は、これだけ。確認日 ' + chg.確認日 + '）', '', '| 修正 | ファイル | 対象 | 前 | 後 |', '|---|---|---|---|---|', ...chg.変更の前後.map((c) => `| ${c.修正} | ${c.ファイル} | ${c.対象} | ${String(c.前).replace(/\n/g, '⏎').replace(/\|/g, '/')} | ${(String(c.後) || '（削除）').replace(/\n/g, '⏎').replace(/\|/g, '/')} |`), '', '詳細・出典: logs/conflicts_20261118/README.md'] : [];
fs.writeFileSync('logs/merge_20261118/content_check.md', `# 統合の照合表（2026-11-18）\n\n照合 ${rows.length}行・元の文が統合ページに無い ${missing}件・元に無い文 ${extra}件（元の文は、下の「数字の食い違いの修正」を当てたものと照合している）\n\n${md.join('\n')}\n${chgMd.join('\n')}\n`);
console.log(`照合 ${rows.length}行 / 元の文が無い ${missing} / 元に無い文 ${extra}`);
const by = {}; for (const r of rows) by[r.結果] = (by[r.結果] || 0) + 1; console.log(JSON.stringify(by));
process.exit(missing || extra ? 1 : 0);
