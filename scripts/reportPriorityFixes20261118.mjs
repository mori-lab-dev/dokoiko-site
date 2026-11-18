// 優先ページの修正・削除の集計（判定の内訳・直した/削除した/触らない件数・本文字数の変化・空の欄・途切れ）を、適用前のファイルにメモリ上で当てて出す（2026-11-18）。
import fs from 'fs';
const D = 'logs/priority_fix_20261118'; const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const edits = J('scripts/data/mergeFactFixes20261118d.json').fixes[0].edits;
const dests = J('src/data/destinations.json'); const byId = new Map(dests.map((d) => [d.id, d]));
const cache = new Map(); const load = (f) => { if (!cache.has(f)) cache.set(f, J(f)); return cache.get(f); };
const arts = new Map(); for (const d of dests) { const f = `src/data/articles/${d.id}.json`; if (fs.existsSync(f)) arts.set(d.id, load(f)); }
const bodyLen = (id) => { const d = byId.get(id), a = arts.get(id); let n = String(d.description || '').length;
  if (a) { const sc = (h) => (h.sections || []).reduce((t, s) => t + String(s.body || '').length + String(s.info || '').length, 0) + String(h.lead || '').length + String(typeof h.tips === 'string' ? h.tips : '').length + String(h.bestSeason || '').length + (h.modelCourse ? Object.values(h.modelCourse).join('').length : 0); n += a.groups ? a.groups.reduce((t, g) => t + sc(g), 0) : sc(a); }
  else n += (d.spots || []).reduce((t, s) => t + String(s.description || '').length, 0); return n; };
const pages = [...new Set(edits.map((e) => e.page))]; const before = new Map(pages.map((p) => [p, bodyLen(p)]));
const holderOf = (e) => { const data = load(e.file); if (e.spot) { const sp = data.find((x) => x.id === e.spot[0]).spots.find((s) => s.name === e.spot[1]); return [sp, 'description']; } const g = e.group ? data.groups.find((x) => x.id === e.group) : data; const ks = e.field.split('.'); const key = ks.pop(); return [ks.length ? ks.reduce((a, k) => a[k], g) : g, key]; };
const origText = new Map(); const emptied = []; const cut = [];
const endsOk = (t) => String(t).split('\n').map((x) => x.trim()).filter(Boolean).every((l) => (/：/.test(l) && !l.includes('。')) || (l.match(/[^。]+。?/g) || []).every((x) => /[。！？!?）)」』]$/.test(x.trim())));
for (const e of edits) { const [h, k] = holderOf(e); const key = `${e.file}|${e.group || ''}|${e.field || e.spot}`; if (!origText.has(key)) origText.set(key, { page: e.page, text: h[k], h, k }); h[k] = h[k].replace(e.old, e.new); }
for (const [, o] of origText) { const now = o.h[o.k]; if (String(o.text).trim() && !String(now).trim()) emptied.push(o.page); if (endsOk(o.text) && !endsOk(now)) cut.push(o.page); }
const after = new Map(pages.map((p) => [p, bodyLen(p)]));
const rows = pages.map((p) => ({ id: p, 名前: byId.get(p).name, 前: before.get(p), 後: after.get(p), 減: before.get(p) - after.get(p), 率: +((before.get(p) - after.get(p)) / before.get(p) * 100).toFixed(1) })).sort((a, b) => b.減 - a.減);
const sorted = rows.map((r) => r.減).sort((a, b) => a - b); const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
const by = (k) => edits.reduce((m, e) => ((m[e[k]] = (m[e[k]] || 0) + 1), m), {});
const out = { 編集: edits.length, 規則別: by('rule'), 種類別: by('種類'), 影響ページ: pages.length, 本文字数の減り: { 最小: sorted[0], p25: q(0.25), 中央値: q(0.5), p75: q(0.75), p90: q(0.9), 最大: sorted[sorted.length - 1] }, 減る割合の最大: Math.max(...rows.map((r) => r.率)), 後が600字未満: rows.filter((r) => r.後 < 600).map((r) => ({ id: r.id, 前: r.前, 後: r.後 })), 前が600字以上で後が600字未満: rows.filter((r) => r.前 >= 600 && r.後 < 600).length, 前が1000字以上で後が1000字未満: rows.filter((r) => r.前 >= 1000 && r.後 < 1000).length, 空になる欄: emptied, 途中で切れた形になる欄: cut, ページごと: rows };
fs.writeFileSync(`${D}/length_report.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, ページごと: undefined }, null, 1));
