// 同名ページ統合の調査用（読み取りのみ）。node scripts/dupShow.mjs id1 id2 ...
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
for (const id of process.argv.slice(2)) {
  const d = dests.find((x) => x.id === id);
  console.log('\n=====', id, d.name, d.prefecture, d.city ?? '', JSON.stringify(d.coordinates ?? d.lat ? { lat: d.lat, lng: d.lng, c: d.coordinates } : ''));
  const { description, spots, featured_stay, article, ...rest } = d;
  console.log('rest:', JSON.stringify(rest));
  console.log('description:', description);
  console.log('spots:', JSON.stringify(spots, null, 0));
  console.log('featured_stay:', JSON.stringify(featured_stay));
  const ap = path.join(root, 'src/data/articles', id + '.json'); console.log('article file:', fs.existsSync(ap) ? fs.readFileSync(ap, 'utf8').length + ' bytes' : 'なし');
  for (const p of [`public/images/${id}`, `public/images/${id}.jpg`]) console.log(p, fs.existsSync(path.join(root, p)) ? (fs.statSync(path.join(root, p)).isDirectory() ? fs.readdirSync(path.join(root, p)).join(',') : 'あり') : 'なし');
}
