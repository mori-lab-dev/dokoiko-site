#!/usr/bin/env node
/**
 * buildNonpriorityMeta20261118.mjs — 優先ページ以外の、メタ・説明文の段落（dest.description）・lead の、料金・休館日の数字の公式確認の結果から、置換・削除の編集（scripts/data/mergeFactFixes20261118k.json）を作る（2026-11-18）。サイトのファイルは変えない。
 *   食い違い（置換）  公式の値に置換（P1）。出典URL・値・写しを記録
 *   食い違い（削除）  置換できない文は削除（P1d）
 *   確認できず（記載なし・特定不可） 数字を含む文を削除（P2）。検索失敗・体験談などは触らない
 *   同じ文が description・seo.description・lead・見どころの説明などにあれば、全部をそろえて直す
 *   description の基準（200〜300字・数値2つ以上）だけは、削除でやむなく下回るページを免除（scripts/data/descWaiver20261118.json に理由・字数）。ほかの基準に新しく落ちるページは、そのページの削除を適用せず一覧にする
 *   メタの個別指定（seo.description）が削除で空になるページは、空にする（lead の先頭120字に任せる）。lead に旧値が残る場合は一覧にする
 */
import fs from 'fs';
process.env.DESC_NO_WAIVER = '1';   // 免除の一覧を無視して評価する（免除の一覧は、この評価から作る）
const { checkDesc } = await import('./descStyleCheck.mjs');
import { kindOf } from './lib/factRules20261118.mjs';
const O = 'logs/nonpriority_meta_20261118'; const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dests = J('src/data/destinations.json'); const byId = new Map(dests.map((d) => [d.id, d]));
const arts = new Map(); for (const d of dests) { const f = `src/data/articles/${d.id}.json`; if (fs.existsSync(f)) arts.set(d.id, J(f)); }
const DATE = '2026-11-18';
const fieldsOf = (id) => { const d = byId.get(id), a = arts.get(id); const out = []; const file = `src/data/articles/${id}.json`;
  out.push({ file: 'src/data/destinations.json', dest: id, field: 'description', label: 'description', get: () => d.description, set: (v) => { d.description = v; } });
  if (d.seo?.description !== undefined) out.push({ file: 'src/data/destinations.json', dest: id, field: 'seo.description', label: 'seo.description', get: () => d.seo.description, set: (v) => { d.seo.description = v; } });
  if (d.carFree?.seo?.description !== undefined) out.push({ file: 'src/data/destinations.json', dest: id, field: 'carFree.seo.description', label: 'carFree.seo.description', get: () => d.carFree.seo.description, set: (v) => { d.carFree.seo.description = v; } });
  for (const sp of d.spots || []) if (sp.description) out.push({ file: 'src/data/destinations.json', spot: [id, sp.name], label: `見どころ「${sp.name}」`, get: () => sp.description, set: (v) => { sp.description = v; } });
  const scan = (h, group) => { out.push({ file, group, field: 'lead', label: 'lead', get: () => h.lead, set: (v) => { h.lead = v; } }); (h.sections || []).forEach((s, i) => { out.push({ file, group, field: `sections.${i}.body`, label: `節${i + 1} body`, get: () => s.body, set: (v) => { s.body = v; } }); if (s.info) out.push({ file, group, field: `sections.${i}.info`, label: `節${i + 1} info`, get: () => s.info, set: (v) => { s.info = v; } }); }); if (typeof h.tips === 'string') out.push({ file, group, field: 'tips', label: 'tips', get: () => h.tips, set: (v) => { h.tips = v; } }); };
  if (a) { if (a.groups) for (const g of a.groups) scan(g, g.id); else scan(a); }
  return out.filter((f) => typeof f.get() === 'string' && f.get()); };
// 置換の言い回しの調整（固有名詞の検査が、数字を外した後の漢字のつながりを新しい語と数えるため、助詞を足して語の切れ目を残す。新しい事実は足さない）
const OVERRIDES = {
  'gen_北海_ピンネシリ温泉|火曜定休': ['温泉は火曜定休', '毎月第2・第4月曜日が定休日'],   // 15字以下の短文を残すため、主語の「温泉は」を省く
  'gamagori|800円': ['入館料800円', '1,200円'],   // 同上（「竹島水族館は1,200円。」で15字以下）
  'kijoka|入館料300円': ['入館料300円', '入館料は無料'],
  'nushima|片道310円': ['片道310円', '片道は大人630円'],
  'tatsuno|入場料200円の': ['入場料200円の', '入場料は無料の'],
  'tono|320円': ['入場料320円', '入場料は大人450円'],
};
const edits = []; const notes = []; const judgeStat = { 一致: 0, 食い違い: 0, 確認できず: { 記載なし: 0, 対象を特定できない: 0, 検索失敗: 0, 他: 0 } }; const byKind = {}; const perPage = new Map();
const pushEdit = (f, e) => { const o = { ...e, file: f.file, ...(f.group ? { group: f.group } : {}), ...(f.spot ? { spot: f.spot } : f.dest ? { dest: f.dest, field: f.field } : { field: f.field }) }; edits.push(o); return o; };
const pageEdits = new Map();
const files = fs.existsSync(`${O}/results`) ? fs.readdirSync(`${O}/results`).filter((f) => !f.startsWith('_') && f.endsWith('.json')) : [];
for (const rf of files) { const id = rf.replace('.json', ''); if (!byId.has(id)) { notes.push({ page: id, 理由: 'destinations に無い' }); continue; } const res = J(`${O}/results/${rf}`), inp = J(`${O}/inputs/page_${id}.json`); const so = new Map(inp.文.map((x) => [x.番号, x])); const grp = new Map((res.グループ || []).map((g) => [g.g, g]));
  for (const j of res.判定) { const u = so.get(j.n); if (!u) { notes.push({ page: id, 理由: `番号${j.n}なし` }); continue; } const s = u.文.trim(); byKind[u.種類] ||= { 一致: 0, 食い違い: 0, 確認できず: 0 }; byKind[u.種類][j.判定]++;
    if (j.判定 === '一致') { judgeStat.一致++; continue; } if (j.判定 === '食い違い') judgeStat.食い違い++; else { const r = j.理由 || ''; if (r.includes('記載なし')) judgeStat.確認できず.記載なし++; else if (r.includes('特定')) judgeStat.確認できず.対象を特定できない++; else if (r.includes('検索失敗')) judgeStat.確認できず.検索失敗++; else judgeStat.確認できず.他++; }
    const g = grp.get(j.g) || {}; const src = { 出典URL: g.出典URL || [], snapshot: g.snapshot || '', 確認日: DATE, 種類: u.種類, 旧文: s };
    let mode; if (j.判定 === '食い違い') mode = j.修正?.種類 === '置換' ? 'replace' : 'delete1'; else if (j.判定 === '確認できず' && /記載なし|特定/.test(j.理由 || '')) mode = 'delete2'; else continue;
    let did = 0; for (const f of fieldsOf(id)) { const cur = f.get(); if (cur.split(s).length - 1 !== 1) { if (cur.split(s).length - 1 > 1) notes.push({ page: id, 理由: '同じ文が同じ欄に複数', 欄: f.label }); continue; }
      let ed; if (mode === 'replace') { let frag = j.修正.old; let newFrag = j.修正.new; const ov = OVERRIDES[`${id}|${frag}`]; if (ov) { frag = ov[0]; newFrag = ov[1]; } if (s.split(frag).length - 1 !== 1) { notes.push({ page: id, n: j.n, 理由: '置換のoldが文に1回だけ無い', old: frag }); break; } ed = { page: id, rule: 'P1', reason: `食い違い: 公式の値に置換（公式の値: ${j.公式の値}）`, 公式の値: j.公式の値, 値: j.修正.値 || [], ...src, old: s, new: s.replace(frag, newFrag), 欄: f.label }; }
      else { const lines = cur.split('\n'); const li = lines.findIndex((l) => l.trim() === s); let old = s; if (li >= 0 && lines.filter((l) => l.trim() === s).length === 1 && lines.length > 1) old = li === lines.length - 1 ? '\n' + lines[li] : lines[li] + '\n'; ed = { page: id, rule: mode === 'delete1' ? 'P1d' : 'P2', reason: mode === 'delete1' ? `食い違い（${j.修正?.理由 || '公式の値で置換できない'}）。文を削除。公式の値: ${j.公式の値 || ''}` : `確認できず（${j.理由}）。料金・休館日の数字を含む文を削除`, 公式の値: j.公式の値 || '', 値: [], ...src, old, new: '', 削除した文: s, 欄: f.label }; }
      const pushed = pushEdit(f, ed); (pageEdits.get(id) || pageEdits.set(id, []).get(id)).push({ ed: pushed, f }); did++; }
    if (!did && mode) notes.push({ page: id, n: j.n, 理由: '該当箇所なし/置換できず', 文: s.slice(0, 40) }); } }
fs.writeFileSync('/private/tmp/claude-501/np_edits_raw.json', JSON.stringify(edits));
// 基準の評価: description の編集を当てた後の基準。免除は「200字以上」「数値2つ以上」だけ。ほかの基準に新しく落ちるページは、削除を適用しない
const WAIVABLE = (iss) => /^(数値\d+個|\d+字（200〜300字）)/.test(iss); /* 免除できるのは「数値2つ以上」「200字以上」だけ（短文・40字前後の長めの文などは免除しない） */ const waiver = []; const dropped = []; const emptied = [];
const final = []; const applyTo = (id) => { for (const { ed, f } of pageEdits.get(id) || []) f.set(f.get().replace(ed.old, ed.new)); };
const original = new Map(); for (const id of pageEdits.keys()) original.set(id, JSON.parse(JSON.stringify({ d: byId.get(id), a: arts.get(id) || null })));
const restore = (id) => { const o = original.get(id); Object.assign(byId.get(id), o.d); for (const k of Object.keys(byId.get(id))) if (!(k in o.d)) delete byId.get(id)[k]; if (o.a) { const a = arts.get(id); for (const k of Object.keys(a)) delete a[k]; Object.assign(a, o.a); } };
for (const id of pageEdits.keys()) { const before = checkDesc(original.get(id).d.description, id); const eds = pageEdits.get(id); const hasDel = eds.some((x) => x.ed.new === '' || x.ed.rule !== 'P1');
  // ページの編集を全部当てた後の description を評価
  const d = byId.get(id); const a0 = JSON.stringify([d.description, d.seo, d.carFree]); for (const { ed, f } of eds) f.set(f.get().replace(ed.old, ed.new)); const after = checkDesc(d.description, id);
  const newIssues = after.issues.filter((x) => !before.issues.includes(x)); const hard = newIssues.filter((x) => !WAIVABLE(x));
  restore(id);
  if (hard.length && hasDel) { dropped.push({ page: id, 新しく落ちる基準: hard, 編集: eds.map((x) => x.ed.旧文.slice(0, 30)) }); continue; }
  const w = newIssues.filter(WAIVABLE); if (w.length) waiver.push({ id, 名前: byId.get(id).name, 理由: '料金・休館日の数字を、公式で確認できずに削除（または置換）した結果、description の下限（200字以上・数値2つ以上）を下回った', 免除する基準: w, 字数_前: before.len, 字数_後: after.len, 数値_前: before.nums, 数値_後: after.nums }); for (const x of eds) final.push(x.ed); }
const finalSet = new Set(final);
const keep = edits.filter((e) => finalSet.has(e));
// seo.description が空になるページ
for (const id of pageEdits.keys()) { const d = byId.get(id); const sd = d.seo?.description ?? d.carFree?.seo?.description; if (sd === undefined) continue; let t = sd; for (const e of keep.filter((x) => x.page === id && (x.field === 'seo.description' || x.field === 'carFree.seo.description'))) t = t.replace(e.old, e.new); if (!t.trim()) emptied.push(id); }
const out = { note: '優先ページ以外の、メタ・説明文の段落・lead の料金・休館日の数字を、公式の値に置換または削除', date: DATE, fixes: [{ id: 'K', topic: '優先ページ以外のメタ・説明文の料金・休館日', result: '公式で確認', sources: [], edits: keep }] };
fs.writeFileSync('scripts/data/mergeFactFixes20261118k.json', JSON.stringify(out, null, 1));
fs.writeFileSync('scripts/data/descWaiver20261118.json', JSON.stringify({ note: '料金・休館日の数字を、公式で確認できずに削除した結果、description の下限（200字以上・数値2つ以上）を下回るページ。免除するのはその2つだけ（scripts/descStyleCheck.mjs が読む）。理由と字数は各行', items: waiver }, null, 1));
const cnt = (arr, k) => arr.reduce((m, e) => ((m[e[k]] = (m[e[k]] || 0) + 1), m), {});
const rep = { 判定: judgeStat, 種類別の判定: byKind, 編集: keep.length, 規則別: cnt(keep, 'rule'), 影響ページ: new Set(keep.map((e) => e.page)).size, 免除したページ: waiver.length, 適用しなかったページ_新しい基準違反: dropped, seoが空になるページ: emptied, 見送り: notes };
fs.writeFileSync(`${O}/edits_report.json`, JSON.stringify(rep, null, 1)); console.log(JSON.stringify({ ...rep, 適用しなかったページ_新しい基準違反: dropped.length, 見送り: notes.length }, null, 1));
