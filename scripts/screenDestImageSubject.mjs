#!/usr/bin/env node
/**
 * screenDestImageSubject.mjs — main画像の「被写体がその旅先の代表になっているか」を、
 * Commons のファイル名から機械的にふるいにかける。
 *
 * auditDestMainImages の place 判定は県名の一致しか見ないので、次の型を拾えない。
 *   京都 ← File:京都府福知山市夜久野町板生の庚申塔.jpg
 *   京都府ではあるが、被写体は福知山の道端の庚申塔で、京都の代表画像にはならない。
 *
 * Vision を使わず、ファイル名に出る被写体の語だけで見る。
 * 対象は画素一致した（＝ファイル名がその画像の内容を表している）ものに限る。
 * 一致していないものはファイル名が別の写真のものなので、ここで判定しても意味がない。
 *
 * ここは「候補を出す」ところまで。最終的に差し替えるかは写真を見て決める。
 *
 * usage: node scripts/screenDestImageSubject.mjs
 */
import fs from 'fs';

/** 旅先のトップに大きく出す絵にならない被写体。strictImageReview の除外基準と同じ考え方 */
const BAD = [
  ['駅・ホーム・駅名標', /(駅|Station|station|Eki)(?!前通|前商店)/],
  ['空港', /空港|Airport|airport/],
  ['役所・庁舎', /役場|市役所|町役場|村役場|City Hall|Town Hall|Government/i],
  ['学校', /小学校|中学校|高等学校|大学|School|Gakko/i],
  ['病院・郵便局・信金', /病院|Hospital|郵便局|Post Office|信用金庫|銀行|Bank/i],
  ['駐車場・道路', /駐車場|Parking|道の駅|Michinoeki|Road Station|インターチェンジ|Interchange/i],
  ['港湾施設', /(Port|港)(?!町)/],
  ['石仏・石碑・小祠', /庚申塔|道祖神|石碑|記念碑|Monument|供養塔/],
  ['室内展示・資料館', /資料館|博物館|Museum|展示|Exhibition/i],
  ['物のクローズアップ', /丼|定食|かき揚げ|ラーメン|そば|弁当|土産|Food|Dish/i],
  ['地図・図表・ロゴ', /地図|Map|Logo|Chart|案内板|Sign|sign/],
  ['庁舎まわりの設備', /バス停|Bus Stop|停留所/],
];

const rows = JSON.parse(fs.readFileSync('logs/dest_image_audit.json', 'utf8'));
// ファイル名がその画像を指していると言えるのは、画素一致したものだけ
const matched = rows.filter((r) => r.verdict === 'ok' || r.verdict === 'place-ng');

const hits = [];
for (const r of matched) {
  const t = r.file || '';
  const bad = BAD.filter(([, re]) => re.test(t)).map(([label]) => label);
  if (bad.length) hits.push({ ...r, bad });
}

const byKind = {};
for (const h of hits) for (const b of h.bad) (byKind[b] ||= []).push(h);

console.log(`画素一致した ${matched.length}件のうち、被写体が怪しいもの ${hits.length}件\n`);
for (const [kind, list] of Object.entries(byKind).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`■ ${kind}  ${list.length}件`);
  for (const h of list.slice(0, 12)) {
    console.log(`   ${h.id.padEnd(22)} ${String(h.name).slice(0, 10).padEnd(12)} ${h.file.slice(0, 56)}`);
  }
  if (list.length > 12) console.log(`   …ほか ${list.length - 12}件`);
}

fs.writeFileSync('logs/dest_image_subject_screen.json', JSON.stringify(hits, null, 1));
console.log(`\n→ logs/dest_image_subject_screen.json`);
