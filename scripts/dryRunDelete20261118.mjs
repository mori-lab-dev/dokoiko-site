#!/usr/bin/env node
/**
 * dryRunDelete20261118.mjs — 機械的な削除のドライラン（2026-11-18・サイトのファイルは変えない。出力は logs/dryrun_20261118/ だけ）。
 *   R1: 優先ページ（Search Console の表示（累計）が3回以上の129ページ）以外で、料金・休館日・営業時間の文を削除する。
 *       入力に「確認済みのリスト」（logs/dryrun_20261118/verified_keep.json: [{page, 文}]）を持ち、載っている文は残す。
 *       体験談・行程案の文は対象にしない（行程案＝モデルコース。体験談＝記事の本文・tips の、過去形・感想・個人の行動の文）。info の行・見どころの説明は事実の記述として扱う。
 *   R2: モデルコースの各行程の先頭の時刻（「9:00 」「10:30」など）だけを外す。行程の順番とほかの文字は残す。
 *   標高・距離は触らない。年号は優先ページ以外も今回は対象にしない。
 * 出力: edits.json（mergeConflictFixes と同じ形式: fixes[].edits[] = {file, group?, field または spot, old, new}＋rule・reason・page・種類）・metrics.json・before_after_30.md・classifier.json
 * usage: node scripts/dryRunDelete20261118.mjs
 */
import fs from 'fs';
import { kindOf } from './lib/factRules20261118.mjs';
const OUT = 'logs/dryrun_20261118'; fs.mkdirSync(OUT, { recursive: true });
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dests = J('src/data/destinations.json'); const byId = new Map(dests.map((d) => [d.id, d]));
const PRIORITY = new Set(J('logs/merge_20261118/pages.json').filter((p) => p.表示_累計 >= 3).map((p) => p.id));
const KEEP = fs.existsSync(`${OUT}/verified_keep.json`) ? J(`${OUT}/verified_keep.json`) : [];
const keepSet = new Set(KEEP.map((k) => `${k.page}|${k.文}`));

import { isExperience } from './lib/factRules20261118.mjs';

// ---- 本文の単位（編集の住所つき）
const units = []; // {page, file, group?, field | spot, type, text(unit), line, rest}
const articleFiles = fs.readdirSync('src/data/articles').filter((f) => f.endsWith('.json'));
const arts = new Map(); const artOrig = new Map();
for (const f of articleFiles) { const id = f.replace(/\.json$/, ''); if (!byId.has(id)) continue; const a = J(`src/data/articles/${f}`); arts.set(id, a); artOrig.set(id, JSON.parse(JSON.stringify(a))); }
const fieldsOf = (id, a) => {
  const out = []; const file = `src/data/articles/${id}.json`;
  const scan = (holder, group) => {
    (holder.sections || []).forEach((s, i) => { out.push({ file, group, field: `sections.${i}.body`, type: 'body', get: () => s.body, set: (v) => { s.body = v; }, label: `${group ? group + '/' : ''}節${i + 1}「${String(s.title || '').split('｜')[0]}」body` }); if (s.info) out.push({ file, group, field: `sections.${i}.info`, type: 'info', get: () => s.info, set: (v) => { s.info = v; }, label: `${group ? group + '/' : ''}節${i + 1}「${String(s.title || '').split('｜')[0]}」info` }); });
    if (holder.modelCourse) for (const k of Object.keys(holder.modelCourse)) out.push({ file, group, field: `modelCourse.${k}`, type: 'modelCourse', get: () => holder.modelCourse[k], set: (v) => { holder.modelCourse[k] = v; }, label: `${group ? group + '/' : ''}モデルコース(${k})` });
    if (typeof holder.tips === 'string') out.push({ file, group, field: 'tips', type: 'tips', get: () => holder.tips, set: (v) => { holder.tips = v; }, label: `${group ? group + '/' : ''}tips` });
  };
  if (a.groups) for (const g of a.groups) scan(g, g.id); else scan(a, undefined);
  return out;
};
const spotFields = [];
for (const d of dests) (d.spots || []).forEach((sp) => { if (sp.description) spotFields.push({ page: d.id, file: 'src/data/destinations.json', spot: [d.id, sp.name], type: 'spot', get: () => sp.description, set: (v) => { sp.description = v; }, label: `見どころ「${sp.name}」` }); });

// ---- 文の分割（行と文。元の文字列を保つ）
const splitField = (text, type) => {
  const lines = String(text).split('\n'); return lines.map((line) => {
    if (type === 'info') return { line, sents: line.trim() ? [line] : [] };
    const ss = line.match(/[^。]+。?/g) || []; return { line, sents: ss };
  });
};
const SENT_FINAL = /[。！？!?）)」』]$/;
const CONNECT = /^(ただし|また|なお|そのため|さらに|でも|しかし|ただ|それに|ちなみに|そして|それで|ほかに|他に|その分|それでも|だから)/;
const metrics = { 規則: { R1: {}, R2: {} } };
const edits = []; let editsSkipped = 0; const changedLabels = [];
const afterField = new Map(); // key -> {before, after}
const pageDelta = new Map(); // page -> 削除した字数
const sectionEmpty = []; const connectStart = []; const cutBefore = { n: 0 }; const cutAfter = { n: 0 };
const kindCount = { 削除文: {}, ページ: {} }; const pageSetByKind = {};
const addKind = (page, k, rule) => { const key = `${rule}|${k}`; kindCount.削除文[key] = (kindCount.削除文[key] || 0) + 1; (pageSetByKind[key] ||= new Set()).add(page); };
const ruleEdits = { R1: [], R2: [] }; const rowsFor30 = [];
const totalUnits = { all: 0, 優先: 0, 優先以外: 0 };

function processR1(page, fobj) {
  const before = fobj.get(); if (typeof before !== 'string' || !before) return;
  if (fobj.type === 'modelCourse') return;
  const lines = splitField(before, fobj.type); let changed = false; const delItems = [];
  const newLines = lines.map(({ line, sents }) => {
    const keepS = []; for (const s of sents) {
      const k = kindOf(s.trim()); totalUnits.all++;
      const where = { type: fobj.type };
      const target = k && ['料金', '休館日', '営業時間'].includes(k) && !PRIORITY.has(page) && !isExperience(s.trim(), where) && !keepSet.has(`${page}|${s.trim()}`);
      if (target) { delItems.push({ s, k }); changed = true; } else keepS.push(s);
    }
    return { line, keep: keepS, all: sents };
  });
  if (!changed) return;
  // 編集（old→new）を作る: 文の削除（行に1文だけなら行ごと）
  let cur = before;
  for (let li = 0; li < newLines.length; li++) {
    const { line, keep, all } = newLines[li]; if (keep.length === all.length) continue;
    const removed = all.filter((s) => !keep.includes(s) || keep.filter((x) => x === s).length < all.filter((x) => x === s).length);
    const wholeLine = keep.length === 0;
    const items = wholeLine ? [line] : all.filter((s, idx) => !keep.includes(s)); // 行の中の削除する文
    if (wholeLine) {
      const idx = cur.indexOf(line); const dup = cur.indexOf(line, idx + 1) >= 0;
      const isLast = idx + line.length === cur.length;
      const old = isLast ? (idx > 0 ? '\n' + line : line) : line + '\n';
      if (dup || idx < 0) { editsSkipped++; continue; }
      const next = cur.replace(old, ''); const kinds = all.map((s) => kindOf(s.trim()));
      edits.push({ page, rule: 'R1', 種類: kinds.find((k) => ['料金', '休館日', '営業時間'].includes(k)) || '', reason: `優先ページ以外の${kinds.find((k) => ['料金', '休館日', '営業時間'].includes(k))}の文を削除（確認済みのリストに無い・体験談/行程案でない）`, file: fobj.file, group: fobj.group, field: fobj.field, spot: fobj.spot, old, new: '', 削除した文: line.trim() });
      cur = next;
    } else {
      for (const s of items) { const idx = cur.indexOf(s); if (idx < 0 || cur.indexOf(s, idx + 1) >= 0) { editsSkipped++; continue; } const k = kindOf(s.trim()); edits.push({ page, rule: 'R1', 種類: k, reason: `優先ページ以外の${k}の文を削除（確認済みのリストに無い・体験談/行程案でない）`, file: fobj.file, group: fobj.group, field: fobj.field, spot: fobj.spot, old: s, new: '', 削除した文: s.trim() }); cur = cur.replace(s, ''); }
    }
  }
  fobj.set(cur);
  for (const d of delItems) addKind(page, d.k, 'R1');
  afterField.set(`${fobj.file}|${fobj.group || ''}|${fobj.field || fobj.spot}`, { page, label: fobj.label, before, after: cur, rule: 'R1', type: fobj.type });
  pageDelta.set(page, (pageDelta.get(page) || 0) + (before.length - cur.length));
}
// R2: モデルコースの各行程の先頭の時刻を外す
const TIME_LEAD = /(^|→\s*|[：:】]\s*|\n\s*)((?:[0-9０-９]{1,2}:[0-9０-９]{2})|(?:[0-9０-９]{1,2}時(?:[0-9０-９]{1,2}分)?))(?:頃|ごろ)?\s*/g;
function processR2(page, fobj) {
  const before = fobj.get(); if (typeof before !== 'string' || !before || fobj.type !== 'modelCourse') return;
  const after = before.replace(TIME_LEAD, '$1'); if (after === before) return;
  const n = (before.match(TIME_LEAD) || []).length;
  edits.push({ page, rule: 'R2', 種類: '時刻', reason: `モデルコースの行程の先頭の時刻を外す（${n}か所）。行程の順番とほかの文字は残す`, file: fobj.file, group: fobj.group, field: fobj.field, old: before, new: after, 削除した文: (before.match(TIME_LEAD) || []).map((x) => x.replace(/^(→|[：:】]|\n)\s*/, '').trim()).join(' / ') });
  (pageSetByKind['R2|時刻'] ||= new Set()).add(page); kindCount.削除文['R2|外した時刻の数'] = (kindCount.削除文['R2|外した時刻の数'] || 0) + n; kindCount.削除文['R2|時刻を外したモデルコース欄'] = (kindCount.削除文['R2|時刻を外したモデルコース欄'] || 0) + 1;
  fobj.set(after); afterField.set(`${fobj.file}|${fobj.group || ''}|${fobj.field}`, { page, label: fobj.label, before, after, rule: 'R2', type: 'modelCourse' });
  pageDelta.set(page, (pageDelta.get(page) || 0) + (before.length - after.length));
  // 不自然になる行程（時刻を外したことで、助詞や「発」「着」だけ・「発の…」が先頭に残るもの。元から時刻の無い「出発」などは数えない）
  const odd = (step) => { const t = String(step).replace(/^\s*(?:【[^】]*】|[0-9０-９]日目\s*[：:])\s*/, '').trim(); return t === '' || /^(発|着|頃|ごろ|から|まで|に|を|で|は|が|と|も)(の|で|に|を|は|が|と|も|から|まで)?/.test(t); };
  const bl = before.split('\n'), al = after.split('\n');
  bl.forEach((line, li) => line.split('→').forEach((st, si) => { const a = (al[li] || '').split('→')[si]; if (a !== undefined && a !== st && odd(a) && !odd(st)) metrics.R2不自然 = (metrics.R2不自然 || []).concat([{ page, 変更前の行程: st.trim(), 変更後の行程: a.trim(), 行: al[li].slice(0, 80) }]); }));
}
// ---- 実行
const touchedBefore = new Map(); // 本文字数の前
const bodyLen = (id, d, a) => {
  let n = String(d.description || '').length;
  if (a) { const sc = (h) => (h.sections || []).reduce((t, s) => t + String(s.body || '').length + String(s.info || '').length, 0) + String(h.lead || '').length + String(typeof h.tips === 'string' ? h.tips : '').length + String(h.bestSeason || '').length + (h.modelCourse ? Object.values(h.modelCourse).join('').length : 0); n += a.groups ? a.groups.reduce((t, g) => t + sc(g), 0) : sc(a); }
  else n += (d.spots || []).reduce((t, s) => t + String(s.description || '').length, 0);
  return n;
};
const lenBefore = new Map(); for (const d of dests) lenBefore.set(d.id, bodyLen(d.id, d, arts.get(d.id)));
for (const d of dests) {
  const a = arts.get(d.id);
  if (a) for (const f of fieldsOf(d.id, a)) { processR1(d.id, f); processR2(d.id, f); }
  for (const f of spotFields.filter((x) => x.page === d.id)) processR1(d.id, { ...f, field: undefined });
}
const lenAfter = new Map(); for (const d of dests) lenAfter.set(d.id, bodyLen(d.id, d, arts.get(d.id)));
// ---- 指標
const pages = dests.map((d) => d.id); const hit = pages.filter((id) => lenBefore.get(id) !== lenAfter.get(id));
const deltas = hit.map((id) => ({ id, d: lenBefore.get(id) - lenAfter.get(id), before: lenBefore.get(id), after: lenAfter.get(id) })).sort((a, b) => a.d - b.d);
const pct = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
metrics.編集 = { 件数: edits.length, R1: edits.filter((e) => e.rule === 'R1').length, R2: edits.filter((e) => e.rule === 'R2').length, 一意でなく編集にできなかった: editsSkipped };
metrics.優先ページ = PRIORITY.size; metrics.旅先ページ = dests.length;
metrics.削除される文の数 = {}; metrics.影響を受けるページ数 = {};
for (const [key, n] of Object.entries(kindCount.削除文)) { if (key.startsWith('R1|')) metrics.削除される文の数[key] = n; }
metrics.R1の内訳 = { 表示される本文の文: edits.filter((e) => e.rule === 'R1' && !e.spot).length, 見どころの説明の文: edits.filter((e) => e.rule === 'R1' && e.spot).length, 見どころのうち記事のあるページ_表示されない: edits.filter((e) => e.rule === 'R1' && e.spot && arts.has(e.page)).length, 見どころのうち記事のないページ_表示される: edits.filter((e) => e.rule === 'R1' && e.spot && !arts.has(e.page)).length, 文の削除_行ごと: edits.filter((e) => e.rule === 'R1' && (e.old.includes('\n') || (!e.old.endsWith('。') ))).length };
for (const [key, set] of Object.entries(pageSetByKind)) metrics.影響を受けるページ数[key] = set.size;
metrics.R1合計 = { 削除する文: edits.filter((e) => e.rule === 'R1').length, 影響を受けるページ: new Set(edits.filter((e) => e.rule === 'R1').map((e) => e.page)).size };
metrics.R2合計 = { 外した時刻の数: kindCount.削除文['R2|外した時刻の数'] || 0, 時刻を外したモデルコース欄: edits.filter((e) => e.rule === 'R2').length, 影響を受けるページ: new Set(edits.filter((e) => e.rule === 'R2').map((e) => e.page)).size };
metrics.R1もR2も受けるページ = [...new Set(edits.filter((e) => e.rule === 'R1').map((e) => e.page))].filter((p) => edits.some((e) => e.rule === 'R2' && e.page === p)).length;
metrics.本文字数の変化 = { 変化のあるページ数: hit.length, 減る字数の分布: { 最小: pct(deltas.map((x) => x.d), 0), p25: pct(deltas.map((x) => x.d), 0.25), 中央値: pct(deltas.map((x) => x.d), 0.5), p75: pct(deltas.map((x) => x.d), 0.75), p90: pct(deltas.map((x) => x.d), 0.9), p99: pct(deltas.map((x) => x.d), 0.99), 最大: pct(deltas.map((x) => x.d), 1) }, 減る割合の分布_パーセント: (() => { const r = deltas.map((x) => +(x.d / x.before * 100).toFixed(1)).sort((a, b) => a - b); return { 中央値: pct(r, 0.5), p90: pct(r, 0.9), 最大: pct(r, 1) }; })(), '100字以上減る': deltas.filter((x) => x.d >= 100).length, '300字以上減る': deltas.filter((x) => x.d >= 300).length };
metrics.本文字数の基準 = { 定義: '説明 + （記事: lead・節の body・info・モデルコース・tips・bestSeason ／記事なし: 見どころの説明）', 前_600字未満: pages.filter((id) => lenBefore.get(id) < 600).length, 後_600字未満: pages.filter((id) => lenAfter.get(id) < 600).length, '前の600字以上が、後に600字未満になる': pages.filter((id) => lenBefore.get(id) >= 600 && lenAfter.get(id) < 600).length, 前_1000字以上: pages.filter((id) => lenBefore.get(id) >= 1000).length, '1000字以上から下がる(1000字未満になる)': pages.filter((id) => lenBefore.get(id) >= 1000 && lenAfter.get(id) < 1000).length };
// 空になる節・途切れ・接続語
let emptySec = 0, emptySecBoth = 0, emptyTips = 0, emptySpot = 0; let cutNew = 0; const connect = [];
const endsOk = (t) => { const ss = String(t).split('\n').map((x) => x.trim()).filter(Boolean); return ss.every((l) => /：/.test(l) && !l.includes('。') ? true : (l.match(/[^。]+。?/g) || []).every((x) => /[。！？!?）)」』]$/.test(x.trim()) || x.trim().length === 0)); };
for (const [id, a] of arts) {
  const o = artOrig.get(id);
  const chk = (h, ho, g) => { (h.sections || []).forEach((s, i) => { const so = ho.sections[i]; if (String(so.body || '').trim() && !String(s.body || '').trim()) { emptySec++; if (!String(s.info || '').trim()) emptySecBoth++; sectionEmpty.push({ page: id, 節: `${g ? g + '/' : ''}節${i + 1}「${String(s.title || '').split('｜')[0]}」` }); } if (!endsOk(so.body || '') === false && !endsOk(s.body || '')) cutNew++; if (CONNECT.test(String(s.body || '').trim()) && !CONNECT.test(String(so.body || '').trim())) connect.push({ page: id, 節: `節${i + 1}`, 文頭: String(s.body).trim().slice(0, 30) }); }); if (typeof ho.tips === 'string' && ho.tips.trim() && !String(h.tips || '').trim()) emptyTips++; };
  if (a.groups) a.groups.forEach((g, gi) => chk(g, o.groups[gi], g.id)); else chk(a, o, null);
}
for (const d of dests) for (const sp of d.spots || []) { /* spots は編集済みの値を d.spots に反映済み（processR1 の set） */ }
metrics.空になる = { 節_本文が空: emptySec, 節_本文もinfoも空: emptySecBoth, tipsが空: emptyTips };
metrics.文が途中で切れた形になる = { 新しく出る件数: cutNew, 方法: '削除は、文（「。」まで）・info の1行・モデルコースの先頭の時刻だけ。削除後、各文が「。」などで終わるかを元と比べた' };
metrics.接続語で文頭が始まる節 = { 件数: connect.length, 例: connect.slice(0, 8) };
metrics.R2で不自然になる行程 = { 件数: (metrics.R2不自然 || []).length, 例: (metrics.R2不自然 || []).slice(0, 8) }; delete metrics.R2不自然;
// ---- 30件の変更前後
let seed = 20261118; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const fieldsChanged = [...afterField.values()]; const r1f = fieldsChanged.filter((x) => x.rule === 'R1'); const r2f = fieldsChanged.filter((x) => x.rule === 'R2');
const pick = (arr, n) => { const a = [...arr]; const out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
const sample30 = [...pick(r1f, 20), ...pick(r2f, 10)];
const md = ['# 変更前後の並べた一覧（無作為30件・乱数 seed 20261118）', '', 'R1（料金・休館日・営業時間の文の削除）20件・R2（モデルコースの先頭の時刻）10件。ドライランで、ファイルは変えていない。', ''];
sample30.forEach((x, i) => { md.push(`## ${i + 1}. ${byId.get(x.page).name}（/destinations/${x.page}/）・${x.label}・規則 ${x.rule}`, '', '変更前:', '```', x.before, '```', '変更後:', '```', x.after === '' ? '（空）' : x.after, '```', ''); });
fs.writeFileSync(`${OUT}/before_after_30.md`, md.join('\n'));
// ---- 出力
const wrapper = { note: 'ドライランの編集（mergeConflictFixes と同じ形式。適用はしない）', date: '2026-11-18', fixes: ['R1', 'R2'].map((r) => ({ id: r, topic: r === 'R1' ? '優先ページ以外の料金・休館日・営業時間の文の削除' : 'モデルコースの先頭の時刻を外す', result: 'ドライラン', sources: [], edits: edits.filter((e) => e.rule === r) })) };
fs.writeFileSync(`${OUT}/edits.json`, JSON.stringify(wrapper));
fs.writeFileSync(`${OUT}/metrics.json`, JSON.stringify(metrics, null, 1));
console.log(JSON.stringify(metrics, null, 1));
