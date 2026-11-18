// 抜き取り調査の集計と、全体への見積もり（2026-11-18・読み取りのみ）。入力: logs/audit_sample_20261118/{sample50,results,counts}.json
// 見積もり: 点推定 = Σ（層の総件数 × 層の標本の割合 x/n）（3つの合計が総件数に一致）。95%の範囲 = 点推定 ±1.96×√Σ（層の総件数² × p̃(1−p̃)/(n+4)）（p̃=(x+2)/(n+4)・Agresti–Coull）。層は7つ・各7〜8件の小標本なので、範囲は広い。
import fs from 'fs';
const D = 'logs/audit_sample_20261118';
const s = JSON.parse(fs.readFileSync(`${D}/sample50.json`, 'utf8')).標本; const r = JSON.parse(fs.readFileSync(`${D}/results.json`, 'utf8')); const c = JSON.parse(fs.readFileSync(`${D}/counts.json`, 'utf8'));
const byN = new Map(r.map((x) => [x.n, x])); const KINDS = ['料金', '休館日', '営業時間', '時刻', '標高・距離', '年号', 'その他の数値'];
const J3 = ['一致', '食い違い', '確認できず'];
const out = { 標本: s.length, 種類ごと: {}, 全体: {} }; let totN = 0; const tot = {}; const varsum = {}; for (const j of J3) { tot[j] = 0; varsum[j] = 0; }
for (const k of KINDS) {
  const items = s.filter((u) => u.種類 === k).map((u) => ({ ...u, ...byN.get(u.標本番号) })); const n = items.length; const N = c.種類ごと[k].件数; totN += N;
  const row = { 標本: n, 総件数: N };
  for (const j of J3) { const x = items.filter((i) => i.判定 === j).length; const p = (x + 2) / (n + 4); row[j] = { 件数: x, 割合: +(x / n * 100).toFixed(0) + '%', 推定件数: Math.round(N * x / n) }; tot[j] += N * x / n; varsum[j] += (N * N * p * (1 - p)) / (n + 4); }
  out.種類ごと[k] = row;
}
for (const j of J3) { const se = Math.sqrt(varsum[j]); out.全体[j] = { 標本の件数: r.filter((x) => x.判定 === j).length, 標本の割合: +(r.filter((x) => x.判定 === j).length / r.length * 100).toFixed(0) + '%', 推定件数: Math.round(tot[j]), 推定割合: +(tot[j] / totN * 100).toFixed(0) + '%', 範囲95: [Math.max(0, Math.round(tot[j] - 1.96 * se)), Math.round(tot[j] + 1.96 * se)], 範囲割合95: [Math.max(0, +((tot[j] - 1.96 * se) / totN * 100).toFixed(0)), +(Math.min(totN, tot[j] + 1.96 * se) / totN * 100).toFixed(0)] }; }
out.総件数 = totN;
out.確認できずの内訳 = { '公式の記載の対象でない（体験談・行程案・感想）': r.filter((x) => x.分類 === '公式の記載の対象でない').length, '公式に記載が見つからない・対象が特定できない': r.filter((x) => x.分類 === '公式に記載が見つからない').length };
out.食い違い例 = r.filter((x) => x.判定 === '食い違い').map((x) => { const u = s.find((y) => y.標本番号 === x.n); return { n: x.n, ページ: `${u.name}（${u.url}）`, 文: u.文, 公式の値: x.公式の値, 出典: x.出典 }; });
fs.writeFileSync(`${D}/estimate.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ 種類ごと: out.種類ごと, 全体: out.全体, 確認できずの内訳: out.確認できずの内訳 }, null, 1));
// README（調査の記録）を作る
const ex = out.食い違い例.filter((e) => [37, 42, 39, 6, 8, 2, 34, 17, 28, 29].includes(e.n));
const md = [
  '# 料金・休館日・営業時間などの記述の抜き取り調査（2026-11-18）', '',
  '読むだけの調査。サイトのファイルは変えていない。確認日はすべて 2026-11-18。根拠は公式（施設・自治体・観光協会・公的データベース）だけ。',
  '', '## 1. 抜き出し（scripts/extractFactSentences20261118.mjs）',
  `対象: 旅先ページ ${c.旅先ページの総数}件の本文（記事の節の body・info、見どころの説明、モデルコース、tips。統合ページは各見出しの分）。除外: 応援割ページ、ページ冒頭の説明・lead・bestSeason、所要時間だけの数字。単位は文（「。」区切り）か info の1行。`,
  `抜き出した文: ${c.抜き出した文の総数}件（同じ旅先ページ内の同文の重複を除く。除く前 ${c.重複を除く前}件）。何らかの種類を含むページ: ${c.何らかの種類を含むページ}件（${c.何らかの種類を含むページの割合}%）。`,
  '', '| 種類 | 文の件数 | 含むページ数 | ページの割合 |', '|---|---|---|---|', ...KINDS.map((k) => `| ${k} | ${c.種類ごと[k].件数} | ${c.種類ごと[k].含むページ数} | ${c.種類ごと[k].ページの割合}% |`),
  '', '種類は、先に当たったものにする（料金 → 休館日 → 営業時間 → 時刻 → 標高・距離 → 年号 → その他の数値）。規則は extractFactSentences20261118.mjs の RULES。',
  '', '## 2. 標本の選び方（scripts/sampleFactSentences20261118.mjs）',
  '7つの層（種類）ごとに同数をそろえた（料金8件・ほかは7件＝50件）。各層の中は無作為（乱数 mulberry32・seed 20261118）。同じ旅先ページからは2件以上選ばない。標本: sample50.json。',
  '', '## 3. 確認',
  '判定: 一致／食い違い（公式の値を書く）／確認できず。5組（各10件）に分けて確認した（確認者のうち、判定が文の対象とずれていた3件〈4・20・26〉は、こちらで「確認できず」に直した）。食い違いのうち4件（42・39・6・37）は、公式ページを取り直して値を確かめた。結果: results.json。',
  '', '## 4. 結果', '| 種類 | 標本 | 一致 | 食い違い | 確認できず |', '|---|---|---|---|---|',
  ...KINDS.map((k) => { const x = out.種類ごと[k]; return `| ${k} | ${x.標本} | ${x.一致.件数}（${x.一致.割合}） | ${x.食い違い.件数}（${x.食い違い.割合}） | ${x.確認できず.件数}（${x.確認できず.割合}） |`; }),
  `| 全体 | ${out.標本} | ${out.全体.一致.標本の件数}（${out.全体.一致.標本の割合}） | ${out.全体.食い違い.標本の件数}（${out.全体.食い違い.標本の割合}） | ${out.全体.確認できず.標本の件数}（${out.全体.確認できず.標本の割合}） |`,
  '', `確認できず ${out.全体.確認できず.標本の件数}件の内訳: 公式の記載の対象でない（体験談・行程案・感想）${out.確認できずの内訳['公式の記載の対象でない（体験談・行程案・感想）']}件／公式に記載が見つからない・対象が特定できない${out.確認できずの内訳['公式に記載が見つからない・対象が特定できない']}件。`,
  '', '## 5. 食い違いの例（10件）', '| 標本 | ページ | 文 | 公式の値 | 出典 |', '|---|---|---|---|---|', ...ex.map((e) => `| ${e.n} | ${e.ページ} | ${e.文} | ${e.公式の値} | ${e.出典} |`),
  '', '## 6. 全体への見積もり', `点推定 = Σ（層の総件数 × 層の標本の割合）。95%の範囲は層ごとの Agresti–Coull の分散から（各層7〜8件の小標本なので広い）。総件数 ${out.総件数}。`,
  '', '| 判定 | 推定件数 | 推定割合 | 範囲（95%） |', '|---|---|---|---|', ...J3.map((j) => `| ${j} | ${out.全体[j].推定件数} | ${out.全体[j].推定割合} | ${out.全体[j].範囲95[0]}〜${out.全体[j].範囲95[1]}件（${out.全体[j].範囲割合95[0]}〜${out.全体[j].範囲割合95[1]}%） |`),
  '', '注意: 標本が小さく、食い違いには「季節・コースで値が変わるうちの別の値」「文の対象施設が特定できないもの」も含む。確認できずの半数近くは、公式の記載の対象でない文（体験談・行程）。',
];
fs.writeFileSync(`${D}/README.md`, md.join('\n') + '\n');
