#!/usr/bin/env node
/**
 * auditOuenWari.mjs — 応援割（src/data/ouenWari.ts）の表示が、日付に対して古くなっていないかを見る（2026-10-13）。
 * 制度は日付で状態が変わる。静的ページを作り直さずに放置すると、終わった制度が「受付中」のまま残る。
 *
 *   ・status が open/soon なのに、endsOn（終了日）を過ぎている        → 終了に切り替える
 *   ・status が soon なのに、startsOn（開始日）を過ぎている          → 受付中に切り替える
 *   ・確認日（checked）が古い（既定は14日より前）                    → 公式サイトで取り直す
 *   ・公式リンクが無い／https でない
 *   ・ended の制度に「続く制度」（同じ県の open/soon）が無い         → 参考（導線が切れていないか）
 * ページのバッジはブラウザが日付で進めるが、HTML 自体と検索結果の表示は作り直すまで変わらない。
 * usage: node scripts/auditOuenWari.mjs [--today 2026-10-14] [--max-age 14]
 */
import { SCHEMES } from '../src/data/ouenWari.ts';

const args = process.argv.slice(2);
const val = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const today = val('--today', new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
const MAX_AGE = Number(val('--max-age', 14));
const toIso = (ja) => { const m = String(ja).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/); return m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : null; };
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

const stale = [], notStarted = [], oldCheck = [], noOfficial = [], noSuccessor = [];
for (const s of SCHEMES) {
  if (s.status !== 'ended' && s.endsOn && today > s.endsOn) stale.push(`${s.slug}（終了日 ${s.endsOn}）`);
  if (s.status === 'soon' && s.startsOn && today >= s.startsOn) notStarted.push(`${s.slug}（開始日 ${s.startsOn}）`);
  const c = toIso(s.checked);
  if (!c || days(c, today) > MAX_AGE) oldCheck.push(`${s.slug}（確認日 ${s.checked}）`);
  if (!s.official?.length || s.official.some((o) => !/^https:\/\//.test(o.url))) noOfficial.push(s.slug);
  if (s.status === 'ended' && !SCHEMES.some((x) => x.pref === s.pref && x.status !== 'ended')) noSuccessor.push(s.slug);
}
console.log(`応援割 ${SCHEMES.length} 件（受付中・開始前 ${SCHEMES.filter((s) => s.status !== 'ended').length} / 終了 ${SCHEMES.filter((s) => s.status === 'ended').length}）・基準日 ${today}`);
console.log(`終了日を過ぎているのに受付中・開始前のまま: ${stale.length}件${stale.length ? ' ' + stale.join(', ') : ''}`);
console.log(`開始日を過ぎているのに「まもなく」のまま: ${notStarted.length}件${notStarted.length ? ' ' + notStarted.join(', ') : ''}`);
console.log(`確認日が${MAX_AGE}日より古い: ${oldCheck.length}件${oldCheck.length ? ' ' + oldCheck.join(', ') : ''}`);
console.log(`公式リンクが無い・https でない: ${noOfficial.length}件${noOfficial.length ? ' ' + noOfficial.join(', ') : ''}`);
console.log(`終了したのに、同じ県で続く制度が無い: ${noSuccessor.length}件${noSuccessor.length ? ' ' + noSuccessor.join(', ') : ''}`);
process.exit(stale.length || notStarted.length || oldCheck.length || noOfficial.length ? 1 : 0);
