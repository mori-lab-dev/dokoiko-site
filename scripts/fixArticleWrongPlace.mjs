#!/usr/bin/env node
/**
 * fixArticleWrongPlace.mjs — 記事に書かれた所在地が丸ごと違っていた4件を直す。
 *
 * 記事の info 欄には住所・電話番号・料金・営業時間が並ぶ。読んだ人がそのまま
 * 動く情報なので、間違っていると実害が出る。次の4件は所在地そのものが違っていた。
 *
 *   与路島        記事全体が与論島の内容。住所も「鹿児島県大島郡与論町」。
 *                 百合ヶ浜・与論城跡はいずれも与論島のもので、与路島から155km離れている。
 *                 一部を直して済む状態ではないので、記事ファイルを外して
 *                 destinations.json 側の spots（裏を取って差し替え済み）で表示させる。
 *   神威脇温泉    住所「北海道積丹郡積丹町神威脇町」。座標は奥尻島で、神威脇温泉保養所は奥尻町にある。
 *   塩別温泉      住所「北海道上川郡上川町塩別番外地」、TEL 01658-2-3741。
 *                 塩別つるつる温泉は北見市留辺蘂町で、市外局番も違う。
 *                 「層雲峡から車で15分」も誤り（実際は約80km）。層雲峡の節ごと外す。
 *   神居岩温泉    住所「北海道雨竜郡沼田町」。神居岩温泉は留萌市にある。
 *
 * 電話番号は裏を取れないので、直すのではなく落とす。
 * 誤った番号を別の番号に置き換えると、確かめずに新しい誤りを作ることになる。
 *
 * usage: node scripts/fixArticleWrongPlace.mjs [--apply]
 */
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const DIR = 'src/data/articles';

/** 文字列を再帰的に置換する */
function replaceDeep(v, pairs) {
  if (typeof v === 'string') {
    let s = v;
    for (const [a, b] of pairs) s = s.split(a).join(b);
    return s;
  }
  if (Array.isArray(v)) return v.map((x) => replaceDeep(x, pairs));
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = replaceDeep(x, pairs);
    return o;
  }
  return v;
}
/** 電話番号の行を落とす */
const dropTel = (v) => (typeof v === 'string'
  ? v.split('\n').filter((l) => !/^TEL[：:]/.test(l.trim())).join('\n')
  : Array.isArray(v) ? v.map(dropTel)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, dropTel(x)]))
      : v);

const jobs = [
  {
    id: 'gen_北海_神威脇温泉',
    pairs: [
      ['北海道積丹郡積丹町神威脇町', '北海道奥尻郡奥尻町神威脇'],
      ['積丹半島の付け根に、ひっそりと湯煙が立つ。', '奥尻島の西側に、ひっそりと湯煙が立つ。'],
      ['積丹町神威脇の集落散歩', '神威脇の集落散歩'],
      ['積丹ブルーと言われる海の色は、夏のものだ。', '夏の海の色は、冬とはまるで違う。'],
      ['近隣コンビニ：約20km先（余市方面）のため、食料・飲料は事前に準備を',
        '島内は店が限られるため、食料・飲料は事前に準備を'],
    ],
    dropSections: [],
  },
  {
    id: 'gen_北海_塩別温泉',
    pairs: [
      ['北海道上川郡上川町塩別番外地', '北海道北見市留辺蘂町滝の湯'],
      ['北海道上川郡上川町塩別', '北海道北見市留辺蘂町'],
      ['層雲峡から車で15分。\n', ''],
    ],
    dropSections: ['層雲峡氷瀑まつり｜車で15分、別世界がある'],
  },
  {
    id: 'gen_北海_神居岩温泉',
    pairs: [
      ['北海道雨竜郡沼田町字本町（神居岩山麓）', '北海道留萌市宮園町（神居岩山麓）'],
      ['北海道雨竜郡沼田町本町周辺', '北海道留萌市内'],
      ['北海道雨竜郡沼田町', '北海道留萌市'],
      ['北海道・雨竜郡沼田町の奥に静かに存在する。', '北海道・留萌市の山あいに静かに存在する。'],
      ['沼田町の食堂｜旅の締めはここ以外ない', '留萌の食堂｜旅の締めはここ以外ない'],
      ['沼田町の中心部に小さな食堂が数軒ある。', '留萌の市街に小さな食堂が数軒ある。'],
      ['沼田町中心部の食堂（複数あり）', '留萌市内の食堂（複数あり）'],
    ],
    dropSections: [],
  },
];

let changed = 0;
for (const j of jobs) {
  const p = `${DIR}/${j.id}.json`;
  if (!fs.existsSync(p)) { console.log(`❌ ${j.id} の記事が無い`); continue; }
  let a = JSON.parse(fs.readFileSync(p, 'utf8'));
  const before = JSON.stringify(a);
  a = replaceDeep(a, j.pairs);
  a = dropTel(a);
  if (j.dropSections.length && Array.isArray(a.sections)) {
    const n0 = a.sections.length;
    a.sections = a.sections.filter((s) => !j.dropSections.includes(s.title));
    console.log(`   節を外した: ${n0} → ${a.sections.length}`);
  }
  const after = JSON.stringify(a);
  if (before === after) { console.log(`--  ${j.id} 変更なし`); continue; }
  console.log(`OK  ${j.id}`);
  changed++;
  if (APPLY) fs.writeFileSync(p, JSON.stringify(a, null, 2) + '\n');
}

// 与路島は記事ごと外す。中身が別の島のものなので、直す形にならない
const yp = `${DIR}/yorojima.json`;
if (fs.existsSync(yp)) {
  console.log('OK  yorojima の記事を外す（中身が与論島のもの。spots 側は差し替え済み）');
  changed++;
  if (APPLY) {
    fs.mkdirSync('logs/removed_articles', { recursive: true });
    fs.copyFileSync(yp, 'logs/removed_articles/yorojima.json');
    fs.unlinkSync(yp);
  }
}

console.log(`\n${changed}件${APPLY ? ' を反映' : '（--apply で反映）'}`);
