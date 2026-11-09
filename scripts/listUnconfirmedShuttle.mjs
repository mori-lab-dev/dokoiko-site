// 公式で確認できていない宿（stayShuttleChecked.json の status が verified 以外）の送迎の文を一覧する（2026-11-09・読み取りのみ）。
// 使い方: node scripts/listUnconfirmedShuttle.mjs [--json 出力パス]
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const rec = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/stayShuttleChecked.json'), 'utf8')).stays;
const RE = /送迎|シャトル|お迎え|迎えに|迎えて|宿の車|宿の送迎|マイクロバス|無料バス/;
const split = (s) => (s ?? '').split(/(?<=[。！？\n])/).map((x) => x.trim()).filter(Boolean);
const rows = [];
const artDir = path.join(root, 'src/data/articles');
for (const d of dests) {
  const f = d.featured_stay; const r = f ? rec[f.name] : null;
  const unconfirmed = f && (!r || r.status !== 'verified');
  if (!unconfirmed) continue;
  const hits = [];
  if (f.shuttleInfo || f.hasShuttle) hits.push({ where: 'featured_stay', text: `hasShuttle=${f.hasShuttle} shuttleInfo=${f.shuttleInfo ?? ''}` });
  if (RE.test(f.catchcopy ?? '')) hits.push({ where: 'featured_stay.catchcopy', text: f.catchcopy });
  if (RE.test(f.accessStation ?? '')) hits.push({ where: 'featured_stay.accessStation', text: f.accessStation });
  for (const s of split(d.description)) if (RE.test(s)) hits.push({ where: 'description', text: s });
  for (const s of split(d.seo?.description)) if (RE.test(s)) hits.push({ where: 'seo.description', text: s });
  for (const s of split(d.catch)) if (RE.test(s)) hits.push({ where: 'catch', text: s });
  for (const sp of d.spots ?? []) for (const s of split(sp.description)) if (RE.test(s)) hits.push({ where: `spot:${sp.name}`, text: s });
  const ap = path.join(artDir, d.id + '.json');
  if (fs.existsSync(ap)) { const a = JSON.parse(fs.readFileSync(ap, 'utf8')); const parts = [['lead', a.lead], ...(a.sections ?? []).flatMap((s, i) => [[`section${i}.body`, s.body], [`section${i}.info`, s.info]]), ['tips', a.tips]];
    for (const [k, t] of parts) for (const s of split(t)) if (RE.test(s)) hits.push({ where: `article.${k}`, text: s }); }
  rows.push({ id: d.id, stay: f.name, status: r?.status ?? '記録なし', hits });
}
const j = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
if (j) fs.writeFileSync(j, JSON.stringify(rows, null, 1));
const by = {}; for (const r of rows) by[r.status] = (by[r.status] ?? 0) + 1;
console.log(`公式で確認できていない宿（featured_stay あり）: ${rows.length}軒`, JSON.stringify(by));
const withShuttle = rows.filter((r) => r.hits.length);
console.log(`うち送迎の文・設定がある宿: ${withShuttle.length}軒 / 文・設定 ${withShuttle.reduce((a, r) => a + r.hits.length, 0)}件`);
const kinds = {}; for (const r of withShuttle) for (const h of r.hits) kinds[h.where.split(':')[0].split('.')[0]] = (kinds[h.where.split(':')[0].split('.')[0]] ?? 0) + 1;
console.log(JSON.stringify(kinds));
