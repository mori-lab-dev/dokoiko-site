// 公式で確認できていない宿の送迎に「無料」を含む記載の洗い出し（読み取りのみ・2026-11-06）。
// 対象: backup/stay_shuttle_20261106/untouched.json の宿の旅先。shuttleInfo・description・catch・旅先本文(記事)・spots・featured_stay の文で、
//       「無料」を含み、送迎・シャトル・迎え・バスのどれかと同じ文にあるもの。
// 使い方: node scripts/listUnconfirmedFreeShuttle.mjs [出力JSON]
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const un = JSON.parse(fs.readFileSync(path.join(root, 'backup/stay_shuttle_20261106/untouched.json'), 'utf8'));
const byDest = new Map(un.map((u) => [u.destId, u]));
const CTX = /送迎|シャトル|迎え|お迎え|ピックアップ|バス|送り/;
const rows = [];
for (const [id, u] of byDest) {
  const d = dests.find((x) => x.id === id); if (!d) continue;
  const hits = [];
  const scan = (field, text) => { for (const s of String(text || '').split(/(?<=。)|\n/)) if (s.includes('無料') && CTX.test(s)) hits.push({ field, sentence: s.trim() }); };
  const f = d.featured_stay || {};
  scan('featured_stay.shuttleInfo', f.shuttleInfo); scan('featured_stay.catchcopy', f.catchcopy); scan('featured_stay.accessStation', f.accessStation);
  scan('description', d.description); scan('catch', d.catch); scan('seo.description', d.seo?.description);
  (d.spots || []).forEach((s, i) => scan(`spots.${i}`, s?.description));
  const af = path.join(root, 'src/data/articles', `${id}.json`);
  if (fs.existsSync(af)) { const a = JSON.parse(fs.readFileSync(af, 'utf8')); scan('article.lead', a.lead); (a.sections || []).forEach((s, i) => { scan(`article.sections.${i}.body`, s.body); scan(`article.sections.${i}.info`, s.info); }); }
  if (hits.length) rows.push({ destId: id, dest: d.name, weight: d.weight ?? 1, stay: u.stay, status: u.status, hits });
}
rows.sort((a, b) => b.weight - a.weight || b.hits.length - a.hits.length);
const stays = new Set(rows.map((r) => r.stay));
console.log(`対象 旅先 ${rows.length}件 / 宿 ${stays.size}軒 / 「無料」を含む文 ${rows.reduce((s, r) => s + r.hits.length, 0)}文`);
const byStatus = {}; for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1; console.log('状態別(旅先):', JSON.stringify(byStatus));
const byField = {}; for (const r of rows) for (const h of r.hits) { const k = h.field.replace(/\.\d+/g, ''); byField[k] = (byField[k] || 0) + 1; } console.log('場所別:', JSON.stringify(byField));
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 2) + '\n');
