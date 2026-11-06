// 記事側（lead・本文・featured_stay・spots）の「{出発地}から約N分／N時間」の文を A / B / C に分ける（読み取りのみ・2026-11-06）。
//   A: 出発地が疑わしい組（最短値を下回る・補正した・式由来の出発地）の文
//   B: travelTime の値と食い違う文（±10分を超える。「〜かからない・以内」は上限として比べる。「ちょっと」は +15分まで許す）
//   C: 一致している、または出発地→旅先の所要時間でない文（駅・港・空港・IC など施設からの所要、旅先の中の移動、起点が旅先自身）
// 使い方: node scripts/classifyArticleTime.mjs [出力JSON]
import fs from 'fs';
import path from 'path';
import { root, ORIGINS, NAME_TO_KEY, FORMULA_ORIGINS, lowerBound, lowerBoundOld, RATIO, originTimePattern, minutesOf, baseValue } from './travelTimeBound.mjs';

export function classifyArticleTime(dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'))) {
const out = [];
const suspectOf = (d, key) => {
  const m0 = baseValue(d, key);
  if (m0 == null) return false;
  return m0 < lowerBoundOld(d, key).lb - 0.5 || m0 < lowerBound(d, key).lb - 0.5 || !!d.travelTimeOriginal?.[key];
};
const localTo = (d, name) => [d.name, d.city, d.hubCity, d.railGateway, d.airportGateway, d.busGateway, d.ferryGateway, d.mapPoint].some((v) => v && String(v).includes(name));
// 起点の直後（出発地名の後ろ）の1字: 駅・港・空港・IC・バス・市内などは施設からの所要
const FACILITY = /^(駅|港|空港|IC|インター|バスターミナル|バス停|市内|市街|町|村)/;

for (const d of dests) {
  const bodies = [];
  const f = path.join(root, 'src/data/articles', `${d.id}.json`);
  if (fs.existsSync(f)) {
    const a = JSON.parse(fs.readFileSync(f, 'utf8'));
    bodies.push(['記事lead', 'lead', a.lead]);
    (a.sections || []).forEach((s, i) => { bodies.push(['記事本文', `sections.${i}.body`, s.body]); bodies.push(['記事本文', `sections.${i}.info`, s.info]); });
  }
  (d.spots || []).forEach((s, i) => { if (s && typeof s === 'object') for (const k of ['description', 'desc']) if (s[k]) bodies.push(['spots', `spots.${i}.${k}`, s[k]]); });
  if (d.featured_stay && typeof d.featured_stay === 'object') for (const [k, v] of Object.entries(d.featured_stay)) if (typeof v === 'string') bodies.push(['featured_stay', `featured_stay.${k}`, v]);
  for (const [field, loc, t] of bodies) {
    if (!t) continue;
    for (const line of String(t).split(/(?<=。)|\n/)) {
      if (!line.trim()) continue;
      const re = originTimePattern(); let m; const hits = [];
      while ((m = re.exec(line))) {
        const key = NAME_TO_KEY[m[1]]; const text = minutesOf(m);
        const after = line.slice(m.index + m[0].length, m.index + m[0].length + 8);
        const between = line.slice(m.index + m[1].length, m.index + m[1].length + 2);
        const facility = FACILITY.test(line.slice(m.index + m[1].length));
        const upper = /^(?:も|)(かからない|かからず|以内|未満)/.test(after) || /^もかから/.test(after);
        const vague = /^(ちょっと|ほど|弱|強)/.test(after);
        const tt = baseValue(d, key);
        let cat, why;
        if (facility || localTo(d, m[1])) { cat = 'C'; why = facility ? `施設・域内（${m[1]}${between}）` : '起点が旅先自身'; }
        else if (suspectOf(d, key) || FORMULA_ORIGINS[key]) { cat = 'A'; why = suspectOf(d, key) ? '最短値を下回る・補正した組' : '式由来の出発地'; }
        else if (tt == null) { cat = 'C'; why = 'travelTime に値がない出発地'; }
        else {
          const diff = text - tt;
          const ok = upper ? tt <= text + 10 : vague ? diff >= -10 && diff <= 25 + 0 && Math.abs(diff) <= 25 : Math.abs(diff) <= 10;
          cat = ok ? 'C' : 'B'; why = ok ? `一致（文${text}分・値${tt}分）` : `文${text}分${upper ? '(上限)' : vague ? '(約)' : ''}・travelTime ${tt}分`;
        }
        hits.push({ origin: m[1], key, text, tt: tt ?? null, cat, why });
      }
      if (!hits.length) continue;
      const cat = hits.some((h) => h.cat === 'A') ? 'A' : hits.some((h) => h.cat === 'B') ? 'B' : 'C';
      out.push({ id: d.id, name: d.name, field, loc, line: line.trim(), cat, hits });
    }
  }
}
return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
const out = classifyArticleTime();
const cnt = {};
for (const x of out) { cnt[x.cat] = (cnt[x.cat] || 0) + 1; }
console.log(`所要時間の文 ${out.length}文（${new Set(out.map((x) => x.id)).size}旅先）`, cnt);
const byField = {};
for (const x of out) { const k = `${x.cat}:${x.field}`; byField[k] = (byField[k] || 0) + 1; }
console.log(byField);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 2) + '\n');
}
