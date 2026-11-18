#!/usr/bin/env node
/**
 * buildMetaFixes20261118.mjs — メタ（description・seo.description・lead）と、本文の見出し（節の title）に残っていた旧値を、公式の値に直す編集（scripts/data/mergeFactFixes20261118i.json）を作る（2026-11-18）。
 *   対象: logs/priority_meta_20261118/scan_old_values_all.json（置換した値の旧値が残る全欄の洗い出し）を人が読んで決めたもの。前回の置換の記録（出典URL・値・写し）を引き継ぎ、checkPriorityFixes で写しとの照合を通す。
 */
import fs from 'fs';
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const prior = ['d', 'e', 'g', 'h'].flatMap((x) => J(`scripts/data/mergeFactFixes20261118${x}.json`).fixes.flatMap((f) => f.edits)).filter((e) => e.rule === 'P1');
const dests = J('src/data/destinations.json'); const byId = new Map(dests.map((d) => [d.id, d]));
const ref = (page, sub) => prior.find((e) => e.page === page && (e.old + e.new + (e.旧文 || '')).includes(sub));
const edits = []; const notes = [];
// [page, 欄（dest.description / dest.seo.description / article.lead / article.sections.N.title）, old, new, 参照の置換の検索語, 値の指定（省略で参照の値）]
const SPECS = [
  ['awashima-island', 'description', '船賃は片道1,980円', '船賃は片道2,840円', '1,980円'],
  ['gen_北海_天に続く道', 'description', '全長18.6km', '全長約28.1km', '18.6km'],
  ['gen_北海_天に続く道', 'seo.description', '全長18.6km', '全長約28.1km', '18.6km'],
  ['gen_北海_真鍋庭園', 'description', '7万平方メートル', '約83,000平方メートル', '7万平方メートル'],
  ['gen_北海_真鍋庭園', 'article.sections.0.title', '7万㎡', '約83,000㎡', '7万㎡'],
  ['gen_群馬_川原湯温泉', 'description', '2019年', '2020年3月', '2019年'],
  ['himeshima', 'description', '大人680円', '大人580円', '680円'],
  ['ikitsukijima', 'description', '高さ180メートル', '高さ約20メートル', '180メートル'],
  ['ikitsukijima', 'seo.description', '高さ180メートル', '高さ約20メートル', '180メートル'],
  ['ikuchijima', 'description', '入場料1,400円', '入場料1,800円', '1,400円'],
  ['irabu-island', 'description', '1741年の大津波', '1771年の大津波', '1741年'],
  ['isawa-onsen', 'description', '1日500円ほど。', 'レンタサイクルは無料（保証金1,000円は返却時に返金）。', '1日500円ほど'],
  ['megijima', 'description', '入場料700円', '入場料600円', '700円'],
  ['megijima', 'seo.description', '入場料700円', '入場料600円', '700円'],
  ['metasequoia', 'description', '国道303号', '県道小荒路牧野沢線', '国道303号'],
  ['mizusawa', 'description', '797年に', '802年に', '797年'],
  ['nima', 'description', '火曜が定休', '水曜日が定休', '火曜'],
  ['niyodogawa', 'description', '午前10〜11時', '正午前後', '午前10〜11時'],
  ['obama-fukui', 'description', '約2キロの地形', '約6kmの地形', '約2キロ'],
  ['ojika-island', 'description', '500〜800円／日', '1,500円／日', '500〜800円'],
  ['shakotan', 'description', '片道約1kmの遊歩道「チャレンカの道」', '片道約770mの遊歩道「チャレンカの小道」', '約1kmの遊歩道'],
  ['shingu-wakayama', 'description', '樹齢千年を超える', '樹齢千年の', '樹齢千年を超える'],
  ['utsukushigahara', 'description', '昭和30年代に', '昭和29年に', '昭和30年代'],
  ['ikoma-kogen', 'description', '標高約700m', '標高約540m', '標高700m'],
  ['ikoma-kogen', 'seo.description', '標高約700m', '標高約540m', '標高700m'],
  ['tateyama-kurobe', 'article.lead', '20mを超える', '20mにも迫る', '20mを超える'],
  ['tateyama-kurobe', 'article.sections.3.title', '8分間', '7分間', '8分'],
  ['gen_北海_網走湖畔温泉', 'article.sections.2.title', 'マイナス18度', 'マイナス15度', 'マイナス18度'],
  ['shirahone-onsen', 'article.sections.1.title', '300円で', '700円で', '300円'],
];
const EXTRA = process.argv.includes('--extra');   // --extra: 適用確認の拡張（見出し・メタの全欄の検査）で後から見つかった分を j ファイルに出す
const EXTRA_SPECS = [
  ['gen_北海_天塩川温泉', 'article.sections.2.title', '人口1,600人', '人口1,225人', '約1,600人'],
  ['niche_鹿児島_2', 'description', '落差40メートル', '落差18メートル', '高さ40メートル'],
];
const artCache = new Map(); const art = (id) => { if (!artCache.has(id)) artCache.set(id, J(`src/data/articles/${id}.json`)); return artCache.get(id); };
for (const [page, path, old, nw, sub] of (EXTRA ? EXTRA_SPECS : SPECS)) {
  const r = ref(page, sub); if (!r) { notes.push({ page, 理由: `参照の記録なし ${sub}` }); continue; }
  let cur; if (path.startsWith('article.')) { const ks = path.slice(8).split('.'); cur = ks.reduce((a, k) => a[k], art(page)); } else { cur = path.split('.').reduce((a, k) => a[k], byId.get(page)); }
  if (typeof cur !== 'string' || cur.split(old).length - 1 !== 1) { notes.push({ page, path, 理由: 'oldが欄に1回だけ無い', old }); continue; }
  const base = { page, rule: 'P1', 種類: r.種類, reason: `メタ・本文の見出しに旧値が残っていたので、公式の値に統一（最初の置換: 「${r.old}」→「${r.new}」）`, 公式の値: r.公式の値, 値: r.値, 出典URL: r.出典URL, snapshot: r.snapshot, 確認日: '2026-11-18', 旧文: cur.slice(Math.max(0, cur.indexOf(old) - 15), cur.indexOf(old) + old.length + 15), old, new: nw, 欄: path };
  if (path.startsWith('article.')) edits.push({ ...base, file: `src/data/articles/${page}.json`, field: path.slice(8) }); else edits.push({ ...base, file: 'src/data/destinations.json', dest: page, field: path });
}
fs.writeFileSync(EXTRA ? 'scripts/data/mergeFactFixes20261118j.json' : 'scripts/data/mergeFactFixes20261118i.json', JSON.stringify({ note: '優先ページのメタ（description・seo.description・lead）と節の見出しに残っていた旧値を、公式の値に統一（2026-11-18・メタを変えない決まりの承認済みの例外）', date: '2026-11-18', fixes: [{ id: 'I', topic: 'メタ・見出しの旧値', result: '公式で確認', sources: [], edits }] }, null, 1));
fs.writeFileSync(EXTRA ? 'logs/priority_meta_20261118/edits_report_j.json' : 'logs/priority_meta_20261118/edits_report.json', JSON.stringify({ 編集: edits.length, 見送り: notes }, null, 1)); console.log(edits.length, JSON.stringify(notes));
