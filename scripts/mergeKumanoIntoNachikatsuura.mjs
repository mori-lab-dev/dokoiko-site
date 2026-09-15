#!/usr/bin/env node
/**
 * mergeKumanoIntoNachikatsuura.mjs — 重複していた「熊野」を「那智勝浦」へ統合する。
 *
 * 熊野は prefecture が三重県なのに、座標も spots も和歌山側だった。
 *   熊野の spots      熊野那智大社 / 那智の滝 / 瀞峡
 *   那智勝浦の spots  那智の大滝 / 熊野那智大社 / 那智黒砂
 * 先の2つは同じ場所を別の名前で書いているだけで、実質は同じ旅先が2件ある状態。
 * 那智勝浦のほうが記述が具体的（落差133m、大門坂から467段）で、
 * 最寄りも紀伊勝浦駅と実態に合っているので、そちらを正とする。
 *
 * 熊野にしか無かったのは瀞峡なので、これだけ那智勝浦へ移す。
 * 那智勝浦から瀞峡のジェット船乗り場（新宮市志古）まで約24kmで、
 * 「近くの見どころ」として無理のない距離にある。
 *
 * 宿の「里創人 熊野倶楽部」は三重県熊野市（那智勝浦から約33km）にあり、
 * 和歌山の旅先に付け替えると、いま直している型の誤りを自分で作ることになる。
 * 移さずに落とす。
 *
 * usage: node scripts/mergeKumanoIntoNachikatsuura.mjs [--apply]
 */
import fs from 'fs';
import { checkDesc } from './descStyleCheck.mjs';

const APPLY = process.argv.includes('--apply');
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];

const NEW_DESC = '那智の大滝は落差133m。飛瀧神社の参道を下りて正面に立つと、水音で会話が聞こえなくなる。'
  + '熊野那智大社へは大門坂から467段の石段を登る。杉の巨木が両側に並ぶ。'
  + '那智黒石が砂になった黒い砂浜もあり、少し異様な風景になっている。'
  + '北へ車で30分ほど走ると瀞峡があり、新宮市志古からウォータージェット船で巨岩のあいだを巡れる。'
  + '港町なので、朝から開くマグロ食堂は売り切れが早い。'
  + '熊野別邸 中の島は船でしか行けない宿で、勝浦港の桟橋から無料の送迎船が約5分。'
  + '那智山へのバスは1日4〜6本しかない。拠点は紀伊勝浦駅。';

const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
const kumano = data.find((d) => d.id === 'kumano');
const nachi = data.find((d) => d.id === 'nachikatsuura');
if (!kumano || !nachi) { console.error('❌ どちらかが見つからない'); process.exit(1); }

// 熊野にしか無い spot を拾う。
// 同じ場所を別の名前で書いている組があるので、それも重複として扱う。
// 「那智の滝」と「那智の大滝」は同じ滝で、includes では一致しない（大が挟まる）。
const ALIAS = [['那智の滝', '那智の大滝']];
const same = (a, b) => a === b || a.includes(b) || b.includes(a)
  || ALIAS.some((g) => g.includes(a) && g.includes(b));
const unique = kumano.spots.filter((s) => !nachi.spots.some((t) => same(t.name, s.name)));
console.log('熊野にしか無い spot:', unique.map((s) => s.name).join(' / ') || 'なし');

const r = checkDesc(NEW_DESC);
if (!r.ok) { console.error(`❌ 新しい description が基準に落ちる: ${r.issues.join(' / ')}`); process.exit(1); }
console.log(`新しい description ${r.len}字 / 文${r.n} 最短${r.min} 最長${r.max} 数値${r.nums} 五感${r.sense}`);

nachi.spots = [...nachi.spots, ...unique];
nachi.description = NEW_DESC;
if (!nachi.tags.includes('渓谷')) nachi.tags.push('渓谷');
// 熊野のほうが weight が高かったので、統合先に引き継ぐ
nachi.weight = Math.max(nachi.weight ?? 1, kumano.weight ?? 1);

const before = data.length;
const merged = data.filter((d) => d.id !== 'kumano');
console.log(`destination ${before} → ${merged.length}`);
console.log(`那智勝浦の spot ${nachi.spots.length}件 / tags ${nachi.tags.join(',')} / weight ${nachi.weight}`);
console.log('落とすもの: 宿「里創人 熊野倶楽部」（三重県熊野市・那智勝浦から約33km）');

if (APPLY) {
  const json = JSON.stringify(merged, null, 2) + '\n';
  for (const f of FILES) fs.writeFileSync(f, json);
  // 記事は残しても描画されないので退避して外す
  const ap = 'src/data/articles/kumano.json';
  if (fs.existsSync(ap)) {
    fs.mkdirSync('logs/removed_articles', { recursive: true });
    fs.copyFileSync(ap, 'logs/removed_articles/kumano.json');
    fs.unlinkSync(ap);
    console.log('articles/kumano.json を退避して外した');
  }
  fs.writeFileSync('logs/merged_kumano.json', JSON.stringify({ kumano, movedSpots: unique }, null, 1));
  console.log('✅ destinations.json を更新 / 元データは logs/merged_kumano.json');
} else {
  console.log('（--apply で反映）');
}
