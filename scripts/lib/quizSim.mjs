// 診断の「ランダムな回答」の流し方（2026-11-18）。分布検査（scripts/quizDistribution.mjs）と win の計算（scripts/buildQuizData.mjs）が同じ関数を使う。
// 乱数は固定（mulberry32）。泊・方面・各質問の答えは一様な確率で選ぶ。計算そのものは src/lib/quizEngine.js（本番と同じ）。
import { result, filterPool, QUESTIONS } from '../../src/lib/quizEngine.js';

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** N回の回答を流す。win: 旅先ID → 1位になった回数。by: 「泊×方面」→（旅先ID → 回数） */
export function simulate(P, N, seed, tie = 'theme') {
  const rnd = makeRng(seed); const pick = (l) => l[Math.floor(rnd() * l.length)];
  const win = new Map(); const by = new Map(); let empty = 0, ties = 0, n = 0;
  for (let i = 0; i < N; i++) {
    const ans = {}; for (const q of QUESTIONS) ans[q.key] = pick(q.options);
    const r = result(P, ans, tie);
    if (!r) { empty++; continue; }
    n++; if (r.tiedAtTop) ties++;
    win.set(r.top.id, (win.get(r.top.id) || 0) + 1);
    const k = `${ans.stay}×${ans.area}`; const m = by.get(k) || new Map(); m.set(r.top.id, (m.get(r.top.id) || 0) + 1); by.set(k, m);
  }
  return { win, by, empty, ties, n };
}
export { filterPool };
