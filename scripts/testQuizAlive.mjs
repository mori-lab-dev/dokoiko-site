#!/usr/bin/env node
/**
 * testQuizAlive.mjs — 地図の「残りの点」が、エンジンの「のこり」と同じ数で、外れた点が本当に1位に届かないことの試験（2026-11-18）。
 *   1. ランダムな回答の途中経過（1〜12問目まで）で、aliveFlags の合計 == quizEngine.remainingCount（絞り込み前後も含む）
 *   2. 外れた旅先（flag=0）は、残りの質問をどう埋めても1位にならない（ランダムに埋めて、1位が残った旅先の中にあるか。外れと数えた旅先が1位になった割合は 0% でなければ失敗）
 *      （2026-11-18 に remainingCount を厳密な下限にした。それまでは 2.21% で外れと数えた旅先が1位になっていた）
 * usage: node scripts/testQuizAlive.mjs [--paths 3000] [--fills 12]
 */
import fs from 'fs';
import { prepare, filterPool, remainingCount, result, QUESTIONS, SCORE_QUESTIONS } from '../src/lib/quizEngine.js';
import { aliveFlags } from '../src/lib/quizAlive.js';
import { makeRng } from './lib/quizSim.mjs';

const args = process.argv.slice(2);
const val = (f, d) => (args.includes(f) ? Number(args[args.indexOf(f) + 1]) : d);
const PATHS = val('--paths', 3000), FILLS = val('--fills', 12);
const P = prepare(JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8')));
const rnd = makeRng(20261118); const pick = (l) => l[Math.floor(rnd() * l.length)];
let mismatch = 0, escaped = 0, checked = 0, fills = 0; const depthSeen = new Set();
for (let i = 0; i < PATHS; i++) {
  const depth = 1 + Math.floor(rnd() * QUESTIONS.length);        // 答えた数
  const ans = {}; for (let k = 0; k < depth; k++) ans[QUESTIONS[k].key] = pick(QUESTIONS[k].options);
  depthSeen.add(depth);
  const flags = aliveFlags(P, ans);
  const alive = flags.reduce((s, v) => s + v, 0);
  // 1. エンジンの数
  let expect;
  if (ans.area == null) expect = P.filter((d) => filterPool([d], ans.stay, 'どこでもよい').length).length;
  else { const scored = {}; for (const q of SCORE_QUESTIONS) if (ans[q.key] != null) scored[q.key] = ans[q.key]; expect = remainingCount(filterPool(P, ans.stay, ans.area), scored); }
  checked++; if (alive !== expect) { mismatch++; if (mismatch <= 3) console.log(`数が違う: 深さ${depth} 地図${alive} エンジン${expect}`); }
  // 2. 残りの質問を埋めて、1位が残った旅先の中にあるか（深さ2以上＝絞り込みが済んでいる）
  if (depth >= 2) for (let f = 0; f < FILLS; f++) {
    const full = { ...ans }; for (let k = depth; k < QUESTIONS.length; k++) full[QUESTIONS[k].key] = pick(QUESTIONS[k].options);
    const r = result(P, full); fills++;
    const idx = P.findIndex((d) => d.id === r.top.id);
    if (!flags[idx]) { escaped++;  }
  }
}
console.log(`途中経過 ${checked}通り（答えた数 ${Math.min(...depthSeen)}〜${Math.max(...depthSeen)}）: のこりの数がエンジンと違う ${mismatch}件`);
console.log(`埋めた結果 ${fills}通り: 外れと数えた旅先が1位になった ${escaped}件（${(escaped / fills * 100).toFixed(2)}%）`);
process.exit(mismatch || escaped ? 1 : 0);
