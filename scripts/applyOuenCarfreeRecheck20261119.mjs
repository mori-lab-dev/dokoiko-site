#!/usr/bin/env node
/** applyOuenCarfreeRecheck20261119.mjs — 応援割・車なし旅の出典の取り直し（2026-11-19）の結果を適用する。変更なし→確認日だけ 2026年11月19日 に。変更あり→公式の記載に合わせて直す。確認できず→「公式の記載では確認できません」の文に。 */
import fs from 'fs';
const NEW = '2026年11月19日', OLD = '2026年11月4日';
const items = JSON.parse(fs.readFileSync('logs/ouen_carfree_20261119/items.json', 'utf8')); const res = new Map();
for (let g = 1; g <= 6; g++) for (const r of JSON.parse(fs.readFileSync(`logs/ouen_carfree_20261119/results/g${g}.json`, 'utf8'))) res.set(r.id, r);
const OVERRIDE = { 'kurokawa-k#4': '九州産交バスの案内では、「一部予約制（座席定員制）」で、予約できない区間もあると書かれています。九州横断バスの停留所に「黒川温泉」があるかは、公式の記載では確認できません。' };
const log = [];
// 応援割（src/data/ouenWari.ts）
let ts = fs.readFileSync('src/data/ouenWari.ts', 'utf8');
for (const it of items.filter((i) => i.種類 === '応援割')) {
  const r = res.get(it.id); const body = it.値; const key = `body: '${body.slice(0, 40)}`; const s0 = ts.indexOf(`slug: '${it.slug}'`); if (s0 < 0) throw new Error('slug なし ' + it.slug); const s1 = ts.indexOf("slug: '", s0 + 10); const blk = ts.slice(s0, s1 < 0 ? undefined : s1); if (blk.split(key).length !== 2) throw new Error('body がスキーム内で1回でない ' + it.id);
  const bi = s0 + blk.indexOf(key); const ci = ts.indexOf(`checked: '${OLD}'`, bi); const nextBody = ts.indexOf("body: '", bi + 10); if (ci < 0 || (nextBody > 0 && ci > nextBody)) throw new Error('checked が見つからない ' + it.id);
  let mid = ts.slice(bi, ci);
  if (r.判定 === '変更あり') { const nb = r.新しい記載; if (!mid.includes(body)) throw new Error('body 全文が合わない ' + it.id); mid = mid.replace(body, nb.replace(/'/g, "\\'")); }
  ts = ts.slice(0, bi) + mid + `checked: '${NEW}'` + ts.slice(ci + `checked: '${OLD}'`.length);
  log.push({ id: it.id, 判定: r.判定, 前: r.判定 === '変更あり' ? body : undefined, 後: r.判定 === '変更あり' ? r.新しい記載 : undefined });
}
fs.writeFileSync('src/data/ouenWari.ts', ts);
// 車なし旅（destinations.json の carFree）
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
for (const it of items.filter((i) => i.種類 === '車なし旅')) {
  const r = res.get(it.id); const d = dests.find((x) => x.id === it.slug); const item = d.carFree.items.find((x) => x.label === it.項目 && x.body === it.値); if (!item) throw new Error('項目なし ' + it.id);
  let nb = null; if (r.判定 === '変更あり') nb = r.新しい記載; if (OVERRIDE[it.id]) nb = OVERRIDE[it.id];
  if (nb) { item.body = nb; }
  item.checked = NEW; log.push({ id: it.id, 判定: OVERRIDE[it.id] ? '確認できず→記載を直した' : r.判定, 前: nb ? it.値 : undefined, 後: nb || undefined });
}
for (const id of new Set(items.filter((i) => i.種類 === '車なし旅').map((i) => i.slug))) { const c = dests.find((x) => x.id === id).carFree; if (c.checked === OLD) c.checked = NEW; }
fs.writeFileSync('src/data/destinations.json', JSON.stringify(dests, null, 2) + '\n');
fs.writeFileSync('logs/ouen_carfree_20261119/changes.json', JSON.stringify(log, null, 1)); console.log(log.length, log.filter((l) => l.前).length);
