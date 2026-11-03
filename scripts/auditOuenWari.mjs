#!/usr/bin/env node
/**
 * auditOuenWari.mjs — 応援割（src/data/ouenWari.ts）の表示が、日付に対して古くなっていないかを見る（2026-10-13）。
 * 制度は日付で状態が変わる。静的ページを作り直さずに放置すると、終わった制度が「受付中」のまま残る。
 *
 *   ・status が open/soon なのに、endsOn（終了日）を過ぎている        → 終了に切り替える
 *   ・status が soon なのに、startsOn（開始日）を過ぎている          → 受付中に切り替える
 *   ・確認日（checked）が古い（既定は14日より前）                    → 公式サイトで取り直す
 *   ・公式リンクが無い／https でない
 *   ・出典つきの項目（channels・facts）に出典URL（https）と確認日が無い／確認日が古い。報道（news）に出典が無い
 *   ・ビルド済みページの、出典URLと確認日つきの枠（data-fact）の外にある割引率・上限額（scripts/factRules.mjs）
 *   ・ended の制度に「続く制度」（同じ県の open/soon）が無い         → 参考（導線が切れていないか）
 * ページのバッジはブラウザが日付で進めるが、HTML 自体と検索結果の表示は作り直すまで変わらない。
 * usage: node scripts/auditOuenWari.mjs [--today 2026-10-14] [--max-age 14]
 */
import fs from 'fs';
import { SCHEMES } from '../src/data/ouenWari.ts';
import { unsourcedNumbers } from './factRules.mjs';

const args = process.argv.slice(2);
const val = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const today = val('--today', new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));
const MAX_AGE = Number(val('--max-age', 14));
const toIso = (ja) => { const m = String(ja).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/); return m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : null; };
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

const stale = [], notStarted = [], oldCheck = [], noOfficial = [], noSuccessor = [], unsourced = [];
for (const s of SCHEMES) {
  if (s.status !== 'ended' && s.endsOn && today > s.endsOn) stale.push(`${s.slug}（終了日 ${s.endsOn}）`);
  if (s.status === 'soon' && s.startsOn && today >= s.startsOn) notStarted.push(`${s.slug}（開始日 ${s.startsOn}）`);
  const c = toIso(s.checked);
  if (!c || days(c, today) > MAX_AGE) oldCheck.push(`${s.slug}（確認日 ${s.checked}）`);
  if (!s.official?.length || s.official.some((o) => !/^https:\/\//.test(o.url))) noOfficial.push(s.slug);
  // 出典つきの項目（販売先ごとの状況・割引率などの条件）: 出典URLが https で、確認日があり、古くないこと
  for (const f of [...(s.channels ?? []), ...(s.facts ?? [])]) {
    const tag = `${s.slug}「${f.name ?? f.label}」`;
    if (!/^https:\/\//.test(f.source?.url ?? '')) noOfficial.push(`${tag}の出典URL`);
    const fc = toIso(f.checked);
    if (!fc || days(fc, today) > MAX_AGE) oldCheck.push(`${tag}（確認日 ${f.checked}）`);
  }
  for (const n of s.news ?? []) if (!/^https:\/\//.test(n.url ?? '') || !n.outlet || !n.date) noOfficial.push(`${s.slug}の報道の出典`);
  if (s.status === 'ended' && !SCHEMES.some((x) => x.pref === s.pref && x.status !== 'ended')) noSuccessor.push(s.slug);
}
console.log(`応援割 ${SCHEMES.length} 件（受付中・開始前 ${SCHEMES.filter((s) => s.status !== 'ended').length} / 終了 ${SCHEMES.filter((s) => s.status === 'ended').length}）・基準日 ${today}`);
console.log(`終了日を過ぎているのに受付中・開始前のまま: ${stale.length}件${stale.length ? ' ' + stale.join(', ') : ''}`);
console.log(`開始日を過ぎているのに「まもなく」のまま: ${notStarted.length}件${notStarted.length ? ' ' + notStarted.join(', ') : ''}`);
console.log(`確認日が${MAX_AGE}日より古い: ${oldCheck.length}件${oldCheck.length ? ' ' + oldCheck.join(', ') : ''}`);
console.log(`公式リンクが無い・https でない: ${noOfficial.length}件${noOfficial.length ? ' ' + noOfficial.join(', ') : ''}`);
// ビルド済みのページ: 割引率・上限額は「出典URLと確認日つきの枠」の外に書かない（dist が無ければ見ない）
for (const slug of ['ouen-wari', 'kyushu-fukko', ...SCHEMES.map((x) => x.slug)]) {
  const f = `dist/${slug}/index.html`;
  if (!fs.existsSync(f)) continue;
  for (const m of unsourcedNumbers(fs.readFileSync(f, 'utf8'))) unsourced.push(`${slug}: ${m}`);
}
console.log(`出典・確認日つきの枠の外にある割引率・上限額: ${unsourced.length}件${unsourced.length ? ' ' + unsourced.join(', ') : ''}`);
console.log(`終了したのに、同じ県で続く制度が無い: ${noSuccessor.length}件${noSuccessor.length ? ' ' + noSuccessor.join(', ') : ''}`);
process.exit(stale.length || notStarted.length || oldCheck.length || noOfficial.length || unsourced.length ? 1 : 0);
