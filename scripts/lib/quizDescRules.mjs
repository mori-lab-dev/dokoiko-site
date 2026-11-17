// 診断の「どんな所か」の説明の採用条件（2026-11-18）。scripts/buildQuizDesc.mjs（作る）と scripts/auditQuiz.mjs（検査）が同じ規則を使う。
// 説明の元は、既存の旅先ページの description だけ。新しい文は作らない（LLMも使わない）。

/** 表示の幅で決めた上限: 本文13px・カード幅 約320pxで1行約24字 → 4行で約96字。2文のときも合計でこの長さまで */
export const MAX_LEN = 90;

const MONEY_TIME = /徒歩|バス|電車|所要|無料|送迎|車なし|料金|運賃/;
const SUPERLATIVE = /運命|絶対|必ず|住むべき|間違いなく|確実|完璧|断言|必見|日本一|世界一|東洋一|日本最|世界最|国内最|最大|最古|最長|最小|最高|最強|最良|最も|唯一|随一|屈指|ナンバーワン|No\.?1/;
const GUESS = /だろう|でしょう|かもしれ|ようだ|ようです|思わせ|感じられ|思われ|らしい|はずだ|ことだろう|そうだ|みたいだ/;
const BANNED_PHRASES = /当てます|運命の町|20の質問|4万人/;
const DIGIT_UNIT = /[0-9０-９一二三四五六七八九十百千万]+\s*(円|分|時間|km|キロ|㎞)/;   // 数字つきの料金・所要時間・距離

/** 1文（末尾の「。」を含む）が条件を満たすか。満たさないときは理由を返す */
export function checkSentence(s) {
  if (!s.endsWith('。')) return '文が途中で終わっている';
  if (s.length > MAX_LEN) return '長すぎる';
  if ((s.match(/「/g) || []).length !== (s.match(/」/g) || []).length || (s.match(/（/g) || []).length !== (s.match(/）/g) || []).length) return 'かっこが閉じていない';
  if (/…|\.\.\./.test(s)) return '省略記号がある';
  if (MONEY_TIME.test(s) || DIGIT_UNIT.test(s)) return '料金・所要時間・交通・無料・送迎・車なしの語';
  if (SUPERLATIVE.test(s)) return '断定・誇張・最上級の語';
  if (GUESS.test(s)) return '推測の語';
  if (BANNED_PHRASES.test(s)) return '使わない言い回し';
  return null;
}
/** 説明全体（1〜2文）が条件を満たすか */
export function checkText(t) {
  if (t.length > MAX_LEN) return '長すぎる';
  const sents = splitSentences(t);
  if (sents.length < 1 || sents.length > 2) return '1〜2文でない';
  for (const s of sents) { const r = checkSentence(s); if (r) return r; }
  return null;
}
export function splitSentences(text) { return (String(text || '').match(/[^。]+。/g) || []).map((x) => x.trim()); }

/** tags だけで組む1文（新しい事実を足さない）。tags は最大3つ・条件に触れる語は使わない */
export function tagsSentence(pref, tags) {
  const ok = (tags || []).filter((t) => !MONEY_TIME.test(t) && !SUPERLATIVE.test(t) && !GUESS.test(t) && !BANNED_PHRASES.test(t)).slice(0, 3);
  return ok.length ? `${pref}の、${ok.join('・')}の旅先です。` : `${pref}の旅先です。`;
}
/** description から、先頭の1〜2文を採る（途中で切らない）。採れなければ { reason } */
export function pickFromDescription(description) {
  const sents = splitSentences(description);
  if (!sents.length) return { reason: 'description が無い' };
  const r1 = checkSentence(sents[0]);
  if (r1) return { reason: r1 };
  let text = sents[0];
  if (sents[1] && !checkSentence(sents[1]) && (sents[0] + sents[1]).length <= MAX_LEN) text += sents[1];
  return { text };
}
