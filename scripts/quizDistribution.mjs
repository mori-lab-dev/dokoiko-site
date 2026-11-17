#!/usr/bin/env node
/**
 * quizDistribution.mjs — 診断の分布検査（2026-11-17）。ランダムな回答を流して、結果の散り方・偏りを見る。
 * 本番と同じ関数（src/lib/quizEngine.js）を呼ぶ。式を書き写さない。
 *   usage: node scripts/quizDistribution.mjs [--n 10000] [--seed 20261117] [--tie theme|weight] [--json]
 *   泊・方面・各質問の答えは、すべて一様な確率で選ぶ（段階1と同じ）。
 */
import fs from 'fs';
import { prepare, filterPool } from '../src/lib/quizEngine.js';
import { simulate } from './lib/quizSim.mjs';

const args = process.argv.slice(2);
const val = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const N = Number(val('--n', 10000)); const SEED = Number(val('--seed', 20261117)); const TIE = val('--tie', 'theme');
const data = JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8'));
const P = prepare(data);
const name = new Map(P.map((d) => [d.id, `${d.name}(${d.prefecture})`]));
const { win, by, empty, ties, n } = simulate(P, N, SEED, TIE);
const sorted = [...win.entries()].sort((x, y) => y[1] - x[1]);
const share = (k) => +(sorted.slice(0, k).reduce((s, x) => s + x[1], 0) / n * 100).toFixed(1);
const combos = [...by.entries()].map(([k, m]) => { const t = [...m.values()].reduce((s, v) => s + v, 0); const top = [...m.entries()].sort((x, y) => y[1] - x[1])[0]; return { 組: k, 母数: filterPool(P, ...k.split('×')).length, 試行: t, 種類: m.size, 最多: name.get(top[0]), 最多の割合: +(top[1] / t * 100).toFixed(1) }; }).sort((x, y) => y.最多の割合 - x.最多の割合);
const out = {
  回数: N, 旅先の数: P.length, 同点の決め方: TIE, 結果が空になる回答: empty,
  結果が散った旅先の数: win.size, 一度も出ない旅先: P.length - win.size,
  一番出る旅先: name.get(sorted[0][0]), 一番出る割合: +(sorted[0][1] / n * 100).toFixed(2),
  上位10件の合計: share(10), 上位50件の合計: share(50),
  '1位が同点になる割合': +(ties / n * 100).toFixed(1),
  泊と方面の組数: combos.length, 泊と方面ごとの偏り_最大: combos[0], 泊と方面ごとの偏り_上位5: combos.slice(0, 5).map((c) => `${c.組} ${c.最多} ${c.最多の割合}%（種類${c.種類}/母数${c.母数}）`),
};
if (args.includes('--json')) console.log(JSON.stringify(out)); else console.log(JSON.stringify(out, null, 1));
