#!/usr/bin/env node
/**
 * buildGapFixes20261118.mjs — 優先ページの修正の「未適用」と「同じページの旧値の食い違い」を直す編集（scripts/data/mergeFactFixes20261118g.json）を作る（2026-11-18）。
 *   前提: findPriorityGaps20261118.mjs の洗い出し（logs/priority_gap_20261118/gaps_a.json・gaps_b.json・gaps_b2.json を人が読んで決めた対象）。
 *   A 判定どおりの削除（文）: 判定の区分が 食い違い／確認できず（記載なし・特定不可）で、削除の条件の文言が合わず残っていた文、または欄が空になるため見送っていた文（見どころの説明は、空の説明が既に8件あるので許す）
 *   B 数字を含む句だけの削除: 文の他の部分を残せるもの（文が途中で切れた形にならないもの）
 *   C 置換した値の旧値が、同じページの別の欄（本文・info・lead・モデルコース）に残っていたものを、公式の値に統一（出典・値・写しは、最初の置換の記録を引き継ぐ）
 *   D モデルコースの時刻が公式の開園時刻と矛盾するものは、時刻だけを外す（優先ページのモデルコースの規則）
 * 出力: scripts/data/mergeFactFixes20261118g.json
 */
import fs from 'fs';
const D = 'logs/priority_fix_20261118'; const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dests = J('src/data/destinations.json'); const byId = new Map(dests.map((d) => [d.id, d]));
const arts = new Map(); for (const d of dests) { const f = `src/data/articles/${d.id}.json`; if (fs.existsSync(f)) arts.set(d.id, J(f)); }
const prior = ['d', 'e'].flatMap((x) => J(`scripts/data/mergeFactFixes20261118${x}.json`).fixes.flatMap((f) => f.edits));
const TIME_LEAD = /(^|→\s*|[：:】]\s*|\n\s*)((?:[0-9０-９]{1,2}:[0-9０-９]{2})|(?:[0-9０-９]{1,2}時(?:[0-9０-９]{1,2}分)?))(?:頃|ごろ)?\s*/;
const fieldsOf = (id) => { const a = arts.get(id), d = byId.get(id), file = `src/data/articles/${id}.json`, out = [];
  const scan = (h, group) => { out.push({ file, group, field: 'lead', type: 'lead', get: () => h.lead, set: (v) => { h.lead = v; } }); (h.sections || []).forEach((s, i) => { out.push({ file, group, field: `sections.${i}.body`, type: 'body', get: () => s.body, set: (v) => { s.body = v; } }); if (s.info) out.push({ file, group, field: `sections.${i}.info`, type: 'info', get: () => s.info, set: (v) => { s.info = v; } }); }); if (typeof h.tips === 'string') out.push({ file, group, field: 'tips', type: 'tips', get: () => h.tips, set: (v) => { h.tips = v; } }); if (h.modelCourse) for (const k of Object.keys(h.modelCourse)) out.push({ file, group, field: `modelCourse.${k}`, type: 'modelCourse', get: () => h.modelCourse[k], set: (v) => { h.modelCourse[k] = v; } }); };
  if (a) { if (a.groups) for (const g of a.groups) scan(g, g.id); else scan(a); }
  for (const sp of d.spots || []) if (sp.description) out.push({ file: 'src/data/destinations.json', spot: [d.id, sp.name], type: 'spot', get: () => sp.description, set: (v) => { sp.description = v; } }); return out; };
const edits = []; const notes = [];
const meta = (page, n) => { const r = J(`${D}/results/${page}.json`), inp = J(`${D}/inputs/page_${page}.json`); const j = r.判定.find((x) => x.n === n), u = inp.文.find((x) => x.番号 === n), g = (r.グループ || []).find((x) => x.g === j.g) || {}; return { j, u, 出典URL: g.出典URL || [], snapshot: g.snapshot || '', 種類: u.種類 }; };
const push = (f, e) => { edits.push({ ...e, file: f.file, ...(f.group ? { group: f.group } : {}), ...(f.spot ? { spot: f.spot } : { field: f.field }) }); };
const apply = (f, old, nw, e) => { const cur = f.get(); if (typeof cur !== 'string' || cur.split(old).length - 1 !== 1) { notes.push({ page: e.page, 理由: 'oldが欄に1回だけ無い', old: old.slice(0, 40) }); return false; } f.set(cur.replace(old, nw)); push(f, { ...e, old, new: nw }); return true; };
const EXTRA = process.argv.includes('--extra');   // --extra: 洗い出しの追加分（info の行の中の文）だけを h ファイルに出す
// A: 文の削除
const unitsOf = (text, type) => String(text).split('\n').flatMap((l) => type === 'info' ? (l.trim() ? [l.trim()] : []) : (l.match(/[^。]+。?/g) || []).map((x) => x.trim()).filter(Boolean));
const delSentence = (page, n, rule) => { const m = meta(page, n); const s = m.u.文.trim(); let did = 0;
  for (const f of fieldsOf(page)) { if (!['body', 'info', 'tips', 'spot'].includes(f.type)) continue; const cur = f.get(); if (typeof cur !== 'string') continue; const lines = cur.split('\n'); const hits = []; lines.forEach((l, li) => { if (l.trim() === s) hits.push({ li, whole: true, raw: l }); else if (f.type !== 'info') for (const x of (l.match(/[^。]+。?/g) || [])) if (x.trim() === s) hits.push({ li, whole: false, raw: x }); }); if (hits.length !== 1) { if (hits.length > 1) notes.push({ page, n, 理由: '同じ文が同じ欄に複数' }); continue; }
    const h = hits[0]; const old = h.whole ? (h.li === lines.length - 1 ? (h.li > 0 ? '\n' + h.raw : h.raw) : h.raw + '\n') : h.raw;
    const accepted = m.j.判定 === '食い違い' ? '食い違い' : `確認できず（${m.j.理由}）`;
    if (apply(f, old, '', { page, rule, 種類: m.種類, reason: `${accepted}。文を削除（前回の公開で、判定の区分は削除の対象だったが、${rule === 'P2' && /公式に記載なし/.test(m.j.理由 || '') ? '判定の理由の文言が削除の条件と一致せず未適用だった' : '欄が空になるため見送っていた'}）`, 公式の値: m.j.公式の値 || '', 値: [], 出典URL: m.出典URL, snapshot: m.snapshot, 確認日: '2026-11-18', 削除した文: s })) did++; }
  if (!did) notes.push({ page, n, 理由: '削除できず' }); };
if (!EXTRA) for (const [p, n, r] of [['suo-oshima', 1, 'P2'], ['suo-oshima', 2, 'P2'], ['suo-oshima', 3, 'P2'], ['suo-oshima', 14, 'P2'], ['isawa-onsen', 1, 'P2'], ['isawa-onsen', 3, 'P2'], ['isawa-onsen', 12, 'P2'], ['gen_茨城_水戸八幡宮', 15, 'P1d'], ['ojika-island', 13, 'P1d'], ['mihara', 17, 'P2'], ['okinoerabu', 2, 'P2']]) delSentence(p, n, r);
// B: 数字を含む句だけの削除（文の他の部分を残す）
const delPhrase = (page, n, phrase, rule) => { const m = meta(page, n); const s = m.u.文.trim(); let did = 0; for (const f of fieldsOf(page)) { if (!['spot', 'info'].includes(f.type)) continue; const cur = f.get(); if (!cur || !cur.includes(s)) continue; if (apply(f, phrase, '', { page, rule, 種類: m.種類, reason: `${m.j.判定 === '食い違い' ? '食い違い' : `確認できず（${m.j.理由}）`}。数字を含む句だけを削除（文は途中で切れない。欄が空にならない）`, 公式の値: m.j.公式の値 || '', 値: [], 出典URL: m.出典URL, snapshot: m.snapshot, 確認日: '2026-11-18', 削除した文: phrase, 旧文: s })) did++; } if (!did) notes.push({ page, n, 理由: '句を削除できず' }); };
if (!EXTRA) for (const [p, n, ph, r] of [['ibukijima', 10, '50段ほどの', 'P2'], ['kashiwajima', 32, '透明度30メートル超の', 'P2'], ['makurazaki', 17, '朝5時から', 'P2'], ['shoji-ueshima', 3, '標高千三百メートルの', 'P1d']]) delPhrase(p, n, ph, r);
if (EXTRA) for (const [p, n, ph, r] of [['ginzan-onsen', 17, '日中（11時〜16時）は日帰り観光客で混雑。', 'P2'], ['shimekappu', 12, 'マイナス20度以下になることあり', 'P2']]) delPhrase(p, n, ph, r);
// C: 旧値の統一（最初の置換の記録を引き継ぐ）
const ref = (page, sub) => prior.find((e) => e.page === page && e.rule === 'P1' && (e.old + e.new + (e.旧文 || '')).includes(sub));
const unify = (page, type, anchor, old, nw, refSub, vals) => { const r = ref(page, refSub); if (!r) { notes.push({ page, 理由: `参照の記録なし ${refSub}` }); return; } let did = 0; for (const f of fieldsOf(page)) { if (type && f.type !== type) continue; const cur = f.get(); if (typeof cur !== 'string' || !cur.includes(anchor)) continue; if (apply(f, old, nw, { page, rule: 'P1', 種類: r.種類, reason: `同じページの別の欄に旧値が残っていたので、公式の値に統一（最初の置換: 「${r.old}」→「${r.new}」）`, 公式の値: r.公式の値, 値: vals || r.値, 出典URL: r.出典URL, snapshot: r.snapshot, 確認日: '2026-11-18', 旧文: anchor })) did++; } if (!did) notes.push({ page, 理由: '統一できず', old }); };
if (!EXTRA) unify('muroto-cape', 'body', '入場料200円。', '入場料200円', '入場料は無料', '200円');
if (!EXTRA) unify('suo-oshima', 'body', '30分食べ放題、という形が多い。', '30分食べ放題', '1時間の食べ放題', '食べ放題30分');
if (!EXTRA) unify('metasequoia', 'body', '国道303号沿いに、突然現れる。', '国道303号', '県道小荒路牧野沢線', '国道303号');
if (!EXTRA) unify('tateyama-kurobe', 'lead', '雪壁が20mを超える場所', '20mを超える', '20mにも迫る', '20mを超える');
if (!EXTRA) unify('tateyama-kurobe', 'info', '所要時間：約8分', '約8分', '約7分', '8分', ['7分']);
if (!EXTRA) unify('ikoma-kogen', 'lead', '標高約700m。', '標高約700m', '標高約540m', '標高700m', ['540']);
if (!EXTRA) unify('aogashima', 'modelCourse', 'ふれあいサウナ（200円）', '（200円）', '（大人300円）', '200円');
if (!EXTRA) unify('hijori-onsen', 'modelCourse', '日帰り入浴（300〜500円', '300〜500円', '300〜600円', '300〜500円');
// D: モデルコースの時刻（公式の開園 9:00 より前の 8:30 着）
if (!EXTRA) { const r = ref('ikoma-kogen', '8:30'); for (const f of fieldsOf('ikoma-kogen')) { if (f.type !== 'modelCourse') continue; const cur = f.get(); if (!cur || !cur.includes('8:30 生駒高原着')) continue; const old = '8:30 生駒高原着'; const nw = old.replace(TIME_LEAD, '$1'); apply(f, old, nw, { page: 'ikoma-kogen', rule: 'P3', 種類: '時刻', reason: 'モデルコースの時刻が公式の開園時刻と矛盾（公式は 9:00 開園）。時刻だけを外す', 公式の値: r.公式の値, 値: r.値, 出典URL: r.出典URL, snapshot: r.snapshot, 確認日: '2026-11-18', 削除した文: old }); } }
const OUTF = EXTRA ? 'scripts/data/mergeFactFixes20261118h.json' : 'scripts/data/mergeFactFixes20261118g.json'; fs.writeFileSync(OUTF, JSON.stringify({ note: '優先ページの未適用の削除・旧値の統一（2026-11-18）', date: '2026-11-18', fixes: [{ id: 'G', topic: '優先ページの修正の未適用・食い違いの解消', result: '公式で確認', sources: [], edits }] }, null, 1));
const by = (k) => edits.reduce((m, e) => ((m[e[k]] = (m[e[k]] || 0) + 1), m), {});
fs.writeFileSync(EXTRA ? 'logs/priority_gap_20261118/edits_report_h.json' : 'logs/priority_gap_20261118/edits_report.json', JSON.stringify({ 編集: edits.length, 規則別: by('rule'), 種類別: by('種類'), 影響ページ: [...new Set(edits.map((e) => e.page))].length, 見送り: notes }, null, 1)); console.log(JSON.stringify({ 編集: edits.length, 規則別: by('rule'), ページ: [...new Set(edits.map((e) => e.page))].length, 見送り: notes }, null, 1));
