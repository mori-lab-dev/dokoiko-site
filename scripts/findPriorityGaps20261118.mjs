#!/usr/bin/env node
/**
 * findPriorityGaps20261118.mjs — 優先ページの判定（results/*.json）と、いまのデータ・dist を突き合わせ、(a) 編集の対象になるべきなのに残っている文、(b) 置換した値の旧値が同じページの別の欄に残っていないか、を全件で洗い出す（2026-11-18・読み取りのみ）。
 *   判定の理由の文言ではなく、判定の区分だけで対象を決める: 食い違い（置換・削除）・確認できず（体験談・行程案・検索失敗 以外）が対象。モデルコースの文・体験談・行程案・一致は対象外。
 * 出力: logs/priority_gap_20261118/gaps_a.json・gaps_b.json・summary.json
 */
import fs from 'fs';
const D = 'logs/priority_fix_20261118', O = 'logs/priority_gap_20261118'; fs.mkdirSync(O, { recursive: true });
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dests = J('src/data/destinations.json'); const byId = new Map(dests.map((d) => [d.id, d]));
const nz = (s) => String(s).normalize('NFKC').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
const fieldsOf = (id) => { const d = byId.get(id); const out = []; const f = `src/data/articles/${id}.json`; const a = fs.existsSync(f) ? J(f) : null;
  const scan = (h, group) => { out.push({ where: `${group ? group + '/' : ''}lead`, type: 'lead', text: h.lead }); (h.sections || []).forEach((s, i) => { out.push({ where: `${group ? group + '/' : ''}節${i + 1} body`, type: 'body', text: s.body }); out.push({ where: `${group ? group + '/' : ''}節${i + 1} info`, type: 'info', text: s.info }); }); out.push({ where: `${group ? group + '/' : ''}tips`, type: 'tips', text: typeof h.tips === 'string' ? h.tips : '' }); out.push({ where: `${group ? group + '/' : ''}bestSeason`, type: 'bestSeason', text: h.bestSeason }); if (h.modelCourse) for (const [k, v] of Object.entries(h.modelCourse)) out.push({ where: `${group ? group + '/' : ''}モデルコース(${k})`, type: 'modelCourse', text: v }); };
  if (a) { if (a.groups) for (const g of a.groups) scan(g, g.id); else scan(a); }
  out.push({ where: 'description', type: 'description', text: d.description }); for (const sp of d.spots || []) out.push({ where: `見どころ「${sp.name}」`, type: 'spot', text: sp.description }); return out.filter((x) => typeof x.text === 'string' && x.text); };
const unitsOf = (text, type) => String(text).split('\n').flatMap((l) => type === 'info' ? (l.trim() ? [l.trim()] : []) : (l.match(/[^。]+。?/g) || []).map((x) => x.trim()).filter(Boolean));
const ACCEPT = (j) => j.判定 === '食い違い' || (j.判定 === '確認できず' && ['記載なし', '対象を特定できない'].includes(j.理由));   // 前回の条件（文言一致）
const TARGET = (j, u) => !u.場所.includes('モデルコース') && (j.判定 === '食い違い' || (j.判定 === '確認できず' && !/体験談|行程案|検索失敗/.test(j.理由 || '')));   // 今回の条件（区分だけ）
const gapsA = []; const stat = { 対象の文: 0, 残っている文: 0, 理由別: {}, 種類別: {}, ページ別: {}, 判定別: {} };
const pageIds = fs.readdirSync(`${D}/results`).filter((f) => !f.startsWith('_') && f.endsWith('.json')).map((f) => f.replace('.json', ''));
for (const id of pageIds) { const res = J(`${D}/results/${id}.json`), inp = J(`${D}/inputs/page_${id}.json`); const so = new Map(inp.文.map((x) => [x.番号, x])); const fields = fieldsOf(id);
  for (const j of res.判定) { const u = so.get(j.n); if (!u || !TARGET(j, u)) continue; stat.対象の文++; const s = u.文.trim();
    const hits = []; for (const f of fields) { if (f.type === 'modelCourse' || f.type === 'lead' || f.type === 'bestSeason' || f.type === 'description') continue; const us = unitsOf(f.text, f.type); const c = us.filter((x) => x === s).length; if (c) hits.push({ where: f.where, type: f.type, 個数: c, 欄の単位数: us.length, 欄の字数: f.text.length }); }
    if (!hits.length) continue;
    // 残った理由
    let reason; if (!ACCEPT(j)) reason = '判定の理由の文言が、削除の条件と一致しない'; else if (hits.some((h) => h.個数 > 1)) reason = '同じ文が同じ欄に複数ある'; else if (j.判定 === '食い違い' && j.修正?.種類 === '置換' && !s.includes(j.修正.old)) reason = '置換のoldが文の中に無い（記録と本文の不一致）'; else if (hits.every((h) => h.欄の単位数 === 1)) reason = '削除すると欄が空になる'; else if (j.判定 === '食い違い' && j.修正?.種類 === '置換') reason = '置換できなかった（oldが欄に複数・検査で落ちて削除に回したが削除もできない、など）'; else reason = 'その他（要調査）';
    stat.残っている文++; stat.理由別[reason] = (stat.理由別[reason] || 0) + 1; stat.種類別[u.種類] = (stat.種類別[u.種類] || 0) + 1; stat.ページ別[id] = (stat.ページ別[id] || 0) + 1; const jk = j.判定 + (j.判定 === '確認できず' ? `(${j.理由})` : ''); stat.判定別[jk] = (stat.判定別[jk] || 0) + 1;
    gapsA.push({ page: id, 名前: byId.get(id).name, n: j.n, 種類: u.種類, 判定: j.判定, 理由: j.理由 || '', 修正: j.修正 || null, 公式の値: j.公式の値 || '', 文: s, 残っている場所: hits, 残った理由: reason, 出典: res.グループ?.find((g) => g.g === j.g)?.出典URL || [], snapshot: res.グループ?.find((g) => g.g === j.g)?.snapshot || '' }); } }
// spot の説明の1文（周防大島 片添ヶ浜）の確認: 試験の n14 は別表記のため、現行の spot 説明に同じ表記があるか
fs.writeFileSync(`${O}/gaps_a.json`, JSON.stringify(gapsA, null, 1));
// (b) 置換した値の旧値が、同じページの別の欄に残っていないか
const P1 = ['d', 'e'].flatMap((x) => J(`scripts/data/mergeFactFixes20261118${x}.json`).fixes.flatMap((f) => f.edits)).filter((e) => e.rule === 'P1');
const gapsB = []; const seen = new Set();
for (const e of P1) { const key = `${e.page}|${e.old}|${e.new}`; if (seen.has(key)) continue; seen.add(key); const old = e.old; if (!old || old.length < 2) continue; const fields = fieldsOf(e.page); const kw = (e.旧文 || '').normalize('NFKC').replace(old.normalize('NFKC'), ' ').match(/[一-鿿々ァ-ヴー]{2,}/g) || [];
  for (const f of fields) { const t = f.text; if (!t.includes(old)) continue; for (const u of unitsOf(t, f.type)) { if (!u.includes(old)) continue; if (f.type === 'modelCourse' || true) { const shared = kw.filter((w) => u.includes(w)); gapsB.push({ page: e.page, 名前: byId.get(e.page).name, 種類: e.種類, 置換: `${old} → ${e.new}`, 旧文: e.旧文 || '', 残っている場所: f.where, 残っている文: u, 共通する語: shared, 同じ事実の可能性: shared.length >= 1 ? '高' : '低', 出典URL: e.出典URL, snapshot: e.snapshot, 値: e.値 }); } } } }
fs.writeFileSync(`${O}/gaps_b.json`, JSON.stringify(gapsB, null, 1));

// (b2) 旧値の「数字＋単位」（例: 30分）を、別の言い方（例: 30分食べ放題）で書いた文が、同じページに残っていないか。共通する語がある文だけ
const gapsB2 = []; const known = new Set(gapsB.map((g) => `${g.page}|${g.残っている場所}|${g.残っている文}`));
for (const e of P1) { const toks = [...new Set((String(e.old).normalize('NFKC').match(/\d[\d,.]*(?:分|時間|円|m|km|メートル|キロ|人|名|台|本|年|度|℃|回|段|%)?/g) || []).filter((t) => /\d/.test(t) && t.length >= 2))]; if (!toks.length) continue;
  const kw = ((e.旧文 || '') + ' ' + e.old).normalize('NFKC').replace(/\d[\d,.]*/g, ' ').match(/[\u4E00-\u9FFF々ァ-ヴー]{2,}/g) || [];
  for (const f of fieldsOf(e.page)) { if (f.type === 'description') continue; for (const u of unitsOf(f.text, f.type)) { const nu = u.normalize('NFKC'); if (!toks.some((t) => nu.includes(t))) continue; if (u.includes(e.new) || String(e.new).includes(u)) continue; const shared = [...new Set(kw.filter((w) => nu.includes(w)))]; if (!shared.length) continue; const k = `${e.page}|${f.where}|${u}`; if (known.has(k)) continue; known.add(k); gapsB2.push({ page: e.page, 名前: byId.get(e.page).name, 種類: e.種類, 置換: `${e.old} → ${e.new}`, 旧文: e.旧文 || '', 残っている場所: f.where, 残っている文: u, 数字: toks, 共通する語: shared }); } } }
fs.writeFileSync(`${O}/gaps_b2.json`, JSON.stringify(gapsB2, null, 1)); console.log('b2 candidates', gapsB2.length);
const sb = { 置換の件数: seen.size, 旧値が同じページに残る候補: gapsB.length, 同じ事実の可能性_高: gapsB.filter((g) => g.同じ事実の可能性 === '高').length, 低: gapsB.filter((g) => g.同じ事実の可能性 === '低').length, 種類別_高: gapsB.filter((g) => g.同じ事実の可能性 === '高').reduce((m, g) => ((m[g.種類] = (m[g.種類] || 0) + 1), m), {}), ページ数_高: new Set(gapsB.filter((g) => g.同じ事実の可能性 === '高').map((g) => g.page)).size };
fs.writeFileSync(`${O}/summary.json`, JSON.stringify({ a: { ...stat, ページ数: Object.keys(stat.ページ別).length }, b: sb }, null, 1)); console.log(JSON.stringify({ a: { ...stat, ページ別: undefined, ページ数: Object.keys(stat.ページ別).length }, b: sb }, null, 1));
