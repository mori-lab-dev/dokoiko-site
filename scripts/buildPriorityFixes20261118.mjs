#!/usr/bin/env node
/**
 * buildPriorityFixes20261118.mjs — 優先ページの確認結果（results/*.json・試験3ページ）から、修正・削除の編集（mergeConflictFixes と同じ形式）を作る（2026-11-18）。サイトのファイルは変えない。
 *   規則（もりりんの指示どおり）:
 *     P1 食い違い（置換）  公式の値に直す。old→new は元の文の中の値だけ。出典URL・確認日・値・snapshot を記録
 *     P2 確認できず（記載なし／対象を特定できない）  数字を含む文（info は1行）を丸ごと削除。モデルコースは削除しない
 *     P1d 食い違い（削除）  公式の値が文の対象と一対一にならないとき、文を削除
 *     P3 モデルコースの時刻  公式の営業時間・運航時刻と明らかに矛盾する行程の時刻だけを外す（時刻だけが残る・「発」「着」だけが残る行程は残す）
 *     触らない: 一致・確認できず（体験談・行程案）
 * 出力: scripts/data/mergeFactFixes20261118d.json（適用用）・logs/priority_fix_20261118/edits_report.json（件数・skip）
 */
import fs from 'fs';
const D = 'logs/priority_fix_20261118';
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dests = J('src/data/destinations.json'); const byId = new Map(dests.map((d) => [d.id, d]));
const arts = new Map(); for (const d of dests) { const f = `src/data/articles/${d.id}.json`; if (fs.existsSync(f)) arts.set(d.id, J(f)); }
const DATE = '2026-11-18';
const TIME_LEAD = /(^|→\s*|[：:】]\s*|\n\s*)((?:[0-9０-９]{1,2}:[0-9０-９]{2})|(?:[0-9０-９]{1,2}時(?:[0-9０-９]{1,2}分)?))(?:頃|ごろ)?\s*/;
const fieldsOf = (id) => {
  const a = arts.get(id); const out = []; const file = `src/data/articles/${id}.json`;
  const scan = (h, group) => {
    (h.sections || []).forEach((s, i) => { out.push({ file, group, field: `sections.${i}.body`, type: 'body', get: () => s.body, set: (v) => { s.body = v; } }); if (s.info) out.push({ file, group, field: `sections.${i}.info`, type: 'info', get: () => s.info, set: (v) => { s.info = v; } }); });
    if (h.modelCourse) for (const k of Object.keys(h.modelCourse)) out.push({ file, group, field: `modelCourse.${k}`, type: 'modelCourse', get: () => h.modelCourse[k], set: (v) => { h.modelCourse[k] = v; } });
    if (typeof h.tips === 'string') out.push({ file, group, field: 'tips', type: 'tips', get: () => h.tips, set: (v) => { h.tips = v; } });
  };
  if (a) { if (a.groups) for (const g of a.groups) scan(g, g.id); else scan(a, undefined); }
  const d = byId.get(id); for (const sp of d.spots || []) if (sp.description) out.push({ file: 'src/data/destinations.json', spot: [d.id, sp.name], type: 'spot', get: () => sp.description, set: (v) => { sp.description = v; } });
  return out;
};
const edits = []; const skipped = []; const touched = new Set(); const judgeCount = {};
const normSnap = (s) => s.replace(/[\s　]/g, '').replace(/[～〜~－ー−]/g, '〜').replace(/[：:]/g, ':').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[，,]/g, '');
function apply(page, f, old, nw, meta) {
  const cur = f.get(); if (typeof cur !== 'string') return false; const n = cur.split(old).length - 1;
  if (n !== 1) { if (n > 1) skipped.push({ page, 理由: `old が${n}回`, old: old.slice(0, 40) }); return false; }
  f.set(cur.replace(old, nw)); edits.push({ page, ...meta, file: f.file, ...(f.group ? { group: f.group } : {}), ...(f.spot ? { spot: f.spot } : { field: f.field }), old, new: nw }); touched.add(page); return true;
}
function deleteSentence(page, s, meta) {
  let did = 0;
  for (const f of fieldsOf(page)) {
    if (f.type === 'modelCourse') continue; const cur = f.get(); if (typeof cur !== 'string' || !cur.includes(s)) continue;
    const lines = cur.split('\n');
    // 文・行の単位で一致するものだけ（部分文字列は対象にしない）
    const hits = []; lines.forEach((l, li) => { if (f.type === 'info') { if (l.trim() === s) hits.push({ li, whole: true, raw: l }); } else { if (l.trim() === s) hits.push({ li, whole: true, raw: l }); else for (const x of (l.match(/[^。]+。?/g) || [])) if (x.trim() === s) hits.push({ li, whole: false, raw: x }); } });
    if (hits.length === 0) continue; if (hits.length > 1) { skipped.push({ page, 理由: '同じ文が同じ欄に複数回', old: s.slice(0, 40) }); continue; }
    const h = hits[0]; let old;
    if (h.whole) old = h.li === lines.length - 1 ? (h.li > 0 ? '\n' + h.raw : h.raw) : h.raw + '\n'; else old = h.raw;
    if (cur.split(old).length - 1 !== 1) { skipped.push({ page, 理由: 'oldが一意でない', old: s.slice(0, 40) }); continue; }
    if (cur.replace(old, '').trim() === '') { skipped.push({ page, 理由: '削除すると欄が空になるので削除しない', old: s.slice(0, 40) }); continue; }
    if (apply(page, f, old, '', { ...meta, 削除した文: s })) did++;
  }
  if (!did) skipped.push({ page, 理由: '該当箇所なし/削除せず', old: s.slice(0, 40) });
}
const FAIL = fs.existsSync(`${D}/fail_keys.json`) && !process.argv.includes('--fresh') ? J(`${D}/fail_keys.json`) : [];
const failed = (page, rule, old) => FAIL.some((x) => x.page === page && x.rule === rule && String(old).startsWith(x.old));
const fallbacks = [];
const results = []; // [{id, res, inputs}]
for (const f of fs.readdirSync(`${D}/results`)) { if (f.startsWith('_') || !f.endsWith('.json')) continue; const id = f.replace(/\.json$/, ''); results.push({ id, res: J(`${D}/results/${f}`), inp: J(`${D}/inputs/page_${id}.json`) }); }
for (const { id, res, inp } of results) {
  if (!byId.has(id)) { skipped.push({ page: id, 理由: 'destinations に無い' }); continue; }
  const sentOf = new Map(inp.文.map((x) => [x.番号, x])); const grp = new Map((res.グループ || []).map((g) => [g.g, g]));
  for (const j of res.判定) {
    const u = sentOf.get(j.n); if (!u) { skipped.push({ page: id, 理由: `番号${j.n}なし` }); continue; }
    const g = grp.get(j.g) || {}; const kind = u.種類; judgeCount[kind] ||= { 一致: 0, 食い違い: 0, 確認できず: 0 }; judgeCount[kind][j.判定]++;
    const src = { 出典URL: g.出典URL || [], snapshot: g.snapshot || '', 確認日: DATE, 種類: kind };
    if (j.判定 === '食い違い' && j.修正) {
      if (j.修正.種類 === '置換' && failed(id, 'P1', j.修正.old)) { fallbacks.push({ page: id, n: j.n, old: j.修正.old, new: j.修正.new }); deleteSentence(id, u.文.trim(), { rule: 'P1d', reason: `食い違い。公式の値への置換が機械検査（値の実在・新しい数字・語）に通らないため、文を削除。公式の値: ${j.公式の値}`, 公式の値: j.公式の値, 値: [], ...src }); }
      else if (j.修正.種類 === '置換') {
        let did = false;
        for (const f of fieldsOf(id)) { if (f.type === 'modelCourse') continue; const cur = f.get(); if (typeof cur !== 'string' || !cur.includes(u.文.trim().slice(0, 0)) ) continue; if (!cur.includes(j.修正.old)) continue; if (!cur.includes(u.文.trim()) || !u.文.includes(j.修正.old)) continue; did = apply(id, f, j.修正.old, j.修正.new, { rule: 'P1', reason: `食い違い: 公式の値に直す（公式の値: ${j.公式の値}）`, 公式の値: j.公式の値, 値: j.修正.値, ...src, 旧文: u.文 }) || did; }
        if (!did) skipped.push({ page: id, 理由: '置換の old が文の中に1回だけ無い', old: j.修正.old, n: j.n });
      } else deleteSentence(id, u.文.trim(), { rule: 'P1d', reason: `食い違い（${j.修正.理由 || '公式の値で置換できない'}）。文を削除。公式の値: ${j.公式の値}`, 公式の値: j.公式の値, 値: [], ...src });
    } else if (j.判定 === '食い違い') deleteSentence(id, u.文.trim(), { rule: 'P1d', reason: `食い違い（修正の指定なし）。文を削除。公式の値: ${j.公式の値}`, 公式の値: j.公式の値, 値: [], ...src });
    else if (j.判定 === '確認できず' && (j.理由 === '記載なし' || j.理由 === '対象を特定できない')) {
      if (u.場所.includes('モデルコース')) continue; // 行程案は削除しない
      deleteSentence(id, u.文.trim(), { rule: 'P2', reason: `確認できず（${j.理由}）。数字を含む文を削除`, 公式の値: '', 値: [], ...src });
    }
    if (j.モデルコースの時刻) {
      const st = j.モデルコースの時刻.行程; let did = false; if (failed(id, 'P3', st)) { skipped.push({ page: id, 理由: '時刻外しが機械検査に通らず見送り', old: st.slice(0, 40) }); continue; }
      for (const f of fieldsOf(id)) { if (f.type !== 'modelCourse') continue; const cur = f.get(); if (typeof cur !== 'string' || cur.split(st).length - 1 !== 1) continue;
        const stripped = st.replace(TIME_LEAD, '$1'); const rest = stripped.replace(/^\s*(?:【[^】]*】|[0-9０-９]日目\s*[：:])\s*/, '').trim();
        if (stripped === st || rest === '' || /^(発|着|台|頃|ごろ|から|まで|の|に|を|で|は|が)/.test(rest)) { skipped.push({ page: id, 理由: '時刻だけ/発・着だけが残るので時刻を残す', old: st.slice(0, 40) }); did = true; break; }
        did = apply(id, f, st, stripped, { rule: 'P3', reason: `モデルコースの時刻が公式と矛盾（${j.モデルコースの時刻.矛盾}）。時刻だけを外す`, 公式の値: j.モデルコースの時刻.矛盾, 値: j.モデルコースの時刻.値 || [], 削除した文: st, ...src, 種類: '時刻' }) || did; }
      if (!did) skipped.push({ page: id, 理由: '時刻の行程が1回だけ無い', old: st.slice(0, 40) });
    }
  }
}
const wrapper = { note: '優先ページの検証に基づく修正・削除（P1置換/P1d削除/P2確認できず削除/P3時刻外し）', date: DATE, fixes: [{ id: 'P', topic: '優先ページの事実の確認（2026-11-18）', result: '公式で確認', sources: [], edits }] };
fs.writeFileSync('scripts/data/mergeFactFixes20261118d.json', JSON.stringify(wrapper, null, 1));
const by = (k) => edits.reduce((m, e) => ((m[e[k]] = (m[e[k]] || 0) + 1), m), {});
fs.writeFileSync(`${D}/edits_report.json`, JSON.stringify({ ページ: results.length, 編集: edits.length, 規則別: by('rule'), 種類別: by('種類'), 影響ページ: touched.size, 文の種類ごとの判定: judgeCount, 置換から削除へ回した: fallbacks, skip: skipped }, null, 1));
console.log(JSON.stringify({ ページ: results.length, 編集: edits.length, 規則別: by('rule'), 影響ページ: touched.size, skip: skipped.length }));
