#!/usr/bin/env node
/**
 * buildQuizData.mjs — 診断（/quiz/）の旅先データ src/data/quizDestinations.json を作る（2026-11-17）。
 * audit:all を通ったページだけから作る。次は除く:
 *   ・転送ページ（MovedPage）… destinations.json に載らないので、そもそも入らない（audit の merged-pages が見る）
 *   ・ヒーロー画像が出ない旅先 … scripts/auditMissingImages.mjs と同じ判定（main.jpg → {id}.jpg → images[0] が /images/ で始まらない外部URL）
 *   ・同名の重複 … 名前が destinations.json の中で2件以上ある旅先は、両方とも除く
 *   ・県名が2つの旅先（「愛媛県・高知県」など）
 * JSON に入れる項目は、id・name・prefecture・tags・weight・stayAllowed・url だけ（所要時間・料金・送迎・「無料」・座標・本文は入れない）。
 * usage: node scripts/buildQuizData.mjs [--check]   --check は書かずに、今のファイルと同じかを見る
 */
import fs from 'fs';
import path from 'path';
const all = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const names = new Map(); for (const d of all) names.set(d.name, (names.get(d.name) || 0) + 1);
const heroResolves = (d) => fs.existsSync(path.join('public', `images/${d.id}/main.jpg`))
  || fs.existsSync(path.join('public', `images/${d.id}.jpg`))
  || ((d.images || [])[0] && !String(d.images[0]).startsWith('/images/'));
const reasons = { 'ヒーロー画像なし': 0, '同名の重複': 0, '県名が2つ': 0 };
const out = [];
for (const d of all) {
  if (!heroResolves(d)) { reasons['ヒーロー画像なし']++; continue; }
  if (names.get(d.name) > 1) { reasons['同名の重複']++; continue; }
  if (String(d.prefecture).includes('・')) { reasons['県名が2つ']++; continue; }
  out.push({ id: d.id, name: d.name, prefecture: d.prefecture, tags: d.tags || [], weight: d.weight, stayAllowed: d.stayAllowed, url: `/destinations/${encodeURIComponent(d.id)}/` });
}
const text = JSON.stringify(out) + '\n';
const FILE = 'src/data/quizDestinations.json';
if (process.argv.includes('--check')) { console.log(fs.existsSync(FILE) && fs.readFileSync(FILE, 'utf8') === text ? '最新' : '古い（node scripts/buildQuizData.mjs で更新）'); process.exit(0); }
fs.writeFileSync(FILE, text);
console.log(`診断の旅先 ${out.length}件（全${all.length}件 − ヒーロー画像なし${reasons['ヒーロー画像なし']}・同名の重複${reasons['同名の重複']}・県名が2つ${reasons['県名が2つ']}。重なる分あり）・${text.length}バイト`);
