// travelTime の検査（2026-11-06）。
//  1. 最短値（scripts/travelTimeBound.mjs の lowerBound）を1.25倍以上下回る組が 0
//  2. 補正した組（travelTimeOriginal）と式由来の16出発地に travelTimeEstimated が付いている
//  3. ハブページ（dist）の時間帯に、見積もりの旅先へ「目安」が付いている（カードと見出し）
//  4. description に、疑わしい・式由来・travelTime と一致しない・値のない所要時間の文が残っていない
//  5. 変更前の travelTime のバックアップがある
// 使い方: node scripts/auditTravelTime.mjs（3 は dist が要る。無ければ飛ばして「dist なし」と出す）
import fs from 'fs';
import path from 'path';
import {
  root, ORIGINS, NAME_TO_KEY, FORMULA_ORIGINS, lowerBound, RATIO, originTimePattern, minutesOf, splitSentences, isAllowedText,
} from './travelTimeBound.mjs';

const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const hubs = JSON.parse(fs.readFileSync(path.join(root, 'src/data/hubCities.json'), 'utf8'));
const under = [], noEst = [], text = [];
let band = 0, estPairs = 0;
for (const d of dests) {
  for (const [key, v] of Object.entries(d.travelTime || {})) {
    if (!ORIGINS[key] || !(v > 0)) continue;
    const { lb } = lowerBound(d, key);
    if (lb / v >= RATIO) under.push(`${d.id}→${key} ${v}分（最短${Math.round(lb)}分）`);
    else if (v < lb - 0.5) band++;
    if (d.travelTimeEstimated?.[key]) estPairs++;
    if (FORMULA_ORIGINS[key] && !d.travelTimeEstimated?.[key]) noEst.push(`${d.id}:${key}（式由来）`);
  }
  for (const key of Object.keys(d.travelTimeOriginal || {})) if (!d.travelTimeEstimated?.[key]) noEst.push(`${d.id}:${key}（補正）`);
  for (const s of splitSentences(d.description)) {
    const re = originTimePattern(); let m;
    while ((m = re.exec(s))) {
      const key = NAME_TO_KEY[m[1]]; const v = d.travelTime?.[key];
      if (isAllowedText(d.id, s)) continue;
      if (d.travelTimeEstimated?.[key] || FORMULA_ORIGINS[key] || v == null || v !== minutesOf(m)) text.push(`${d.id}「${s.slice(0, 30)}」`);
    }
  }
}

// ハブページの「目安」
const distHub = path.join(root, 'dist/hub');
const noMark = [];
let hubChecked = 0;
if (fs.existsSync(distHub)) {
  for (const h of hubs) {
    const f = path.join(distHub, h.id, 'index.html');
    if (!fs.existsSync(f)) continue;
    hubChecked++;
    const html = fs.readFileSync(f, 'utf8');
    const ttKey = h.id === 'miyakojima' ? 'miyako' : h.id;
    const list = dests.filter((d) => d.id !== h.id).map((d) => ({ d, tt: d.travelTime?.[ttKey], hub: d.hub === h.name }))
      .filter((x) => x.tt !== undefined || x.hub).sort((a, b) => (a.tt || 999) - (b.tt || 999));
    const zones = [[0, 60], [60, 120], [120, 180]].map(([lo, hi]) => list.filter((x) => x.tt > lo && x.tt <= hi));
    const expectCards = zones.reduce((a, z) => a + z.slice(0, 8).filter((x) => x.d.travelTimeEstimated?.[ttKey]).length, 0);
    const gotCards = (html.match(/class="h-card-est"/g) || []).length;
    if (expectCards !== gotCards) noMark.push(`${h.id}（カード 期待${expectCards}・画面${gotCards}）`);
    const heads = ['〜60分', '1〜2時間', '2〜3時間'];
    zones.forEach((z, i) => {
      const want = z.some((x) => x.d.travelTimeEstimated?.[ttKey]);
      const has = new RegExp(`${heads[i]}（目安）</h3>`).test(html);
      if (want !== has) noMark.push(`${h.id}（見出し${heads[i]}）`);
    });
  }
}
const backupOk = fs.existsSync(path.join(root, 'backup/travelTime_20261106/travelTime.json'));
const fmt = (a) => (a.length ? ' ' + a.slice(0, 12).join(', ') + (a.length > 12 ? ` ほか${a.length - 12}件` : '') : '');
console.log(`travelTime ${dests.length} 旅先`);
console.log(`最短値を1.25倍以上下回る組: ${under.length}件${fmt(under)}`);
console.log(`travelTimeEstimated の付け忘れ: ${noEst.length}件${fmt(noEst)}`);
console.log(`ハブページの「目安」の欠け: ${noMark.length}件${fmt(noMark)}（確認したハブ ${hubChecked}${hubChecked ? '' : '・dist なし'}）`);
console.log(`description に残る疑わしい所要時間の文: ${text.length}件${fmt(text)}`);
console.log(`変更前の travelTime のバックアップ: ${backupOk ? 'あり' : 'なし'}`);
console.log(`参考: 最短値をわずかに下回る組（1.0〜1.25倍・触っていない）: ${band}件 / 目安の付いた組: ${estPairs}件`);
process.exit(under.length + noEst.length + noMark.length + text.length + (backupOk ? 0 : 1) ? 1 : 0);
