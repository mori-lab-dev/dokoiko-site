// 全旅先ページのメタ（title・description・og:description・twitter・構造化データの description）の数字の調査（2026-11-18・読み取りのみ。変更しない）
import fs from 'fs';
import { sents, kindOf } from './lib/factRules20261118.mjs';
const O = 'logs/priority_meta_20261118'; const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const meta = J(`${O}/meta_after.json`); const dl = J('src/data/destinations.json'); const byId = new Map(dl.map((d) => [d.id, d]));
const PRI = new Set(J('logs/merge_20261118/pages.json').filter((p) => p.表示_累計 >= 3).map((p) => p.id));
const KINDS = ['料金', '休館日', '営業時間', '時刻', '標高・距離', '年号', 'その他の数値'];
const field = (m) => [['title', m.title], ['description', m.description], ['og:description', m.ogDescription], ['twitter:description', m.twDescription], ...m.ldDescriptions.map((x, i) => [`構造化データ description[${i}]`, x])];
const stat = { 全体: {}, 優先: {}, 優先以外: {} }; const pagesBy = {}; const items = [];
const bump = (grp, k, id, n = 1) => { stat[grp][k] ||= { 文: 0, ページ: new Set() }; stat[grp][k].文 += n; stat[grp][k].ページ.add(id); };
let withNum = { 優先: new Set(), 優先以外: new Set() };
for (const [id, m] of Object.entries(meta)) { const grp = PRI.has(id) ? '優先' : '優先以外'; const seen = new Set(); const src = (() => { const d = byId.get(id); const a = fs.existsSync(`src/data/articles/${id}.json`) ? J(`src/data/articles/${id}.json`) : null; return (d.seo || d.carFree?.seo) ? 'seo.description' : a?.lead ? 'lead（先頭120字）' : 'description（整形）'; })();
  const texts = new Map(); for (const [f, t] of field(m)) { if (!t) continue; if (!texts.has(t)) texts.set(t, []); texts.get(t).push(f); }
  for (const [t, fs_] of texts) for (const s of sents(t)) { const k = kindOf(s); if (!k) continue; const key = `${k}|${s}`; if (seen.has(key)) continue; seen.add(key); bump('全体', k, id); bump(grp, k, id); withNum[grp].add(id); items.push({ page: id, 名前: byId.get(id).name, 優先: grp === '優先', メタの出どころ: src, 種類: k, 文: s, 欄: fs_ }); } }
const fmt = (o) => Object.fromEntries(KINDS.map((k) => [k, { 文: o[k]?.文 || 0, ページ: o[k]?.ページ.size || 0 }]));
const R1 = items.filter((x) => !x.優先 && ['料金', '休館日', '営業時間'].includes(x.種類));
const out = { 旅先ページ: Object.keys(meta).length, 優先ページ: Object.keys(meta).filter((i) => PRI.has(i)).length, 優先以外: Object.keys(meta).filter((i) => !PRI.has(i)).length, 全体: fmt(stat.全体), 優先: fmt(stat.優先), 優先以外: fmt(stat.優先以外), 数字を含むメタのページ: { 優先: withNum.優先.size, 優先以外: withNum.優先以外.size }, 優先以外_料金休館日営業時間: { 文: R1.length, ページ: new Set(R1.map((x) => x.page)).size, 種類別: Object.fromEntries(['料金', '休館日', '営業時間'].map((k) => [k, { 文: R1.filter((x) => x.種類 === k).length, ページ: new Set(R1.filter((x) => x.種類 === k).map((x) => x.page)).size }])), メタの出どころ別ページ: R1.reduce((m, x) => ((m[x.メタの出どころ] = (m[x.メタの出どころ] || new Set()).add(x.page)), m), {}) } };
for (const k of Object.keys(out.優先以外_料金休館日営業時間.メタの出どころ別ページ)) out.優先以外_料金休館日営業時間.メタの出どころ別ページ[k] = out.優先以外_料金休館日営業時間.メタの出どころ別ページ[k].size;
// メタの出どころの内訳（全ページ）
const srcCount = {}; for (const id of Object.keys(meta)) { const d = byId.get(id); const a = fs.existsSync(`src/data/articles/${id}.json`) ? J(`src/data/articles/${id}.json`) : null; const s = (d.seo || d.carFree?.seo) ? 'seo.description' : a?.lead ? 'lead（先頭120字）' : 'description（整形）'; srcCount[s] = (srcCount[s] || 0) + 1; } out.メタの出どころ_全ページ = srcCount;
fs.writeFileSync(`${O}/survey_meta_numbers.json`, JSON.stringify({ ...out, items }, null, 1)); fs.writeFileSync(`${O}/survey_r1_candidates.json`, JSON.stringify(R1, null, 1)); console.log(JSON.stringify(out, null, 1));
