// featured_stay バッチの品質チェック: node scripts/qaStayBatch.mjs scripts/stays/n7.mjs
//
// 1. 紐づけ先の destination が存在し、座標を持つか
// 2. 宿名が他の destination の featured_stay と重複していないか
// 3. otaListed:false の宿は officialUrl が https で、実際に 200 を返すか
// 4. jalanUrl（記録用・画面には出ない）の <title> に宿名の主要部が含まれるか
// 5. 送迎: hasShuttle:true なら shuttleInfo があるか
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const STAYS = (await import(pathToFileURL(path.resolve(process.argv[2])).href)).default;
const all = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const byId = Object.fromEntries(all.map(d => [d.id, d]));
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'Accept-Language': 'ja' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function titleOf(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow' });
  const buf = Buffer.from(await r.arrayBuffer());
  let h = buf.toString('utf8');
  if (/�/.test(h.slice(0, 3000))) { try { h = new TextDecoder('shift_jis').decode(buf); } catch {} }
  const t = (h.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
  return { status: r.status, title: t.replace(/\s+/g, ' ').trim() };
}
const norm = s => (s || '').normalize('NFKC').replace(/[\s　・]/g, '').toLowerCase();

let ng = 0;
for (const [id, s] of Object.entries(STAYS)) {
  const d = byId[id];
  const issues = [];
  if (!d) issues.push('destination が存在しない');
  else if (typeof d.lat !== 'number' || typeof d.lng !== 'number') issues.push('destination に座標が無い');
  if (d && d.featured_stay?.name !== s.name) issues.push('適用されていない');

  const dup = all.filter(x => x.id !== id && x.featured_stay && norm(x.featured_stay.name) === norm(s.name));
  if (dup.length) issues.push(`宿名が重複: ${dup.map(x => x.id).join(',')}`);

  if (s.hasShuttle === true && !s.shuttleInfo) issues.push('hasShuttle:true なのに shuttleInfo が無い');

  let extra = '';
  if (s.otaListed === false) {
    if (!/^https:\/\//.test(s.officialUrl || '')) issues.push('officialUrl が https でない');
    else {
      try {
        const { status, title } = await titleOf(s.officialUrl);
        if (status !== 200) issues.push(`officialUrl HTTP ${status}`);
        extra = `公式=${status} 「${title.slice(0, 30)}」`;
      } catch (e) { issues.push(`officialUrl 取得失敗 ${e.message}`); }
      await sleep(1500);
    }
  }
  if (s.jalanUrl) {
    try {
      const { status, title } = await titleOf(s.jalanUrl);
      // 宿名の主要部（温泉地名などの接頭辞を除いた末尾の語）が title に含まれるか
      const key = s.name.split(/[\s　]/).pop();
      const hit = norm(title).includes(norm(key));
      if (status !== 200) issues.push(`jalanUrl HTTP ${status}`);
      else if (!hit) issues.push(`jalanUrl の宿名不一致: 「${title.slice(0, 40)}」`);
      extra += ` jalan=${status}${hit ? '✓' : '✗'}`;
    } catch (e) { issues.push(`jalanUrl 取得失敗 ${e.message}`); }
    await sleep(3000);
  }
  if (issues.length) ng++;
  console.log(`${issues.length ? 'NG' : 'OK'} ${id.padEnd(22)} ${s.name}  ${extra}`);
  for (const i of issues) console.log(`     - ${i}`);
}
console.log(`\n結果: ${Object.keys(STAYS).length - ng} OK / ${ng} NG`);
process.exit(ng ? 1 : 0);
