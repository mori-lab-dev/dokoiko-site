// featured_stay の送迎の文の点検（2026-11-06）。
//  ・「無料」と書いた送迎が、宿の公式サイトで「無料」と確認できた宿のものか（記録: scripts/data/stayShuttleChecked.json）
//  ・公式サイトで確認した宿（verified）で、公式に「無料」の記載が無いのに「無料」と書いていないか
//  ・確認の記録が無い宿が、送迎の文を持っていないか（新しい宿を足したら記録も足す）
//  ・参考: 公式サイトを特定できない・開けない・送迎の記載を読めなかった宿（触っていない）の数
// 使い方: node scripts/auditStayShuttle.mjs
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';

const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const rec = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/stayShuttleChecked.json'), 'utf8')).stays;
let freeUnbacked = 0, noRecord = 0, unconfirmed = 0, unconfirmedFree = 0, confirmed = 0; const ex = [];
for (const d of dests) {
  const f = d.featured_stay; if (!f || !f.shuttleInfo) continue;
  const r = rec[f.name];
  if (!r) { noRecord++; ex.length < 5 && ex.push(`記録なし: ${d.id} ${f.name}`); continue; }
  const free = /無料/.test(f.shuttleInfo);
  if (r.status === 'verified') { confirmed++; if (free && r.free_on_official !== true) { freeUnbacked++; ex.length < 5 && ex.push(`公式に無料の記載なし: ${d.id} ${f.name}: ${f.shuttleInfo}`); } }
  else { unconfirmed++; if (free) unconfirmedFree++; }
}
console.log(`送迎の文のある宿（旅先単位）: 公式で確認済み ${confirmed} / 公式で確認できず（触っていない）${unconfirmed}（うち「無料」を含む ${unconfirmedFree}）`);
for (const e of ex) console.log('  ' + e);
console.log(`公式に「無料」の記載がないのに「無料」と書いている（確認済みの宿）: ${freeUnbacked}件`);
console.log(`確認の記録が無い宿の送迎の文: ${noRecord}件`);
process.exit(freeUnbacked || noRecord ? 1 : 0);
