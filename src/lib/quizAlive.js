// 地図の点の「残り／外れ」（2026-11-18）。診断エンジン（quizEngine.js）の関数だけを使って、各旅先が「まだ1位に届く」かを返す。
// 数は quizEngine.js の remainingCount と必ず同じになる（scripts/testQuizAlive.mjs が、ランダムな回答の途中経過で一致を確かめる）。
// 外れた旅先は、残りの質問でどう答えても1位にならない（同じく testQuizAlive.mjs が、残りの回答をランダムに埋めて確かめる）。
import { filterPool, pointsFor, SCORE_QUESTIONS, QUESTIONS } from './quizEngine.js';

const maxPts = (d, q) => Math.max(...q.options.map((o) => pointsFor(d, q.key, o)));

/** prepped: prepare() の結果。answers: これまでの答え（stay・area・重みづけの質問）。戻り値: prepped と同じ並びの Uint8Array（1=まだ届く） */
export function aliveFlags(prepped, answers) {
  const flags = new Uint8Array(prepped.length);
  if (answers.stay == null) { flags.fill(1); return flags; }
  const inPool = new Set((answers.area == null ? filterPool(prepped, answers.stay, 'どこでもよい') : filterPool(prepped, answers.stay, answers.area)).map((d) => d.id));
  if (answers.area == null) { prepped.forEach((d, i) => { if (inPool.has(d.id)) flags[i] = 1; }); return flags; }
  const open = SCORE_QUESTIONS.filter((q) => answers[q.key] == null);
  const cur = new Map(); let best = -Infinity;
  for (const d of prepped) {
    if (!inPool.has(d.id)) continue;
    let sc = 0; for (const q of SCORE_QUESTIONS) if (answers[q.key] != null) sc += pointsFor(d, q.key, answers[q.key]);
    cur.set(d.id, sc); if (sc > best) best = sc;
  }
  prepped.forEach((d, i) => {
    if (!inPool.has(d.id)) return;
    let up = cur.get(d.id); for (const q of open) up += maxPts(d, q);
    if (up >= best) flags[i] = 1;
  });
  return flags;
}
export { QUESTIONS };
