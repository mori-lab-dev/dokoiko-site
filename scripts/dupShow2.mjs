// 同名ページ統合の調査用・簡潔版（読み取りのみ）
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
for (const id of process.argv.slice(2)) {
  const d = dests.find((x) => x.id === id);
  console.log(`\n===== ${id} ${d.name} ${d.prefecture} ${d.city ?? ''} lat${d.lat} lng${d.lng} tags:${(d.tags ?? []).join(',')} mainSpot:${d.mainSpot ?? ''} destType:${d.destType}`);
  console.log('travelTime:', JSON.stringify(d.travelTime), 'est:', Object.keys(d.travelTimeEstimated ?? {}).join(','));
  console.log('catch:', d.catch, '| stayDescription:', d.stayDescription);
  console.log('description:', d.description);
  for (const s of d.spots ?? []) console.log(' spot:', s.name, '|', s.description, '| img', s.imageUrl ? 'y' : 'n');
  console.log('featured_stay:', JSON.stringify(d.featured_stay));
  console.log('seo:', JSON.stringify(d.seo)?.slice(0, 200), 'images:', JSON.stringify(d.images), 'carFree:', !!d.carFree);
  const ap = path.join(root, 'src/data/articles', id + '.json'); console.log('article:', fs.existsSync(ap) ? fs.readFileSync(ap, 'utf8').length + 'B' : 'なし');
}
