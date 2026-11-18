// 優先ページ以外の全ページで、料金・休館日・営業時間の数字を含む文が残っている欄を、すべて数える（2026-11-18・読み取りのみ。変更しない）
import fs from 'fs';
import { kindOf, isExperience } from './lib/factRules20261118.mjs';
const O = process.argv[2] || 'logs/nonpriority_meta_20261118'; const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dl = J('src/data/destinations.json'); const PRI = new Set(J('logs/merge_20261118/pages.json').filter((p) => p.表示_累計 >= 3).map((p) => p.id));
const KIND = ['料金', '休館日', '営業時間']; const keep = new Set(J('logs/dryrun_20261118/verified_keep.json').map((k) => `${k.page}|${k.文}`));
const quizDesc = fs.existsSync('src/data/quizDesc.json') ? J('src/data/quizDesc.json') : {};
const unitsOf = (t, type) => String(t).split('\n').flatMap((l) => type === 'info' ? (l.trim() ? [l.trim()] : []) : (l.match(/[^。]+。?/g) || []).map((x) => x.trim()).filter(Boolean));
const rows = []; const add = (id, 欄, text, type) => { for (const s of unitsOf(text, type)) { const k = kindOf(s); if (k && KIND.includes(k)) rows.push({ page: id, 欄, 種類: k, 文: s, type }); } };
const walkStrings = (o, p, out) => { if (typeof o === 'string') out.push([p, o]); else if (Array.isArray(o)) o.forEach((x, i) => walkStrings(x, `${p}[${i}]`, out)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walkStrings(v, p ? `${p}.${k}` : k, out); return out; };
for (const d of dl) { if (PRI.has(d.id)) continue; const id = d.id; const af = `src/data/articles/${id}.json`; const a = fs.existsSync(af) ? J(af) : null;
  add(id, 'description（説明文の段落）', d.description, 'description'); const sd = (d.seo || d.carFree?.seo); if (sd) { add(id, 'seo.description（メタ）', sd.description, 'description'); add(id, 'seo.title（メタ）', sd.title, 'description'); }
  for (const sp of d.spots || []) { add(id, '見どころの説明', sp.description, 'spot'); if (sp.imageAlt) add(id, '画像のキャプション・alt', sp.imageAlt, 'description'); }
  if (a) { const scan = (h) => { add(id, 'lead', h.lead, 'lead'); (h.sections || []).forEach((s) => { add(id, '節の body', s.body, 'body'); add(id, '節の info', s.info, 'info'); if (s.imageAlt) add(id, '画像のキャプション・alt', s.imageAlt, 'description'); if (s.title) add(id, '節の見出し', s.title, 'description'); }); add(id, 'tips', typeof h.tips === 'string' ? h.tips : '', 'tips'); add(id, 'bestSeason', h.bestSeason, 'description'); if (h.modelCourse) for (const v of Object.values(h.modelCourse)) add(id, 'モデルコース', v, 'modelCourse'); if (h.image?.alt) add(id, '画像のキャプション・alt', h.image.alt, 'description'); if (h.stay?.name) add(id, '宿のカード', h.stay.name, 'description'); }; if (a.groups) a.groups.forEach(scan); else scan(a); }
  if (quizDesc[id]) add(id, '診断の説明データ（quizDesc）', quizDesc[id], 'description'); }
const byField = {}; for (const r of rows) { byField[r.欄] ||= { 文: 0, ページ: new Set() }; byField[r.欄].文++; byField[r.欄].ページ.add(r.page); }
const fieldTable = Object.fromEntries(Object.entries(byField).map(([k, v]) => [k, { 文: v.文, ページ: v.ページ.size }]));
// R1 の対象の欄（節の body・info・見どころの説明・tips）に残っているものの、残った理由
const R1F = new Set(['節の body', '節の info', '見どころの説明', 'tips']); const left = rows.filter((r) => R1F.has(r.欄)); const reasons = {}; const detail = [];
for (const r of left) { let why; if (keep.has(`${r.page}|${r.文}`)) why = '確認済みのリストに載っている（残す仕様）'; else if (isExperience(r.文, { type: r.type })) why = '体験談・行程案と判定（R1の対象外の仕様）'; else why = 'R1の漏れの可能性（理由を特定できず）'; reasons[why] = (reasons[why] || 0) + 1; detail.push({ ...r, 残った理由: why }); }
const out = { 優先以外のページ数: dl.filter((d) => !PRI.has(d.id)).length, 欄ごと: fieldTable, 数字を含む文の合計: rows.length, ページ数: new Set(rows.map((r) => r.page)).size, R1の対象の欄に残っている: { 文: left.length, ページ: new Set(left.map((r) => r.page)).size, 理由別: reasons, 欄別: left.reduce((m, r) => ((m[r.欄] = (m[r.欄] || 0) + 1), m), {}) }, モデルコース等_R1の対象外の欄: ['lead', 'description（説明文の段落）', 'モデルコース', 'bestSeason', '画像のキャプション・alt', 'seo.description（メタ）', 'seo.title（メタ）', '診断の説明データ（quizDesc）', '節の見出し', '宿のカード'].map((k) => [k, fieldTable[k] || { 文: 0, ページ: 0 }]) };
fs.mkdirSync(O, { recursive: true }); fs.writeFileSync(`${O}/survey_other_fields.json`, JSON.stringify({ ...out, 残っている文_R1の対象の欄: detail }, null, 1)); console.log(JSON.stringify(out, null, 1));
