// 優先ページ3つの検証の試験（2026-11-18）の集計・コスト見積もり・修正案（変更前後）。サイトのファイルは変えない。
import fs from 'fs';
const D = 'logs/priority_trial_20261118';
const R = JSON.parse(fs.readFileSync(`${D}/results.json`, 'utf8'));
const units = JSON.parse(fs.readFileSync('logs/audit_sample_20261118/units.json', 'utf8'));
const pagesGsc = JSON.parse(fs.readFileSync('logs/merge_20261118/pages.json', 'utf8')).filter((p) => p.表示_累計 >= 3);
const dests = new Map(JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')).map((d) => [d.id, d]));
const out = { ページ: {}, 合計: {}, 見積もり: {} };
let tT = 0, tS = 0, tTime = 0, tFetch = 0, tSearch = 0, tTool = 0; const tally = { 一致: 0, 食い違い: 0, 確認できず: 0, 確認できず_記載なし: 0, 確認できず_体験談行程: 0 };
for (const [id, c] of Object.entries(R.コスト_実測)) {
  const js = R.判定[id]; const t = { 一致: 0, 食い違い: 0, 確認できず: 0, 確認できず_記載なし: 0, 確認できず_体験談行程: 0 };
  for (const j of js) { t[j.判定]++; tally[j.判定]++; if (j.判定 === '確認できず') { const k = j.理由 === '公式に記載なし' ? '確認できず_記載なし' : '確認できず_体験談行程'; t[k]++; tally[k]++; } }
  out.ページ[id] = { 名前: dests.get(id).name, ...c, 判定: t, トークン_1文あたり: Math.round(c.トークン / c.文の数), 秒_1文あたり: +(c.所要時間_秒 / c.文の数).toFixed(2) };
  tT += c.トークン; tS += c.文の数; tTime += c.所要時間_秒; tFetch += c.公式ページの取得回数_自己申告; tSearch += c.検索回数_自己申告; tTool += c.ツール使用回数;
}
const pages = Object.values(out.ページ);
out.合計 = { 文: tS, トークン: tT, 判定: tally, トークン_1ページ平均: Math.round(tT / 3), トークン_1文平均: Math.round(tT / tS), 秒_1ページ平均: +(tTime / 3).toFixed(1), ツール使用_1ページ平均: +(tTool / 3).toFixed(1), 公式ページ取得_合計: tFetch, 検索_合計: tSearch };
const ids = new Set(pagesGsc.map((p) => p.id)); const nSent = units.filter((u) => ids.has(u.page)).length;
const tmin = Math.min(...pages.map((p) => p.トークン)), tmax = Math.max(...pages.map((p) => p.トークン)); const smin = Math.min(...pages.map((p) => p.トークン_1文あたり)), smax = Math.max(...pages.map((p) => p.トークン_1文あたり));
const secmin = Math.min(...pages.map((p) => p.所要時間_秒)), secmax = Math.max(...pages.map((p) => p.所要時間_秒));
out.見積もり = { 優先ページ: ids.size, 優先ページの事実の文: nSent, 文の平均_1ページ: +(nSent / ids.size).toFixed(1), 試験した3ページの文の平均: +(tS / 3).toFixed(1),
  トークン_ページ単位: { 最小: tmin * ids.size, 平均: Math.round(tT / 3 * ids.size), 最大: tmax * ids.size }, トークン_文単位: { 最小: smin * nSent, 平均: Math.round(tT / tS * nSent), 最大: smax * nSent },
  所要時間_直列_分: { 最小: +(secmin * ids.size / 60).toFixed(0), 平均: +(tTime / 3 * ids.size / 60).toFixed(0), 最大: +(secmax * ids.size / 60).toFixed(0) }, 所要時間_5並列_分: { 平均: +(tTime / 3 * ids.size / 60 / 5).toFixed(0) },
  公式ページの取得回数: { 最小: 0, 最大: ids.size, 平均: Math.round(tFetch / 3 * ids.size) }, 検索回数: { 最小: ids.size * 1, 平均: Math.round(tSearch / 3 * ids.size), 最大: ids.size * 3 },
  前回の抜き取り調査_1文あたりトークン: Math.round(1559235 / 50), 注: '3ページの試験なので区間は広い。トークンは確認担当の使用量（ハーネスの実測）。取得回数・検索回数は確認担当の自己申告' };
fs.writeFileSync(`${D}/summary.json`, JSON.stringify(out, null, 1));
// 修正案（変更前後）: 食い違い10件。公式の値に直せるものは値に直し、対象施設が特定できないもの・ほかの部分が確認できないものは、文または行を削除する案
const art = (id) => JSON.parse(fs.readFileSync(`src/data/articles/${id}.json`, 'utf8'));
const P = [
 { id: 'suo-oshima', field: 'sections.1.info', old: '駐車場：橋詰付近に数台分あり（無料）', new: '駐車場：町営駐車場あり（40台・無料）', n: 8, 案: '公式の値に直す', 出典: ['https://suo-oshima-kanko.net/spot/oshima-ohashi（周防大島観光協会：町営駐車場40台・無料）'] },
 { id: 'suo-oshima', field: 'sections.2.info', old: '料金目安：600〜800円（食べ放題30分）', new: '料金目安：600〜800円（食べ放題1時間）', n: 11, 案: '公式の値に直す', 出典: ['https://suo-oshima-kanko.net/spot/matsuda-orange（周防大島観光協会：食べ放題1時間・中学生以上600円または800円）'] },
 { id: 'isawa-onsen', field: 'sections.0.info', old: '営業時間：常時開放（深夜は街灯のみ）\n', new: '', n: 5, 案: '行を削除（対象施設が特定できず、公式は利用時間を定めている）', 出典: ['https://www.city.fuefuki.yamanashi.jp/machizukuri/kouen.html（笛吹市：石和温泉駅前公園の足湯 4〜9月10:00〜18:00・10〜3月10:00〜17:00）'] },
 { id: 'isawa-onsen', field: 'sections.2.info', old: '試飲料金：500円〜1500円程度\n', new: '', n: 9, 案: '行を削除（公式は無料〜500円前後で、500〜1500円に当たる値が無い）', 出典: ['https://www.yamanashi-kankou.jp/special/ekinaka_wine.html（やまなし観光推進機構）'] },
 { id: 'isawa-onsen', field: 'sections.2.info', old: '営業時間：10:00〜17:00（施設により異なる）', new: '', n: 10, 案: '行を削除（公式は施設ごとに 9:00〜16:30 など。10:00〜17:00 に当たる施設が無い）', 出典: ['https://www.fuefuki-kanko.jp/detail/336/index.html（笛吹市観光物産連盟）'] },
 { id: 'isawa-onsen', field: 'tips', old: 'レンタサイクルは駅前で1日500円ほど。', new: 'レンタサイクルは石和温泉駅1階の観光案内所で借りられ、無料（保証金1,000円は返却時に返金）。', n: 13, 案: '公式の値に直す（削除でもよい）', 出典: ['https://www.fuefuki-kanko.jp/detail/220/index.html（笛吹市観光物産連盟）'] },
 { id: 'ikoma-kogen', field: 'sections.0.body', old: '入園料は大人500円。', new: '入園料は中学生以上700円。', n: 3, 案: '公式の値に直す', 出典: ['https://ikomakougen.com/information（生駒高原 公式：中学生以上700円・小学生以下無料）'] },
 { id: 'ikoma-kogen', field: 'sections.0.info', old: '料金：大人500円、子ども200円', new: '料金：中学生以上700円（小学生・未就学児は無料）', n: 6, 案: '公式の値に直す', 出典: ['https://ikomakougen.com/information'] },
 { id: 'ikoma-kogen', field: 'sections.0.info', old: '開園時間：8:30〜17:00', new: '開園時間：9:00〜17:00', n: 7, 案: '公式の値に直す', 出典: ['https://ikomakougen.com/information（通常営業 9:00〜17:00・最終入園16:30）'] },
 { id: 'ikoma-kogen', field: 'tips', old: '標高700mなので、秋は朝夕が10℃を下回ることもある。\n', new: '', n: 13, 案: '文を削除（標高は公式540mで、後半の気温は公式に記載が無い）', 出典: ['https://www.kanko-miyazaki.jp/en/sightseeing/1025（宮崎県観光協会：標高540m）'] },
];
const md = ['# 優先ページ3つの検証の試験（2026-11-18）', '', '読むだけ。サイトのファイルは変えていない。確認日は 2026-11-18。根拠は公式のみ。', '', '## 選んだ3ページと理由', ...Object.entries(R.選んだ3ページと理由).map(([k, v]) => `- ${k}: ${v}`), '',
  '## 結果（文ごとの判定は results.json）', '| ページ | 文 | 一致 | 食い違い | 確認できず（記載なし／体験談・行程案） |', '|---|---|---|---|---|', ...Object.entries(out.ページ).map(([id, p]) => `| ${p.名前} | ${p.文の数} | ${p.判定.一致} | ${p.判定.食い違い} | ${p.判定.確認できず}（${p.判定.確認できず_記載なし}／${p.判定.確認できず_体験談行程}） |`), `| 合計 | ${tS} | ${tally.一致} | ${tally.食い違い} | ${tally.確認できず}（${tally.確認できず_記載なし}／${tally.確認できず_体験談行程}） |`, '',
  '## コスト（実測）', '| ページ | 文 | トークン | 1文あたり | 所要（秒） | ツール使用 | 施設グループ | 公式ページ取得 | 検索 |', '|---|---|---|---|---|---|---|---|---|', ...Object.values(out.ページ).map((p) => `| ${p.名前} | ${p.文の数} | ${p.トークン} | ${p.トークン_1文あたり} | ${p.所要時間_秒} | ${p.ツール使用回数} | ${p.施設グループ} | ${p.公式ページの取得回数_自己申告} | ${p.検索回数_自己申告} |`), '',
  `平均: 1ページ ${out.合計.トークン_1ページ平均}トークン・${out.合計.秒_1ページ平均}秒、1文 ${out.合計.トークン_1文平均}トークン。前回の抜き取り調査（1文ずつ）は1文あたり約${out.見積もり.前回の抜き取り調査_1文あたりトークン}トークン。`, '', '## 優先ページ129ページ全部を検証する場合の見積もり',
  `優先ページ ${out.見積もり.優先ページ}・事実の文 ${out.見積もり.優先ページの事実の文}件（1ページ平均 ${out.見積もり.文の平均_1ページ}件。試験した3ページは平均 ${out.見積もり.試験した3ページの文の平均}件）。`, '| 見積もり | 最小 | 平均 | 最大 |', '|---|---|---|---|',
  `| トークン（ページ単位） | ${out.見積もり.トークン_ページ単位.最小} | ${out.見積もり.トークン_ページ単位.平均} | ${out.見積もり.トークン_ページ単位.最大} |`, `| トークン（文単位） | ${out.見積もり.トークン_文単位.最小} | ${out.見積もり.トークン_文単位.平均} | ${out.見積もり.トークン_文単位.最大} |`, `| 所要時間（直列・分） | ${out.見積もり.所要時間_直列_分.最小} | ${out.見積もり.所要時間_直列_分.平均} | ${out.見積もり.所要時間_直列_分.最大} |`, `| 所要時間（5並列・分） |  | ${out.見積もり.所要時間_5並列_分.平均} |  |`, `| 公式ページの取得回数 | ${out.見積もり.公式ページの取得回数.最小} | ${out.見積もり.公式ページの取得回数.平均} | ${out.見積もり.公式ページの取得回数.最大} |`, `| 検索回数 | ${out.見積もり.検索回数.最小} | ${out.見積もり.検索回数.平均} | ${out.見積もり.検索回数.最大} |`, '',
  '3ページだけの試験なので、区間は広い。取得回数・検索回数は確認担当の自己申告（検索の抜粋で足りて、取得0回のページがあった）。', '', '## 修正案（変更前後・適用していない）', '| 標本 | ページ | 場所 | 変更前 | 変更後 | 案 | 出典 |', '|---|---|---|---|---|---|---|'];
const fixes = []; let okAll = true;
for (const p of P) {
  const a = art(p.id); const ks = p.field.split('.'); const last = ks.pop(); const holder = ks.reduce((x, k) => x[k], a); const cur = holder[last]; const cnt = cur.split(p.old).length - 1; if (cnt !== 1) { okAll = false; console.log('old が', cnt, '回:', p.id, p.old); }
  fixes.push({ file: `src/data/articles/${p.id}.json`, field: p.field, old: p.old, new: p.new, memo: `標本${p.n}・${p.案}` });
  md.push(`| ${p.n} | ${dests.get(p.id).name} | ${p.field} | ${p.old.replace(/\n/g, '⏎')} | ${p.new === '' ? '（削除）' : p.new} | ${p.案} | ${p.出典.join(' ')} |`);
}
fs.writeFileSync(`${D}/proposed_fixes.json`, JSON.stringify({ note: '優先ページ3つの試験の修正案（適用していない・mergeConflictFixes と同じ形式）', date: '2026-11-18', fixes: [{ id: 'T1', topic: '優先ページ3つの食い違い10件', result: '案', sources: P.flatMap((p) => p.出典), edits: fixes }] }, null, 2));
fs.writeFileSync(`${D}/README.md`, md.join('\n') + '\n');
console.log(okAll ? '修正案の old はすべて1回だけ当たる' : 'old の一致に問題あり'); console.log(JSON.stringify({ 合計: out.合計, 見積もり: out.見積もり }, null, 1));
