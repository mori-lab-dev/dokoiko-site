#!/usr/bin/env node
// 地域の旅先を診断の候補から減らしたとき（案2）の分布検査の数字を測る（2026-11-18・読み取りのみ。サイトのファイルは変えない）。
// 代表の決め方: 各地域で、今の win（1万通りで1位になる数）が最大の旅先（同数なら weight の大きい方）。エンジンは本番のものを呼ぶ。
import fs from 'fs';
import { prepare } from '../src/lib/quizEngine.js';
import { simulate } from './lib/quizSim.mjs';
const data = JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8'));
const sv = JSON.parse(fs.readFileSync('logs/quiz_20261118b/cluster_survey.json', 'utf8'));
const stat = (d) => { const P = prepare(d); const { win, empty, n } = simulate(P, 10000, 20261117, 'theme'); const s = [...win.entries()].sort((x, y) => y[1] - x[1]); const top = (k) => +(s.slice(0, k).reduce((t, x) => t + x[1], 0) / n * 100).toFixed(1); return { 旅先の数: P.length, 結果が散った旅先: win.size, 一度も出ない: P.length - win.size, 結果が空: empty, 一番出る割合: +(s[0][1] / n * 100).toFixed(2), 上位10の割合: top(10) }; };
const byId = new Map(data.map((d) => [d.id, d]));
const drop = new Set(); const reps = [];
for (const g of sv.地域) { const rep = [...g.items].sort((a, b) => b.win - a.win || (byId.get(b.id).weight - byId.get(a.id).weight))[0]; reps.push(rep.id); for (const it of g.items) if (it.id !== rep.id) drop.add(it.id); }
const base = stat(data), opt2 = stat(data.filter((d) => !drop.has(d.id)));
// 隠岐だけ（島前4件を代表1件にまとめる想定）
const oki = ['ama-island', 'nishinoshima', 'nakanoshima-oki', 'kuniga']; const okiRep = 'ama-island';
const opt2oki = stat(data.filter((d) => !oki.includes(d.id) || d.id === okiRep));
console.log(JSON.stringify({ 現在: base, 案2_全地域: { ...opt2, 減る件数: drop.size, 共有画像の枚数: data.length - drop.size }, 案2_隠岐の島前だけ: opt2oki }, null, 1));
