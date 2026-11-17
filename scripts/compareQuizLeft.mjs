// 「のこり」の曲線の前後比較（2026-11-18）。remainingCount を厳密な下限にする前（logs/quiz_20261118/quizEngine.js.before）と後を、例の回答の組で比べる。
// usage: node scripts/compareQuizLeft.mjs
import fs from 'fs';
import { pathToFileURL } from 'url';
import * as NEW from '../src/lib/quizEngine.js';
const OLD = await import(pathToFileURL(fs.existsSync('logs/quiz_20261118/quizEngine.js.before') ? 'logs/quiz_20261118/quizEngine.js.before'.replace(/\.before$/, '.before.mjs') : 'x').href).catch(() => null);
if (!OLD) { fs.copyFileSync('logs/quiz_20261118/quizEngine.js.before', '/private/tmp/claude-501/quizEngine_old.mjs'); }
const Old = OLD || await import('file:///private/tmp/claude-501/quizEngine_old.mjs');
const data = JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8'));
const PN = NEW.prepare(data), PO = Old.prepare(data);
const SETS = { A: [1, 6, 0, 2, 0, 0, 0, 1, 0, 1, 0, 1], B: [0, 3, 2, 4, 1, 1, 1, 2, 1, 0, 1, 0], C: [2, 5, 5, 0, 0, 2, 2, 0, 2, 2, 2, 2] };
const out = {};
for (const [k, picks] of Object.entries(SETS)) {
  const ans = {}; const rowsOld = [], rowsNew = [];
  for (let i = 0; i < 12; i++) {
    const q = NEW.QUESTIONS[i]; ans[q.key] = q.options[Math.min(picks[i], q.options.length - 1)];
    const left = (E, P) => { if (ans.area == null) return P.filter((d) => E.filterPool([d], ans.stay, 'どこでもよい').length).length; const s = {}; for (const x of E.SCORE_QUESTIONS) if (ans[x.key] != null) s[x.key] = ans[x.key]; return E.remainingCount(E.filterPool(P, ans.stay, ans.area), s); };
    rowsOld.push(left(Old, PO)); rowsNew.push(left(NEW, PN));
  }
  out[k] = { 前: rowsOld, 後: rowsNew };
  console.log(`組${k}  前: ${rowsOld.join('→')}\n     後: ${rowsNew.join('→')}`);
}
fs.writeFileSync('logs/quiz_20261118/left_curve_before_after.json', JSON.stringify(out, null, 1));
