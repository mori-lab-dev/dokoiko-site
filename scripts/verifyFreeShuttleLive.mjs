// 公式で確認できない送迎の「無料」を外した文が、本番から消えていることの実測（2026-11-06）。
//   node scripts/verifyFreeShuttleLive.mjs   backup/stay_free_20261106/before_after.json の変更前の文が本番に無く、変更後の文が出ていること
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';
const log = JSON.parse(fs.readFileSync(path.join(root, 'backup/stay_free_20261106/before_after.json'), 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;');
const cache = new Map();
async function page(id) {
  if (cache.has(id)) return cache.get(id);
  let t = '';
  for (let i = 0; i < 4; i++) { const r = await fetch(`https://tabidokoiko.com/destinations/${encodeURIComponent(id)}/?_=${Date.now()}`); if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; } t = r.status === 200 ? await r.text() : ''; break; }
  cache.set(id, t); return t;
}
let goneOk = 0, newOk = 0, newN = 0; const ng = [];
for (const l of log) {
  const h = await page(l.destId);
  if (!h.includes(esc(l.before))) goneOk++; else ng.push(`${l.destId} ${l.field}: 変更前の文が残る`);
  if (l.after && l.after !== '(文ごと削除)') { newN++; if (h.includes(esc(l.after))) newOk++; else ng.push(`${l.destId} ${l.field}: 変更後の文が出ない`); }
}
// 確認できない宿の「無料」を含む送迎の文が、旅先ページに出ていないこと（確認済みで残した宿は対象外）
console.log(`変更 ${log.length}件: 変更前の文が本番に無い ${goneOk}/${log.length} / 変更後の文が出ている ${newOk}/${newN}`);
for (const x of ng) console.log('  NG ' + x);
process.exit(ng.length ? 1 : 0);
