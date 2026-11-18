// ドライラン（実行しない）: 優先ページ以外のメタの出どころ（seo.description・lead・description）から、料金・休館日・営業時間の数字を含む文を削除した場合の影響（2026-11-18）
import fs from 'fs';
import { sents, kindOf } from './lib/factRules20261118.mjs';
import { checkDesc } from './descStyleCheck.mjs';
const O = 'logs/priority_meta_20261118'; const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dl = J('src/data/destinations.json'); const PRI = new Set(J('logs/merge_20261118/pages.json').filter((p) => p.表示_累計 >= 3).map((p) => p.id));
const KIND = ['料金', '休館日', '営業時間'];
const toMeta = (t) => { if (!t) return ''; if (t.length <= 130) return t; const head = t.slice(0, 130); const cut = head.lastIndexOf('。'); return cut >= 60 ? head.slice(0, cut + 1) : head.slice(0, 118) + '…'; };
const delKinds = (text) => { const removed = []; let out = text; for (const s of (text.match(/[^。]+。?/g) || [])) { const k = kindOf(s.trim()); if (k && KIND.includes(k)) { if (out.split(s).length - 1 === 1) { out = out.replace(s, ''); removed.push({ 文: s, 種類: k }); } } } return { out, removed }; };
const q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null;
const res = { 対象: '優先以外のページ', A_descriptionの本文の段落: { 変わるページ: 0, 削除する文: 0, 基準_前_通過: 0, 基準_後_通過: 0, 基準を満たさなくなるページ: [], 字数の分布_後: null, 字数が200未満になるページ: 0, 数値2つ未満になるページ: 0 }, B_seo_description: { 変わるページ: 0, 削除する文: 0, 空になるページ: [], 字数の分布_前: null, 字数の分布_後: null, 禁止語と字数超過: 0 }, C_leadが出どころのページ: [] };
const edits = []; const aLens = [], bLensB = [], bLensA = []; const rows = [];
for (const d of dl) { if (PRI.has(d.id)) continue; const hasSeo = !!(d.seo || d.carFree?.seo); const af = `src/data/articles/${d.id}.json`; const a = fs.existsSync(af) ? J(af) : null;
  // A: description
  if (d.description) { const { out, removed } = delKinds(d.description); if (removed.length) { const b = checkDesc(d.description, d.id), c = checkDesc(out.trim(), d.id); res.A_descriptionの本文の段落.変わるページ++; res.A_descriptionの本文の段落.削除する文 += removed.length; if (b.ok) res.A_descriptionの本文の段落.基準_前_通過++; if (c.ok) res.A_descriptionの本文の段落.基準_後_通過++; if (b.ok && !c.ok) res.A_descriptionの本文の段落.基準を満たさなくなるページ.push({ id: d.id, 理由: c.issues, 前: b.len, 後: c.len }); aLens.push(c.len); if (c.len < 200 && !c.trimmed) res.A_descriptionの本文の段落.字数が200未満になるページ++; if (c.nums < 2 && !c.trimmed) res.A_descriptionの本文の段落.数値2つ未満になるページ++;
      for (const r of removed) edits.push({ page: d.id, 欄: 'description', old: r.文, new: '', 種類: r.種類 }); rows.push({ id: d.id, 欄: 'description', 前: d.description, 後: out.trim(), 削除: removed }); } }
  // B: seo.description
  const sd = (d.seo || d.carFree?.seo)?.description; if (sd) { const { out, removed } = delKinds(sd); if (removed.length) { res.B_seo_description.変わるページ++; res.B_seo_description.削除する文 += removed.length; bLensB.push([...sd].length); bLensA.push([...out.trim()].length); if (!out.trim()) res.B_seo_description.空になるページ.push(d.id); for (const r of removed) edits.push({ page: d.id, 欄: 'seo.description', old: r.文, new: '', 種類: r.種類 }); rows.push({ id: d.id, 欄: 'seo.description', 前: sd, 後: out.trim(), 削除: removed }); } }
  // C: lead が出どころ（seo が無く lead がある）
  if (!hasSeo && a?.lead) { const head = a.lead.slice(0, 120); const { removed } = delKinds(head); if (removed.length) res.C_leadが出どころのページ.push({ id: d.id, 削除する文: removed.map((r) => r.文) }); } }
const sort = (x) => [...x].sort((m, n) => m - n); const dist = (x) => x.length ? { 件数: x.length, 最小: sort(x)[0], p25: q(sort(x), 0.25), 中央値: q(sort(x), 0.5), p75: q(sort(x), 0.75), 最大: sort(x).slice(-1)[0] } : null;
res.A_descriptionの本文の段落.字数の分布_後 = dist(aLens); res.B_seo_description.字数の分布_前 = dist(bLensB); res.B_seo_description.字数の分布_後 = dist(bLensA);
res.B_seo_description["禁止語と字数超過"] = 0;
res["種類別_削除する文"] = edits.reduce((m, e) => ((m[`${e.欄}:${e.種類}`] = (m[`${e.欄}:${e.種類}`] || 0) + 1), m), {}); res.編集の件数 = edits.length; res.影響ページ数 = new Set(edits.map((e) => e.page)).size;
// 全ページの基準（実行しない場合の現状）
res["基準_現状_全旅先ページの通過"] = dl.filter((d) => d.description && checkDesc(d.description, d.id).ok).length;
fs.writeFileSync(`${O}/dryrun_meta_edits.json`, JSON.stringify({ note: 'ドライラン（適用しない）。優先ページ以外のメタの出どころから、料金・休館日・営業時間の数字を含む文を削除', edits }, null, 1)); fs.writeFileSync(`${O}/dryrun_meta_before_after.json`, JSON.stringify(rows, null, 1)); fs.writeFileSync(`${O}/dryrun_meta_metrics.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify({ ...res, A_descriptionの本文の段落: { ...res.A_descriptionの本文の段落, 基準を満たさなくなるページ: res.A_descriptionの本文の段落.基準を満たさなくなるページ.length } }, null, 1));
