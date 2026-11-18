// 優先ページ以外で、メタ・説明文の段落（dest.description）・メタの出どころの lead に、料金・休館日・営業時間の数字を含む文を一覧にし、確認担当への入力を作る（2026-11-18）
import fs from 'fs';
import { sents, kindOf } from './lib/factRules20261118.mjs';
const O = 'logs/nonpriority_meta_20261118'; const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dl = J('src/data/destinations.json'); const PRI = new Set(J('logs/merge_20261118/pages.json').filter((p) => p.表示_累計 >= 3).map((p) => p.id)); const KIND = ['料金', '休館日', '営業時間'];
const units = []; const by = new Map();
const add = (d, text, where) => { for (const s0 of (String(text).match(/[^。]+。?/g) || [])) { const s = s0.trim(); const k = kindOf(s); if (!k || !KIND.includes(k)) continue; const key = `${d.id}|${s}`; let u = by.get(key); if (!u) { u = { page: d.id, 名前: d.name, 県: d.prefecture, 種類: k, 文: s, 場所: [] }; by.set(key, u); units.push(u); } if (!u.場所.includes(where)) u.場所.push(where); } };
for (const d of dl) { if (PRI.has(d.id)) continue; if (d.description) add(d, d.description, 'description'); const sd = (d.seo || d.carFree?.seo)?.description; if (sd) add(d, sd, 'seo.description'); const af = `src/data/articles/${d.id}.json`; if (!(d.seo || d.carFree?.seo) && fs.existsSync(af)) { const a = J(af); if (a.lead) add(d, a.lead.slice(0, 120), 'lead'); } }
const pages = new Map(); for (const u of units) { if (!pages.has(u.page)) pages.set(u.page, { id: u.page, 旅先ページ: u.名前, 県: u.県, description: dl.find((d) => d.id === u.page).description, 文: [] }); pages.get(u.page).文.push({ 番号: pages.get(u.page).文.length + 1, 種類: u.種類, 文: u.文, 場所: u.場所 }); }
const list = [...pages.values()]; for (const p of list) fs.writeFileSync(`${O}/inputs/page_${p.id}.json`, JSON.stringify(p, null, 1));
const N = 20; list.sort((a, b) => b.文.length - a.文.length); const bins = Array.from({ length: N }, () => ({ ids: [], n: 0 })); for (const p of list) { const b = bins.reduce((m, x) => (x.n < m.n ? x : m)); b.ids.push(p.id); b.n += p.文.length; }
bins.forEach((b, i) => fs.writeFileSync(`${O}/batches/batch_${i + 1}.json`, JSON.stringify(b)));
const w = units.reduce((m, u) => { for (const x of u.場所) m[x] = (m[x] || 0) + 1; return m; }, {});
console.log(JSON.stringify({ 文: units.length, ページ: list.length, 場所別の文: w, 種類別: units.reduce((m, u) => ((m[u.種類] = (m[u.種類] || 0) + 1), m), {}), 複数の場所に同じ文: units.filter((u) => u.場所.length > 1).length, 組: bins.map((b) => `${b.n}/${b.ids.length}`).join(' ') }, null, 1));
