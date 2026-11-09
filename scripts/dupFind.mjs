// 指定の文字列を含む旅先と、特定idを参照している場所を探す（読み取りのみ）。node scripts/dupFind.mjs <文字列|id>...
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
for (const q of process.argv.slice(2)) {
  console.log('==', q);
  for (const d of dests) if (d.id.includes(q) || d.name.includes(q) || (d.featured_stay?.name ?? '').includes(q)) console.log(`  ${d.id} ${d.name} ${d.prefecture} stay:${d.featured_stay?.name ?? ''}`);
}
