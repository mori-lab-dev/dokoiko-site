// パイロット5地域を統合したときの診断（/quiz/）への影響の試算（2026-11-18・読み取りのみ。サイトのファイルは変えない）。
// 結果の単位は統合後のページ1つ。代表の旅先に、統合する旅先の tags と stayAllowed の和集合を持たせた場合（和集合）と、代表のまま（そのまま）の2通りを、本番のエンジン・同じ乱数（seed 20261117・10,000回）で測る。
import fs from 'fs';
import { prepare } from '../src/lib/quizEngine.js';
import { simulate } from './lib/quizSim.mjs';
const quiz = JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8'));
const by = new Map(quiz.map((d) => [d.id, d]));
const G = { 隠岐: ['nishinoshima', ['ama-island', 'nakanoshima-oki', 'kuniga', 'oki-island']], 慶良間: ['tokashiki-jima', ['zamami-island', 'aka-island', 'aharen']], 笠岡: ['shiraishijima', ['kasaoka-islands', 'manabeshima']], 小笠原: ['chichijima', ['hahajima']], 人吉: ['hitoyoshi', ['hitoyoshi-city', 'hitoyoshi-onsen']] };
const stat = (list) => { const P = prepare(list); const { win, empty, n } = simulate(P, 10000, 20261117, 'theme'); const s = [...win.entries()].sort((a, b) => b[1] - a[1]); return { 旅先の数: P.length, 結果が散った旅先: win.size, 一度も出ない: P.length - win.size, 結果が空: empty, 一番出る割合: +(s[0][1] / n * 100).toFixed(2), 上位10の割合: +(s.slice(0, 10).reduce((t, x) => t + x[1], 0) / n * 100).toFixed(1) }; };
const info = {}; const drop = new Set(); const union = new Map();
for (const [k, [rep, others]] of Object.entries(G)) {
  const inQuiz = [rep, ...others].filter((id) => by.has(id)); info[k] = { 診断に入っている: inQuiz.length, 全体: 1 + others.length, 代表が診断に入っている: by.has(rep) };
  for (const o of others) drop.add(o);
  if (by.has(rep)) { const ms = inQuiz.map((id) => by.get(id)); union.set(rep, { tags: [...new Set(ms.flatMap((d) => d.tags))], stayAllowed: [...new Set(ms.flatMap((d) => d.stayAllowed))] }); }
}
const base = stat(quiz);
const rm = quiz.filter((d) => !drop.has(d.id));
const keep = stat(rm);
const uni = stat(rm.map((d) => (union.has(d.id) ? { ...d, ...union.get(d.id) } : d)));
const win = new Map(quiz.map((d) => [d.id, d.win]));
console.log(JSON.stringify({ 各地域: info, 現在: base, 統合後_代表のまま: keep, 統合後_和集合: uni, 共有画像の枚数: { 現在: quiz.length, 統合後: rm.length }, 消える旅先のwin合計: [...drop].filter((id) => by.has(id)).reduce((s, id) => s + by.get(id).win, 0) }, null, 1));
