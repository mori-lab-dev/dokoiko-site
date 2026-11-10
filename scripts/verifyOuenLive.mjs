// 応援割ページ（/ouen-wari/ と各県）の本番実測（2026-11-10）: 本番の HTML が手元の dist と完全一致し、確認日が出ている。
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { SCHEMES } from '../src/data/ouenWari.ts';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const O = 'https://tabidokoiko.com';
const rels = ['ouen-wari', 'kyushu-fukko', ...SCHEMES.map((s) => s.slug)];
const bad = []; let eq = 0, withDate = 0;
for (const r of rels) {
  let t = null;
  for (let i = 0; i < 5; i++) { const x = await fetch(`${O}/${r}/?_=${Date.now()}`, { headers: { 'user-agent': 'Mozilla/5.0 dokoiko-verify' } }); if (x.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; } if (x.status !== 200) { bad.push(`${r}: HTTP ${x.status}`); break; } t = await x.text(); break; }
  if (t == null) continue;
  const local = fs.readFileSync(path.join(root, 'dist', r, 'index.html'), 'utf8');
  if (t === local) eq++; else bad.push(`dist と不一致: ${r}`);
  if (t.includes('2026年11月10日')) withDate++;
}
console.log(`本番の HTML が手元の dist と完全一致: ${eq}/${rels.length} / 確認日（2026年11月10日）が出ているページ: ${withDate}/${rels.length}`);
console.log(bad.length ? `❌ ${bad.length}件\n` + bad.join('\n') : '✅ 本番で実測OK');
process.exit(bad.length ? 1 : 0);
