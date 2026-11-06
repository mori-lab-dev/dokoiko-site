// 本番の旅先ページで、送迎の文が公式の記載に合わせた内容になっているかの実測（2026-11-06）。
//   node scripts/verifyStayShuttleLive.mjs [--wait]   --wait: 反映されるまで最大10分、30秒おきに取り直す
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';
const ch = JSON.parse(fs.readFileSync(path.join(root, 'backup/stay_shuttle_20261106/changes.json'), 'utf8'));
const wait = process.argv.includes('--wait');
const esc = (s) => s.replace(/&/g, '&amp;');
async function get(id) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://tabidokoiko.com/destinations/${encodeURIComponent(id)}/?_=${Date.now()}`);
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
    return r.status === 200 ? r.text() : '';
  }
  return '';
}
async function run() {
  let okNew = 0, ngNew = [], okOld = 0, ngOld = [];
  for (const c of ch) {
    const h = await get(c.destId);
    if (c.to) { if (h.includes(esc(c.to))) okNew++; else ngNew.push(c.destId); }
    if (c.from && c.from !== c.to) { if (!h.includes(esc(c.from))) okOld++; else ngOld.push(c.destId); }
  }
  return { okNew, ngNew, okOld, ngOld, n: ch.length };
}
let r;
for (let i = 0; i < (wait ? 20 : 1); i++) { r = await run(); if (!r.ngNew.length && !r.ngOld.length) break; if (wait) await new Promise((s) => setTimeout(s, 30000)); }
console.log(`変更 ${r.n}件: 新しい文が出ている ${r.okNew}/${ch.filter((c) => c.to).length} / 古い文が消えている ${r.okOld}/${ch.filter((c) => c.from && c.from !== c.to).length}`);
if (r.ngNew.length) console.log('新しい文が出ない: ' + r.ngNew.join(', '));
if (r.ngOld.length) console.log('古い文が残る: ' + r.ngOld.join(', '));
process.exit(r.ngNew.length || r.ngOld.length ? 1 : 0);
