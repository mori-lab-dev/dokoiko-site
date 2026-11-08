// seo を持つ旅先の一覧と同名ページ（読み取りのみ）
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const names = new Map(); for (const d of dests) { const k = d.name; names.set(k, [...(names.get(k) ?? []), d.id]); }
const pick = JSON.parse(fs.readFileSync(path.join(root, 'logs/gsc/_pick.json'), 'utf8')).filter((r) => r.id);
for (const r of pick.slice(0, 45)) { const d = dests.find((x) => x.id === r.id); const s = d.seo ?? d.carFree?.seo; const dup = names.get(d.name).length > 1 ? ' 同名:' + names.get(d.name).join('/') : ''; console.log(`${r.id} ${r.i} ${s ? 'SEO[' + (d.seo ? 'seo' : 'carFree') + '] ' + s.title : ''}${dup}`); }
console.log('seoあり合計', dests.filter((d) => d.seo).length, 'carFree.seo', dests.filter((d) => d.carFree?.seo).length);
