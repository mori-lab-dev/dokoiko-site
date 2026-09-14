#!/usr/bin/env node
/**
 * tagKeikan.mjs — 愛知・岡山・東京の「絶景0」を、タグの付け忘れとして直す。
 *
 * coverageGap.mjs が出す「絶景0」は tags に「絶景」が入っていない、という意味でしかない。
 * 3県の中身を見ると、ほかの県で絶景としているもの（阿蘇・浄土ヶ浜・猊鼻渓・昇仙峡・
 * 三方五湖・桜島・下灘・美ヶ原など）と同じ性格の旅先がすでに載っていた。
 * つまり掲載が足りないのではなく、タグが付いていないだけだった。
 * 新しい旅先を足す前に、まずこれを直す。
 *
 * 基準は「その場所の主題が眺望・景観そのものであること」。
 * 景色がきれいというだけでは付けない（温泉や離島の紹介文に眺めの一節があるだけ、
 * というものは対象外）。紹介文を読んで1件ずつ決めた。
 *
 * usage: node scripts/tagKeikan.mjs [--apply]
 */
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];

// 付ける。理由は紹介文のどこを根拠にしたか。
const ADD = [
  ['伊良湖岬', '愛知県', '渥美半島の先端。灯台から知多半島まで見渡し、太平洋と伊勢湾が交わる潮目を望む'],
  ['設楽',     '愛知県', '茶臼山高原の頂で三百六十度の山容が視界を満たす、と紹介文の主題になっている'],
  ['鳳来峡',   '愛知県', '巨岩と清流の峡谷美が主題。断崖の緑と碧い流れのコントラスト'],
  ['香嵐渓',   '愛知県', '4000本のモミジと巴川。飯盛山の頂から谷を一望する'],
  ['蒜山高原', '岡山県', '晴れた日の山頂から360度。高原の眺めが主題'],
  ['高梁',     '岡山県', '霧に浮かぶ備中松山城の天守。雲海の眺めが冒頭に置かれている'],
  ['牛窓',     '岡山県', '丘から前島を見下ろす「日本のエーゲ海」の光'],
  ['青ヶ島',   '東京都', '二重カルデラの縁から噴火口を見下ろす。絶海の孤島そのものが眺め'],
  ['御蔵島',   '東京都', '断崖のハイキングコースから太平洋が青く果てしなく広がる'],
  ['御岳山',   '東京都', '長尾平展望台から奥多摩の山並みと富士山の稜線。すでに tags に「展望」がある'],
  ['奥多摩湖', '東京都', '小河内ダムの堰堤から湖面と山影。すでに tags に「展望」がある'],
  ['神津島',   '東京都', '天上山から太平洋の藍色を見渡す。前浜の透明な水'],
  ['伊豆大島', '東京都', '三原山の黒い砂漠と荒涼たる火山の景色'],
];

// 付けないと決めたもの。次に見直すときに同じ検討を繰り返さないために残す。
const SKIP = [
  ['蒲郡',       '愛知県', '竹島橋からの夕暮れは印象的だが、紹介の主題は島と水族館と温泉'],
  ['佐久島',     '愛知県', '主題はアート'],
  ['新見',       '岡山県', '主題は鍾乳洞の中で、眺望の話ではない'],
  ['奥津温泉',   '岡山県', '奥津渓の紅葉は出てくるが、主題は温泉'],
  ['笠岡諸島',   '岡山県', '断崖は出てくるが、主題は島に残る暮らしと時間'],
  ['高尾山',     '東京都', '山頂からの眺めはあるが、主題は参道と薬王院'],
  ['等々力渓谷', '東京都', '区内唯一の渓谷という希少さが主題で、眺望の規模は絶景の基準に届かない'],
  ['檜原村',     '東京都', '主題は秘湯とそば'],
  ['八丈島',     '東京都', '主題は海と黄八丈と温泉'],
];

const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
const find = (name, pref) => data.filter((d) => d.name === name && d.prefecture === pref);

let ng = 0, changed = 0;
for (const [name, pref, why] of ADD) {
  const hits = find(name, pref);
  if (hits.length !== 1) { console.log(`❌ ${pref} ${name} が ${hits.length}件見つかった`); ng++; continue; }
  const d = hits[0];
  d.tags = d.tags || [];
  if (d.tags.includes('絶景')) { console.log(`--  ${pref} ${name} すでに付いている`); continue; }
  d.tags.push('絶景');
  changed++;
  console.log(`OK  ${pref} ${name.padEnd(10)} ${why}`);
}
for (const [name, pref, why] of SKIP) {
  if (find(name, pref).length !== 1) { console.log(`❌ 見送り対象 ${pref} ${name} が見つからない`); ng++; }
  else console.log(`見送り ${pref} ${name.padEnd(10)} ${why}`);
}
if (ng) { console.log(`\nNG ${ng}件。反映しない`); process.exit(1); }

if (APPLY) {
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const f of FILES) fs.writeFileSync(f, json);
  console.log(`\n✅ ${changed}件に「絶景」を付けた`);
} else {
  console.log(`\n（--apply を付けると ${changed}件に反映）`);
}
