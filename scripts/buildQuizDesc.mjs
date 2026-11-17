#!/usr/bin/env node
/**
 * buildQuizDesc.mjs — 診断の結果に出す「どんな所か」の説明 src/data/quizDesc.json（と配信用の public/quiz/desc.json）を作る（2026-11-18）。
 * 元は既存の旅先ページの description だけ（新しい文は作らない・LLMは使わない）。先頭の1〜2文を、途中で切らずに採る。
 * 次のどれかに当たる説明は使わず、県名と tags（最大3つ）だけの1文「◯◯県の、A・B・Cの旅先です。」にする（新しい事実を足さない）:
 *   料金・所要時間・徒歩・バス・電車・無料・送迎・車なし／断定・誇張・最上級／推測の語／使わない言い回し／長すぎる（90字超）／文が途中で終わる
 * 規則は scripts/lib/quizDescRules.mjs（audit と同じ）。
 * usage: node scripts/buildQuizDesc.mjs [--check] [--report]   --check は書かずに今のファイルと同じかを見る
 */
import fs from 'fs';
import zlib from 'zlib';
import { pickFromDescription, tagsSentence } from './lib/quizDescRules.mjs';

const quiz = JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8'));
const dest = new Map(JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')).map((d) => [d.id, d]));
const out = {}; const reasons = {}; let used = 0, tags = 0, one = 0, two = 0;
for (const q of quiz) {
  const d = dest.get(q.id);
  const r = pickFromDescription(d.description);
  if (r.text) { out[q.id] = r.text; used++; (r.text.match(/。/g) || []).length === 1 ? one++ : two++; }
  else { out[q.id] = tagsSentence(q.prefecture, q.tags); tags++; reasons[r.reason] = (reasons[r.reason] || 0) + 1; }
}
const text = JSON.stringify(out) + '\n';
if (process.argv.includes('--check')) {
  const same = ['src/data/quizDesc.json', 'public/quiz/desc.json'].every((f) => fs.existsSync(f) && fs.readFileSync(f, 'utf8') === text);
  console.log(same ? '最新' : '古い（node scripts/buildQuizDesc.mjs で更新）'); process.exit(0);
}
fs.mkdirSync('public/quiz', { recursive: true });
fs.writeFileSync('src/data/quizDesc.json', text); fs.writeFileSync('public/quiz/desc.json', text);
const raw = Buffer.byteLength(text), gz = zlib.gzipSync(text, { level: 9 }).length;
const lens = Object.values(out).map((t) => [...t].length);
console.log(`説明 ${quiz.length}件: 既存の description を使った ${used}件（1文 ${one}・2文 ${two}）／ tags の1文に落とした ${tags}件`);
console.log('落とした理由:', JSON.stringify(reasons));
console.log(`desc.json: ${raw}バイト（gzip ${gz}バイト）・字数 平均${Math.round(lens.reduce((s, v) => s + v, 0) / lens.length)}・最大${Math.max(...lens)}`);
