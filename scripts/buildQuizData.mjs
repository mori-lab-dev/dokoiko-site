#!/usr/bin/env node
/**
 * buildQuizData.mjs — 診断（/quiz/）の旅先データ src/data/quizDestinations.json を作る（2026-11-17）。
 * audit:all を通ったページだけから作る。次は除く:
 *   ・転送ページ（MovedPage）… destinations.json に載らないので、そもそも入らない（audit の merged-pages が見る）
 *   ・ヒーロー画像が出ない旅先 … scripts/auditMissingImages.mjs と同じ判定（main.jpg → {id}.jpg → images[0] が /images/ で始まらない外部URL）
 *   ・同名の重複 … 名前が destinations.json の中で2件以上ある旅先は、両方とも除く
 *   ・県名が2つの旅先（「愛媛県・高知県」など）
 * JSON に入れる項目は11個: id・name・prefecture・tags・weight・stayAllowed・url（段階2の7つ）＋ x・y・code・win（2026-11-18）。所要時間・料金・送迎・「無料」・緯度経度・本文は入れない。
 *   x,y  … 旅先ページの座標を、scripts/lib/quizFrames.mjs の投影で 0〜1000×0〜940 の整数にしたもの（lat/lng そのものは入れない）
 *   code … id の SHA-1 の先頭8文字（同じ id なら何度作っても同じ。衝突したら止まる）。結果ページ /quiz/r/<code>/ と共有画像 /quiz/og/<code>.png の名前
 *   win  … 乱数固定（seed 20261117）のエンジンで1万通りの回答を流して、その旅先が1位になった回数（合計は1万）
 * usage: node scripts/buildQuizData.mjs [--check]   --check は書かずに、今のファイルと同じかを見る
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prepare } from '../src/lib/quizEngine.js';
import { simulate } from './lib/quizSim.mjs';
import { project } from './lib/quizFrames.mjs';
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
// win: 本番と同じエンジン（src/lib/quizEngine.js）で、乱数固定の1万通りの回答を流す
const SIM_N = 10000, SIM_SEED = 20261117;
const sim = simulate(prepare(out), SIM_N, SIM_SEED, 'theme');
const codes = new Map(); const outOfFrame = [];
const full = out.map((d) => {
  const code = crypto.createHash('sha1').update(d.id).digest('hex').slice(0, 8);
  if (codes.has(code)) { console.error(`code が衝突: ${d.id} と ${codes.get(code)}（${code}）`); process.exit(1); }
  codes.set(code, d.id);
  const src = all.find((x) => x.id === d.id);
  const p = project(src.lat, src.lng);
  if (!p) { outOfFrame.push(d.id); return null; }
  return { ...d, x: p.x, y: p.y, code, win: sim.win.get(d.id) || 0 };
});
if (outOfFrame.length) { console.error(`座標が地図の枠の外: ${outOfFrame.join(', ')}`); process.exit(1); }
const total = full.reduce((s, d) => s + d.win, 0);
if (total + sim.empty !== SIM_N) { console.error(`win の合計が ${SIM_N} でない: ${total}（空 ${sim.empty}）`); process.exit(1); }
out.length = 0; out.push(...full);
const text = JSON.stringify(out) + '\n';
const FILE = 'src/data/quizDestinations.json';
if (process.argv.includes('--check')) { console.log(fs.existsSync(FILE) && fs.readFileSync(FILE, 'utf8') === text ? '最新' : '古い（node scripts/buildQuizData.mjs で更新）'); process.exit(0); }
fs.writeFileSync(FILE, text);
console.log(`診断の旅先 ${out.length}件（全${all.length}件 − ヒーロー画像なし${reasons['ヒーロー画像なし']}・同名の重複${reasons['同名の重複']}・県名が2つ${reasons['県名が2つ']}。重なる分あり）・${text.length}バイト`);
