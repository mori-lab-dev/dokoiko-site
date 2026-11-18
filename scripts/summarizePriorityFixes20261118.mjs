// 優先ページの判定の内訳（種類ごと・ページごと）と、直した/削除した/触らなかった件数の集計（2026-11-18）
import fs from 'fs';
const D = 'logs/priority_fix_20261118'; const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const edits = J('scripts/data/mergeFactFixes20261118d.json').fixes[0].edits;
const rep = J(`${D}/edits_report.json`); const names = new Map(J('src/data/destinations.json').map((d) => [d.id, d.name]));
const byKind = {}, byPage = {}, reason = { 記載なし: 0, 対象を特定できない: 0, '体験談・行程案': 0, 検索失敗: 0, 他: 0 };
const total = { 文: 0, 一致: 0, 食い違い: 0, 確認できず: 0 };
for (const f of fs.readdirSync(`${D}/results`)) { if (f.startsWith('_') || !f.endsWith('.json')) continue; const id = f.replace('.json', ''); const r = J(`${D}/results/${f}`); const inp = J(`${D}/inputs/page_${id}.json`); const so = new Map(inp.文.map((x) => [x.番号, x]));
  const P = (byPage[id] = { 名前: names.get(id), 文: 0, 一致: 0, 食い違い: 0, 確認できず: 0 });
  for (const j of r.判定) { const k = so.get(j.n)?.種類 || '不明'; byKind[k] ||= { 文: 0, 一致: 0, 食い違い: 0, 確認できず: 0 }; byKind[k].文++; byKind[k][j.判定]++; P.文++; P[j.判定]++; total.文++; total[j.判定]++; if (j.判定 === '確認できず') { if (j.理由 in reason) reason[j.理由]++; else reason.他++; } } }
const act = edits.reduce((m, e) => ((m[e.rule] = (m[e.rule] || 0) + 1), m), {});
const editedSent = new Set(edits.map((e) => `${e.page}|${e.旧文 || e.削除した文}`)).size;
const out = { 全体: total, 確認できずの理由: reason, 種類ごと: byKind, ページごと: byPage, 編集: act, 編集の件数: edits.length, 直した_置換: act.P1 || 0, 削除_確認できず: act.P2 || 0, 削除_食い違い: act.P1d || 0, 時刻を外した: act.P3 || 0, 触らなかった文の数: total.文 - editedSent,
  見送りの内訳: rep.skip.reduce((m, s) => ((m[s.理由] = (m[s.理由] || 0) + 1), m), {}), 置換から削除に回した: rep.置換から削除へ回した.length };
fs.writeFileSync(`${D}/summary.json`, JSON.stringify(out, null, 1));
const md = ['# 優先ページの修正の集計（2026-11-18）', '', `優先ページ 129（文のあるページ 101・文の無いページ 28）。文 ${total.文}（一致 ${total.一致}・食い違い ${total.食い違い}・確認できず ${total.確認できず}）`, '', '## 種類ごと', '| 種類 | 文 | 一致 | 食い違い | 確認できず |', '|---|---|---|---|---|', ...Object.entries(byKind).map(([k, v]) => `| ${k} | ${v.文} | ${v.一致} | ${v.食い違い} | ${v.確認できず} |`), '', '## ページごと', '| ページ | 文 | 一致 | 食い違い | 確認できず |', '|---|---|---|---|---|', ...Object.entries(byPage).map(([id, v]) => `| ${v.名前}（${id}） | ${v.文} | ${v.一致} | ${v.食い違い} | ${v.確認できず} |`)];
fs.writeFileSync(`${D}/summary.md`, md.join('\n') + '\n'); console.log(JSON.stringify({ ...out, ページごと: undefined }, null, 1));
