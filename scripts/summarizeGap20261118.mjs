// 優先ページの未適用・旧値の食い違いの洗い出し（修正前の記録 gaps_a/b/b2.json）と、修正（g・h）の集計を README にまとめる（2026-11-18）
import fs from 'fs';
const O = 'logs/priority_gap_20261118'; const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const a = J(`${O}/gaps_a.json`); const b = J(`${O}/gaps_b.json`); const b2 = J(`${O}/gaps_b2.json`);
const g = J('scripts/data/mergeFactFixes20261118g.json').fixes[0].edits; const h = J('scripts/data/mergeFactFixes20261118h.json').fixes[0].edits; const fixes = [...g, ...h];
// 洗い出しの追加分（info の行の中の文。洗い出しの関数を直した後に見つかった2件）
const extraA = [{ page: 'ginzan-onsen', n: 17, 種類: '営業時間', 判定: '確認できず', 理由: '記載なし', 文: '混雑：日中（11時〜16時）は日帰り観光客で混雑。', 残った理由: '行の中の文が、行ぜんたいと一致しないため（info の行を「。」で区切った文を、削除の対象にしていなかった）' }, { page: 'shimekappu', n: 12, 種類: 'その他の数値', 判定: '確認できず', 理由: '記載なし', 文: 'マイナス20度以下になることあり', 残った理由: '行の中の文が、行ぜんたいと一致しないため（同上）' }];
const A = [...a, ...extraA]; const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const desc = b.filter((x) => x.残っている場所 === 'description'); const descOK = new Set(['ryujin-suspension']);
const descReal = desc.filter((x) => !descOK.has(x.page)); const descPages = [...new Set(descReal.map((x) => x.page))];
const out = { a: { 残っていた文: A.length, ページ数: new Set(A.map((x) => x.page)).size, 残った理由別: count(A, (x) => x.残った理由.replace(/（.*$/, '')), 種類別: count(A, (x) => x.種類), 判定別: count(A, (x) => x.判定 + (x.判定 === '確認できず' ? `(${x.理由})` : '')), 対象の文_判定の区分が対象: 758 },
  b: { 置換した値_件数: 177, 旧値が同じページに残る候補_本文などの欄: b.filter((x) => x.残っている場所 !== 'description').length + b2.length, 候補_descriptionの欄: desc.length, 修正した: fixes.filter((e) => e.reason.startsWith('同じページ')).length, 時刻を外した: fixes.filter((e) => e.rule === 'P3').length, descriptionに残る_実際の食い違い: descReal.length, descriptionに残るページ数: descPages.length },
  直した件数_規則別: count(fixes, (e) => e.rule), 直した件数_種類別: count(fixes, (e) => e.種類), 直した編集: fixes.length, 影響ページ: new Set(fixes.map((e) => e.page)).size };
fs.writeFileSync(`${O}/summary_final.json`, JSON.stringify(out, null, 1));
fs.writeFileSync(`${O}/gaps_description.json`, JSON.stringify(descReal.map((x) => ({ page: x.page, 名前: x.名前, 置換: x.置換, descriptionの文: x.残っている文 })), null, 1));
const md = ['# 優先ページの修正の未適用・旧値の食い違い（2026-11-18）', '', '## a) 判定の区分が対象なのに残っていた文（修正前）', `判定の区分（食い違い・確認できず＝記載なし／特定不可）が対象の文 758 件のうち、残っていたのは ${A.length} 件（${out.a.ページ数} ページ）。`, '', '残った理由:', ...Object.entries(out.a.残った理由別).map(([k, v]) => `- ${k}: ${v}`), '', '種類別: ' + JSON.stringify(out.a.種類別), '', '| ページ | # | 判定 | 種類 | 文 | 残った理由 |', '|---|---|---|---|---|---|', ...A.map((x) => `| ${x.page} | ${x.n} | ${x.判定}${x.理由 ? '（' + x.理由 + '）' : ''} | ${x.種類} | ${x.文.slice(0, 40)} | ${x.残った理由.slice(0, 40)} |`), '',
  '## b) 置換した値の旧値が同じページに残っていた箇所（修正前）', `置換した値（P1）177 種。本文・info・lead・tips・モデルコース・見どころの説明に旧値が残る候補 ${out.b.旧値が同じページに残る候補_本文などの欄} 件を人が読み、同じ事実の食い違いだったもの ${out.b.修正した} 件と、モデルコースの時刻 ${out.b.時刻を外した} 件を直した。ほかは、別の施設・別の項目・置換後の値そのもの（理由つきで allowlist.json）。`, '',
  `description（メタに出る欄）には、旧値が残っている（${out.b.descriptionに残る_実際の食い違い} 件・${out.b.descriptionに残るページ数} ページ）。メタを変えない決まりなので、今回は触らず、一覧（gaps_description.json）にした。`, '', '## 直した編集（変更前後・出典）', '| 規則 | ページ | 場所 | 変更前 | 変更後 | 出典 |', '|---|---|---|---|---|---|', ...fixes.map((e) => `| ${e.rule} | ${e.page} | ${e.field || (e.spot || []).join('/')} | ${String(e.old).replace(/\n/g, '⏎').slice(0, 40)} | ${e.new === '' ? '（削除）' : String(e.new).slice(0, 30)} | ${(e.出典URL || []).slice(0, 1).join('') || '（出典なし＝確認できず）'} |`), ''];
fs.writeFileSync(`${O}/README.md`, md.join('\n')); console.log(JSON.stringify(out, null, 1));
