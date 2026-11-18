// 優先ページの判定と、いまのデータの突き合わせ（2026-11-18）。純粋な関数。findPriorityGaps・auditPriorityApplied・試験が使う。
//   A: 判定の区分（食い違い／確認できず＝体験談・行程案・検索失敗 以外）が対象の文のうち、データに残っている文（判定の理由の文言では決めない）
//   B: 置換した値（P1）の旧値が、同じページの別の欄（lead・本文・info・tips・モデルコース・見どころの説明。description は含めない）に残っている文
export const unitsOf = (text, type) => String(text).split('\n').flatMap((l) => type === 'info' ? (l.trim() ? [l.trim(), ...((l.match(/[^。]+。/g) || []).length > 0 && /。./.test(l) ? (l.match(/[^。]+。?/g) || []).map((x) => x.trim()).filter(Boolean) : [])] : []) : (l.match(/[^。]+。?/g) || []).map((x) => x.trim()).filter(Boolean));   // info は、行ぜんたいと、行の中の文（「。」で区切った）の両方を単位にする
export const fieldsOf = (id, dests, arts) => { const d = dests.get(id); const a = arts.get(id); const out = [];
  const scan = (h, group) => { const g = group ? group + '/' : ''; out.push({ where: `${g}lead`, type: 'lead', text: h.lead }); (h.sections || []).forEach((s, i) => { out.push({ where: `${g}節${i + 1} body`, type: 'body', text: s.body }); out.push({ where: `${g}節${i + 1} info`, type: 'info', text: s.info }); }); out.push({ where: `${g}tips`, type: 'tips', text: typeof h.tips === 'string' ? h.tips : '' }); out.push({ where: `${g}bestSeason`, type: 'bestSeason', text: h.bestSeason }); if (h.modelCourse) for (const [k, v] of Object.entries(h.modelCourse)) out.push({ where: `${g}モデルコース(${k})`, type: 'modelCourse', text: v }); };
  if (a) { if (a.groups) for (const x of a.groups) scan(x, x.id); else scan(a); }
  out.push({ where: 'description', type: 'description', text: d.description }); for (const sp of d.spots || []) out.push({ where: `見どころ「${sp.name}」`, type: 'spot', text: sp.description }); return out.filter((x) => typeof x.text === 'string' && x.text); };
/** 区分だけで決める（理由の文言は、体験談・行程案・検索失敗かの判断にだけ使う） */
export const isTarget = (j, u) => !String(u.場所).includes('モデルコース') && (j.判定 === '食い違い' || (j.判定 === '確認できず' && !/体験談|行程案|検索失敗/.test(j.理由 || '')));
const PREV_ACCEPT = (j) => j.判定 === '食い違い' || (j.判定 === '確認できず' && ['記載なし', '対象を特定できない'].includes(j.理由));
export function findA({ dests, arts, results }) {
  const out = []; let targets = 0;
  for (const { id, res, inp } of results) { if (!dests.has(id)) continue; const so = new Map(inp.文.map((x) => [x.番号, x])); const fields = fieldsOf(id, dests, arts);
    for (const j of res.判定) { const u = so.get(j.n); if (!u || !isTarget(j, u)) continue; targets++; const s = u.文.trim(); const hits = [];
      for (const f of fields) { if (['modelCourse', 'lead', 'bestSeason', 'description'].includes(f.type)) continue; const us = unitsOf(f.text, f.type); const c = us.filter((x) => x === s).length; if (c) hits.push({ where: f.where, type: f.type, 個数: c, 欄の単位数: us.length }); }
      if (!hits.length) continue;
      let reason; if (!PREV_ACCEPT(j)) reason = '判定の理由の文言が、削除の条件と一致しない'; else if (hits.some((h) => h.個数 > 1)) reason = '同じ文が同じ欄に複数ある'; else if (hits.every((h) => h.欄の単位数 === 1)) reason = '削除すると欄が空になる'; else reason = 'その他';
      out.push({ page: id, n: j.n, 種類: u.種類, 判定: j.判定, 理由: j.理由 || '', 文: s, 残っている場所: hits, 残った理由: reason }); } }
  return { targets, remaining: out }; }
export function findB({ dests, arts, edits }) {
  const out = []; const seen = new Set();
  for (const e of edits.filter((x) => x.rule === 'P1')) { const key = `${e.page}|${e.old}|${e.new}`; if (seen.has(key) || !e.old || String(e.old).length < 2 || !dests.has(e.page)) continue; seen.add(key);
    const kw = ((e.旧文 || '') + ' ' + e.old).normalize('NFKC').replace(/\d[\d,.]*/g, ' ').match(/[一-鿿々ァ-ヴー]{2,}/g) || [];
    const toks = [...new Set((String(e.old).normalize('NFKC').match(/\d[\d,.]*(?:分|時間|円|m|km|メートル|キロ|人|名|台|本|年|度|℃|回|段|%)?/g) || []).filter((t) => /\d/.test(t) && t.length >= 2))];
    for (const f of fieldsOf(e.page, dests, arts)) { if (f.type === 'description') continue; for (const u of unitsOf(f.text, f.type)) { if (u.includes(e.new) || String(e.new).includes(u)) continue; const nu = u.normalize('NFKC'); const direct = u.includes(e.old); const byNum = toks.some((t) => nu.includes(t)); if (!direct && !byNum) continue; const shared = [...new Set(kw.filter((w) => nu.includes(w)))]; if (!direct && !shared.length) continue; if (direct && !shared.length && kw.length) { /* 同じ語を共有しない直接一致は、別の事実の可能性が高いが候補に残す */ } out.push({ page: e.page, 種類: e.種類, 置換: `${e.old} → ${e.new}`, 旧文: e.旧文 || '', 残っている場所: f.where, 残っている文: u, 一致: direct ? '旧値そのもの' : '数字＋単位', 共通する語: shared }); } } }
  return out; }
