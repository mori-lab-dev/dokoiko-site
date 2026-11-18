// 体験談・行程案の分類規則（scripts/lib/factRules20261118.mjs の isExperience）の精度を、標本50件＋優先ページの試験43件で測る（2026-11-18・読み取りのみ）。
// 正解: 標本は results.json の分類「公式の記載の対象でない」、試験は results.json の理由「文の対象が体験談・行程案・感想」を、体験談・行程案とする。ほかは事実の記述。
import fs from 'fs';
import { isExperience, kindOf } from './lib/factRules20261118.mjs';
const A = 'logs/audit_sample_20261118', T = 'logs/priority_trial_20261118';
const typeOf = (w) => (/モデルコース/.test(w) ? 'modelCourse' : /info$/.test(w) ? 'info' : /tips$/.test(w) ? 'tips' : /^見どころ/.test(w) ? 'spot' : 'body');
const rows = [];
const samp = JSON.parse(fs.readFileSync(`${A}/sample50.json`, 'utf8')).標本; const res = JSON.parse(fs.readFileSync(`${A}/results.json`, 'utf8'));
for (const u of samp) { const r = res.find((x) => x.n === u.標本番号); rows.push({ 出典: '標本50', n: u.標本番号, 文: u.文, 場所: u.where, 種類: u.種類, 正解: r.分類 === '公式の記載の対象でない' ? '体験談・行程案' : '事実', 判定: r.判定, type: typeOf(u.where) }); }
const tr = JSON.parse(fs.readFileSync(`${T}/results.json`, 'utf8'));
for (const id of Object.keys(tr.判定)) { const pj = JSON.parse(fs.readFileSync(`${T}/page_${id}.json`, 'utf8')); for (const j of tr.判定[id]) { const u = pj.文.find((x) => x.番号 === j.n); rows.push({ 出典: `試験:${id}`, n: j.n, 文: u.文, 場所: u.場所, 種類: u.種類, 正解: j.理由 === '文の対象が体験談・行程案・感想' ? '体験談・行程案' : '事実', 判定: j.判定, type: typeOf(u.場所) }); } }
for (const r of rows) r.予測 = isExperience(r.文, { type: r.type }) ? '体験談・行程案' : '事実';
const cm = (rs) => { const tp = rs.filter((r) => r.予測 === '体験談・行程案' && r.正解 === '体験談・行程案').length, fp = rs.filter((r) => r.予測 === '体験談・行程案' && r.正解 === '事実').length, fn = rs.filter((r) => r.予測 === '事実' && r.正解 === '体験談・行程案').length, tn = rs.filter((r) => r.予測 === '事実' && r.正解 === '事実').length; return { 件数: rs.length, 体験談を体験談と判定: tp, 事実を体験談と誤判定_削除されずに残る: fp, 体験談を事実と誤判定_誤って削除の対象: fn, 事実を事実と判定: tn, 正解率: +((tp + tn) / rs.length * 100).toFixed(0) + '%' }; };
const R1kinds = rows.filter((r) => ['料金', '休館日', '営業時間'].includes(kindOf(r.文)));
const out = { 全体: cm(rows), 標本50: cm(rows.filter((r) => r.出典 === '標本50')), 試験43: cm(rows.filter((r) => r.出典.startsWith('試験'))), R1の対象の種類のみ_料金休館日営業時間: cm(R1kinds),
  誤判定: rows.filter((r) => r.予測 !== r.正解).map((r) => ({ 出典: r.出典, n: r.n, 場所: r.場所, 文: r.文, 正解: r.正解, 予測: r.予測, 判定: r.判定 })) };
// R1 を標本50に当てた場合（優先ページ以外・確認済みのリスト＝標本の「一致」16件）
const keep = new Set(JSON.parse(fs.readFileSync('logs/dryrun_20261118/verified_keep.json', 'utf8')).map((k) => k.文));
const scope = rows.filter((r) => r.出典 === '標本50' && ['料金', '休館日', '営業時間'].includes(kindOf(r.文)));
const del = (r, useKeep) => r.予測 === '事実' && !(useKeep && keep.has(r.文));
const tally = (rs) => ({ 件数: rs.length, 一致: rs.filter((r) => r.判定 === '一致').length, 食い違い: rs.filter((r) => r.判定 === '食い違い').length, 確認できず: rs.filter((r) => r.判定 === '確認できず').length });
out.R1を標本50に当てた場合 = { 対象の種類の文: scope.length, 確認済みのリストなし: { 削除される: tally(scope.filter((r) => del(r, false))), 残る: tally(scope.filter((r) => !del(r, false))) }, 確認済みのリストあり: { 削除される: tally(scope.filter((r) => del(r, true))), 残る: tally(scope.filter((r) => !del(r, true))) }, 注: '標本のうち優先ページは無いので、すべて優先ページ以外として扱った' };
fs.writeFileSync('logs/dryrun_20261118/classifier.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({ 全体: out.全体, 標本50: out.標本50, 試験43: out.試験43, R1の種類のみ: out.R1の対象の種類のみ_料金休館日営業時間, R1: out.R1を標本50に当てた場合 }, null, 1)); console.log('誤判定', out.誤判定.length); for (const e of out.誤判定) console.log(e.出典, e.n, e.正解, '→', e.予測, '|', e.文.slice(0, 50));
