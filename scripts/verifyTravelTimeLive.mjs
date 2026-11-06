// travelTime 補正の本番実測（2026-11-06）。
//  - 公開データ /data/destinations.json で、補正した組（changes.json）の値・travelTimeOriginal・travelTimeEstimated が反映されている
//  - 所要時間の文を削除した旅先ページ（deletedSentences.json）に、削除した文が出ていない
//  - 補正した組があるハブページに「目安」が出ている
// 使い方: node scripts/verifyTravelTimeLive.mjs
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';

const ORIGIN = 'https://tabidokoiko.com';
const B = path.join(root, 'backup/travelTime_20261106');
const changes = JSON.parse(fs.readFileSync(path.join(B, 'changes.json'), 'utf8'));
const deleted = JSON.parse(fs.readFileSync(path.join(B, 'deletedSentences.json'), 'utf8'));
const get = async (url) => {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, { headers: { 'user-agent': 'Mozilla/5.0 dokoiko-verify' } });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
    return { status: r.status, text: await r.text() };
  }
  return { status: 429, text: '' };
};
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const bad = [];

const live = JSON.parse((await get(`${ORIGIN}/data/destinations.json`)).text);
const byId = new Map(live.map((d) => [d.id, d]));
let okPairs = 0;
for (const c of changes) {
  const d = byId.get(c.id);
  if (d?.travelTime?.[c.o] === c.to && d?.travelTimeOriginal?.[c.o] === c.from && d?.travelTimeEstimated?.[c.o]) okPairs++;
  else bad.push(`公開データ ${c.id}→${c.o}: ${d?.travelTime?.[c.o]}（期待${c.to}）`);
}
console.log(`公開データ: 補正した組 ${okPairs}/${changes.length} が反映`);

const ids = [...new Set(deleted.map((x) => x.id))];
let pagesOk = 0;
for (const id of ids) {
  const { status, text } = await get(`${ORIGIN}/destinations/${encodeURIComponent(id)}/`);
  if (status !== 200) { bad.push(`${id}: HTTP ${status}`); continue; }
  const body = dec(text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ''));
  // 記事の本文にも同じ文があるページは、記事側は削除しない（一覧で報告）ので、画面に残っていても数えない
  const af = path.join(root, 'src/data/articles', `${id}.json`);
  const art = fs.existsSync(af) ? fs.readFileSync(af, 'utf8') : '';
  const left = deleted.filter((x) => x.id === id && body.includes(x.sentence.replace(/。$/, '')) && !art.includes(x.sentence.replace(/。$/, '')));
  if (left.length) bad.push(`${id}: 削除した文が残る「${left[0].sentence.slice(0, 24)}」`); else pagesOk++;
}
console.log(`旅先ページ: 削除した文が出ていないページ ${pagesOk}/${ids.length}`);

const hubs = JSON.parse(fs.readFileSync(path.join(root, 'src/data/hubCities.json'), 'utf8'));
let hubOk = 0, hubN = 0;
for (const h of hubs) {
  const key = h.id === 'miyakojima' ? 'miyako' : h.id;
  const expectMark = live.some((d) => d.id !== h.id && d.travelTimeEstimated?.[key]);
  const { status, text } = await get(`${ORIGIN}/hub/${h.id}/`);
  if (status !== 200) { bad.push(`hub/${h.id}: HTTP ${status}`); continue; }
  hubN++;
  const marked = /class="h-card-est"|（目安）<\/h3>/.test(text);
  // 目安の付く旅先が、表示される上位8件に入らないハブもあるので、見出し・カードのどちらかが出ていれば足りる。出ていないハブはデータ側で確認する
  if (marked || !expectMark) hubOk++; else {
    const ttOk = live.filter((d) => d.travelTimeEstimated?.[key] && d.travelTime[key] <= 180).length;
    if (ttOk > 0) bad.push(`hub/${h.id}: 目安の表示なし（180分以内の見積もり ${ttOk}件）`); else hubOk++;
  }
}
console.log(`ハブページ: ${hubOk}/${hubN}`);
console.log(bad.length ? `❌ ${bad.length}件\n` + bad.slice(0, 20).join('\n') : '✅ 本番で実測OK');
process.exit(bad.length ? 1 : 0);
