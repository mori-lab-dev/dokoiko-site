// 記事側の所要時間の文の修正・削除（2026-11-06）。公式で確認できた数字に直す／確認できないものは削除し、前後を最小限だけ直す。
// 新しい数字・固有名詞は足さない（直した数字は公式の値。出典は backup/travelTime_20261106/article_official_notes.json）。
// 各 edit の from は対象テキストの中に1か所だけ現れること（無い・複数なら止まる）。流し直しても、すでに直ったものは飛ばす。
// 使い方: node scripts/applyArticleTime.mjs [--dry]
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';

const dry = process.argv.includes('--dry');
const E = (id, loc, from, to) => ({ id, loc, from, to });
const EDITS = [
  // ── 削除（公式で確認できない／現行を確認できない）。前後は最小限だけ直す ──
  E('hakuba', 'lead', '東京から特急で約2時間半。\nなのに、別の星', '別の星'),
  E('shima-onsen', 'lead', '東京から車で約2時間半。\n', ''),
  E('kawagoe', 'lead', '東京から30分。\nなのに、着いた瞬間', '着いた瞬間'),
  E('shiobara-onsen', 'lead', '東京から車で2時間半。\nそこにこんな場所があったのか。', 'こんな場所があったのか。'),
  E('kiyosato', 'lead', '東京から特急で2時間もかからないのに、\nそこはもう別の世界だ。', 'ここはもう別の世界だ。'),
  E('tsushima', 'lead', '福岡から高速船で70分。\nそこはもう、別の時間', 'ここはもう、別の時間'),
  E('yonaguni-island', 'lead', '那覇から飛行機で約1時間。\nそこはもう、日本の端っこだ。', 'ここはもう、日本の端っこだ。'),
  E('obihiro', 'lead', '東京から飛行機で1時間半。\n', ''),
  E('narai-juku', 'lead', '東京から特急で約2時間半。\n', ''),
  E('myoko-kogen', 'lead', '東京から約2時間。\nなのに、そこはもう別の世界だ。', 'そこはもう別の世界だ。'),
  E('tomamu', 'lead', '札幌から車で約2時間。\n', ''),
  E('shikinejima', 'lead', '東京から船で3時間。\n', ''),
  E('kashima', 'lead', '東京から特急で1時間ちょっと。\n', ''),
  E('hiji', 'lead', '別府から車で20分。\nそこに、ひっそりと', 'ひっそりと'),
  E('hiji', 'sections.2.body', '日出温泉は、別府から20分の距離にあるのに、\n人の数が', '日出温泉は、\n人の数が'),
  E('hiji', 'spots.2.description', '別府から20分の距離にありながら人が少なく静かな温泉。', '人が少なく静かな温泉。'),
  E('gen_茨城_笠間稲荷神社', 'lead', '東京から特急で1時間ちょっと。\nそんな距離に、これほど深い森', 'これほど深い森'),
  E('gen_茨城_鹿島神宮', 'lead', '東京から特急で約80分。\nそんなに遠くないのに、まるで別の時間軸', 'まるで別の時間軸'),
  E('gen_栃木_中禅寺温泉', 'sections.0.body', '東京から約2時間半。\n日常からの切り替え', '日常からの切り替え'),
  E('gen_群馬_猿ヶ京温泉', 'lead', '東京から車で2時間ちょっと。\nそれだけ走れば、別の時間', '別の時間'),
  E('tarama-island', 'lead', '那覇から飛行機で約1時間。\nさらに宮古島から20分。', '宮古島から20分。'),
  E('omaezaki', 'lead', '浜松からでも車で1時間ちょっと。\nなのにこんなに遠い', 'こんなに遠い'),
  E('minobu', 'lead', '東京から特急で2時間ちょっと。\nそこにある静けさが', '身延にある静けさが'),
  E('tsumagoi', 'lead', '東京から車で約2時間半。\n', ''),
  // ── 公式の数字に直す ──
  E('shimoda', 'lead', '東京から2時間ちょっとで、', '東京から約2時間35分で、'),
  E('choshi', 'lead', '東京から特急で約1時間半。', '東京から特急で約1時間50分。'),
  E('sano', 'lead', '東京から1時間ちょっとなのに、', '東京から約1時間20分なのに、'),
  E('aguni-island', 'lead', '那覇から船で2時間半。', '那覇から船で約2時間。'),
  E('shirakawa', 'lead', '東北新幹線で東京から約1時間。', '東北新幹線で東京から約1時間20分。'),
  E('akita-semboku', 'lead', '東京から新幹線で約2時間半。', '東京から新幹線で約3時間。'),
  E('myoko', 'lead', '東京から新幹線で約2時間。', '東京から新幹線で約1時間50分。'),
  E('azumino', 'lead', '東京から特急で約2時間半。', '東京から特急で約3時間。'),
  E('gen_茨城_牛久シャトー', 'lead', '東京から特急で約1時間。', '東京から特急で約45分。'),
  E('nagatoro', 'lead', '東京から電車で約90分。', '東京から電車で約1時間40分。'),
  E('mikurajima', 'lead', '東京から船で8時間。', '東京から船で約7時間半。'),
  E('sakushima', 'lead', '名古屋から船で約30分。', '一色港から船で約25分。'),
];

const DEST = path.join(root, 'src/data/destinations.json');
const dests = JSON.parse(fs.readFileSync(DEST, 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));
const artCache = new Map();
const art = (id) => { if (!artCache.has(id)) artCache.set(id, JSON.parse(fs.readFileSync(path.join(root, 'src/data/articles', `${id}.json`), 'utf8'))); return artCache.get(id); };
let applied = 0, already = 0; const stop = [];
for (const e of EDITS) {
  const parts = e.loc.split('.');
  const holder = parts[0] === 'lead' ? art(e.id) : parts[0] === 'sections' ? art(e.id).sections[Number(parts[1])] : byId.get(e.id).spots[Number(parts[1])];
  const key = parts[0] === 'lead' ? 'lead' : parts[2];
  const text = holder[key];
  const n = text.split(e.from).length - 1;
  if (n === 1) { holder[key] = text.replace(e.from, () => e.to); applied++; }
  else if (n === 0 && (e.to === '' || text.includes(e.to))) already++;   // すでに直っている（削除は from が無ければ済み）
  else stop.push(`${e.id} ${e.loc}: from が ${n} か所`);
}
console.log(`編集 ${EDITS.length}件: 適用 ${applied} / 適用済み ${already} / 止まった ${stop.length}${stop.length ? '\n' + stop.join('\n') : ''}`);
if (stop.length || dry) process.exit(stop.length ? 1 : 0);
for (const [id, a] of artCache) fs.writeFileSync(path.join(root, 'src/data/articles', `${id}.json`), JSON.stringify(a, null, 2) + '\n');
fs.writeFileSync(DEST, JSON.stringify(dests, null, 2) + '\n');
console.log(`書き込み: 記事 ${artCache.size}ファイル / destinations.json`);
