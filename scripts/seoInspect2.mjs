// seo.title を持つ旅先（手書き）と、seo の形の内訳（読み取りのみ）
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const keys = {}; for (const d of dests) if (d.seo) { const k = Object.keys(d.seo).join('+'); keys[k] = (keys[k] ?? 0) + 1; }
console.log(keys);
for (const d of dests) { const s = d.seo ?? d.carFree?.seo; if (s?.title) console.log(d.id, d.name, '|', s.title); }
const nm = new Map(); for (const d of dests) nm.set(d.name, [...(nm.get(d.name) ?? []), d.id]);
console.log('同名:', [...nm].filter(([, v]) => v.length > 1).map(([k, v]) => k + ':' + v.join('/')).join(' ; '));
