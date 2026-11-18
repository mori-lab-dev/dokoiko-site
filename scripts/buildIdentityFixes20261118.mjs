#!/usr/bin/env node
/**
 * buildIdentityFixes20261118.mjs — 取り違えの確認（logs/identity_20261118/results/*.json）で、公式で誤りと確認できた箇所のうち、文・句の置換・削除で直せるものの編集（scripts/data/mergeFactFixes20261118l.json）を作る（2026-11-18）。
 *   直さないもの（案のみ・要判断）: 節・見どころの丸ごとの削除、座標・県・hub・画像・宿・tags の欄、モデルコース・bestSeason の全体が別の場所の内容のもの
 *   高橋・竜野の info の「営業時間：9:00〜17:00」の2行は、別々の施設のブロックの行（重複ではない）。R1 の意図（公式で確認していない営業時間の行を削除）に沿って、2行とも削除（P2）
 */
import fs from 'fs';
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const R = (id) => J(`logs/identity_20261118/results/${id}.json`);
const dests = J('src/data/destinations.json'); const byId = new Map(dests.map((d) => [d.id, d]));
const arts = new Map(); const art = (id) => { if (!arts.has(id)) arts.set(id, J(`src/data/articles/${id}.json`)); return arts.get(id); };
const find = (page, 欄, sub) => { const r = R(page); const f = r.所見.find((x) => x.欄 === 欄 && x.判定 === '誤り' && (!sub || JSON.stringify(x).includes(sub))); if (!f) throw new Error(`所見なし ${page} ${欄} ${sub}`); return f; };
const DATE = '2026-11-18'; const edits = []; const notes = [];
const get = (page, path) => { if (path.startsWith('spot:')) { const sp = byId.get(page).spots.find((s) => s.name === path.slice(5)); return sp?.description; } if (path === 'description') return byId.get(page).description; return path.split('.').reduce((a, k) => a?.[k], art(page)); };
const put = (page, path, v) => { if (path.startsWith('spot:')) { byId.get(page).spots.find((s) => s.name === path.slice(5)).description = v; return; } if (path === 'description') { byId.get(page).description = v; return; } const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], art(page))[last] = v; };
const locOf = (page, path) => path.startsWith('spot:') ? { file: 'src/data/destinations.json', spot: [page, path.slice(5)] } : path === 'description' ? { file: 'src/data/destinations.json', dest: page, field: 'description' } : { file: `src/data/articles/${page}.json`, field: path };
// kind: 'replace' | 'delete'（確認できず=P2・公式で別の場所と確認=P1d）
const E = (page, path, old, nw, o = {}) => { const cur = get(page, path); if (typeof cur !== 'string' || cur.split(old).length - 1 !== 1) { notes.push({ page, path, 理由: 'oldが欄に1回だけ無い', old: old.slice(0, 40) }); return; } put(page, path, cur.replace(old, nw));
  const rule = o.rule || (nw === '' ? 'P1d' : 'P1'); const base = { page, rule, 種類: o.種類 || '所在地・施設', reason: o.reason, 公式の値: o.公式の値 || '', 値: o.値 || [], 出典URL: o.出典URL || [], snapshot: o.snapshot || '', 確認日: DATE, 旧文: old, old, new: nw, ...locOf(page, path) }; if (nw === '') base.削除した文 = old; if (o.削除する部分) { base.削除した文 = o.削除する部分; base.削除する部分 = o.削除する部分; } edits.push(base); };
const F = (page, 欄, sub) => { const f = find(page, 欄, sub); return { 公式の値: f.公式の事実, 出典URL: f.出典URL, snapshot: f.snapshot }; };
// ---- 神威脇温泉（奥尻島）
{ const p = 'gen_北海_神威脇温泉';
  E(p, 'description', '積丹半島の断崖に湧く温泉地', '奥尻島の湯ノ浜地区神威脇に湧く温泉地', { ...F(p, 'description'), 値: ['奥尻島', '湯ノ浜地区神威脇'], reason: '所在地の誤り（実際は奥尻島の湯ノ浜地区神威脇。積丹半島ではない）' });
  E(p, 'sections.0.title', '200円', '500円', { ...F(p, 'sections.0.title'), 値: ['500円'], 種類: '料金', reason: '入浴料の誤り（公式は大人500円）' });
  E(p, 'sections.0.body', '\n\n朝7時から開いている。\n朝一番に入って、誰もいない浴場で海を見るのが、最高の使い方だ。', '', { ...F(p, 'sections.0.body'), 種類: '営業時間', reason: '営業時間の誤り（公式は10:30から・10〜3月は11:00から。朝7時から開いていない）' });
  E(p, 'tips', '余市かニセコで食料を調達してから向かうこと。\nガソリンも余市で入れておく。\n', '', { ...F(p, 'tips'), reason: '別の場所の混入（余市・ニセコは積丹の記述。実際の所在地は奥尻島でフェリーか空路）' }); }
// ---- 丹波篠山
E('tanba-sasayama', 'description', '入場料は500円', '大書院の入館料は大人500円', { ...F('tanba-sasayama', 'description'), 値: ['大書院', '大人(18歳以上)500円'], 種類: '料金', reason: '入場料の対象の誤り（500円は大書院の入館料。城跡本体は無料）' });
// ---- 西山荘
{ const p = 'gen_茨城_西山荘';
  E(p, 'description', '茨城県大子町にある', '茨城県常陸太田市にある', { ...F(p, 'description', '常陸太田市'), snapshot: 'logs/identity_20261118/snapshots/gen_茨城_西山荘__3.txt', 値: ['茨城県常陸太田市'], reason: '所在地の誤り（公式は常陸太田市新宿町590。大子町ではない）' });
  E(p, 'description', '売店がないため飲み物は持参を。', '', { ...F(p, 'description', '売店'), reason: '公式の記載と合わない（入口の西山の里に飲食・物産コーナーがある）' });
  E(p, 'sections.0.info', '新宿町498', '新宿町590', { ...F(p, 'sections.0.info', '新宿町590'), 値: ['新宿町590'], 種類: '所在地', reason: '住所の番地の誤り（公式は590）' });
  E(p, 'sections.1.info', '新宿町498', '新宿町590', { ...F(p, 'sections.1.info', '新宿町590'), 値: ['新宿町590'], 種類: '所在地', reason: '住所の番地の誤り（公式は590）' });
  E(p, 'sections.0.info', '車で約15分', 'タクシーで約5分', { ...F(p, 'sections.0.info', 'タクシー'), 値: ['タクシーで約5分'], 種類: '時刻', reason: 'アクセスの所要時間の誤り（公式は常陸太田駅からタクシーで約5分）' });
  E(p, 'sections.0.body', '1690年', '1691年', { ...F(p, 'sections.0.body', '1691'), 値: ['1691年'], 種類: '年号', reason: '年号の誤り（公式は元禄4年=1691年）' });
  E(p, 'sections.0.body', 'それから300年以上が経っても、建物はそのままの姿だ。', '', { ...F(p, 'sections.0.body', '1819'), 種類: '年号', reason: '公式の記載と合わない（現在の建物は文政2年=1819年の再建で、300年前のままではない）' });
  E(p, 'tips', '駐車場は無料で10台ほど止められた。', '', { ...F(p, 'tips', '駐車場'), 種類: '台数', reason: '公式の記載と合わない（駐車場は100台）' });
  E(p, 'tips', '売店や食事処はないので、飲み物は持参がいい。', '', { ...F(p, 'tips', '飲食'), reason: '公式の記載と合わない（飲食コーナー・物産コーナーがある）' }); }
// ---- 喜多方
{ const p = 'kitakata';
  E(p, 'description', '旧甲斐本家の蔵座敷を活かした', '笹屋旅館に併設する', { ...F(p, 'description'), 値: ['笹屋旅館に併設'], reason: '施設の混同（喜多方蔵座敷美術館は笹屋旅館に併設。旧甲斐家住宅蔵座敷は別の施設）' });
  E(p, 'spot:喜多方蔵座敷美術館', '旧甲斐本家の蔵座敷を活かした美術館。', '笹屋旅館に併設された美術館。', { ...F(p, 'spot:喜多方蔵座敷美術館'), 値: ['笹屋旅館に併設'], reason: '施設の混同（同上）' });
  E(p, 'sections.1.body', 'ここはもともと、旧甲斐本家の蔵座敷だ。\n江戸末期から明治にかけて建てられたもので、国の登録有形文化財にもなっている。', 'ここは、笹屋旅館に併設された美術館だ。', { ...F(p, 'sections.1.body', '笹屋'), 値: ['笹屋旅館に併設', '美術館'], reason: '施設の混同（同上。旧甲斐家住宅蔵座敷の説明が混ざっていた）' });
  E(p, 'sections.1.info', '字北町2846', '字3丁目4844', { ...F(p, 'sections.1.info', '4844'), 値: ['字3丁目4844'], 種類: '所在地', reason: '住所の誤り（公式は喜多方市字3丁目4844）' });
  E(p, 'sections.1.info', '車で約5分', '徒歩約15分', { ...F(p, 'sections.1.info', '徒歩'), 値: ['徒歩約15分'], 種類: '時刻', reason: 'アクセスの誤り（公式はJR喜多方駅から徒歩約15分）' }); }
// ---- 下風呂温泉
{ const p = 'gen_青森_下風呂温泉'; const fT = F(p, 'sections.0.title'); const fA = F(p, 'sections.1.info'); const fD = F(p, 'description', '海峡の湯'); const fB = F(p, 'description', '下北駅');
  E(p, 'sections.0.title', '共同浴場「大湯」｜60円で入れる、本物の湯があった', '「海峡の湯」｜450円で入れる、本物の湯', { ...fT, 値: ['海峡の湯', '450円'], 種類: '料金', reason: '閉館した施設の情報（大湯・新湯は2020年11月30日閉館。現行は海峡の湯で普通券450円）' });
  for (const s of ['番台のおばちゃんに小銭を渡して、のれんをくぐる。\n', '脱衣所は木張りで、ロッカーじゃなくてかごが並んでいる。\n', '昭和のまま、時間が止まっている感じ。\n', '湯船は一つ。\n']) E(p, 'sections.0.body', s, '', { ...fT, reason: '閉館した施設（大湯）の描写で、現行の海峡の湯の記述として確認できない（番台・脱衣所・湯船の数）' });
  E(p, 'sections.0.info', '共同浴場「大湯」', '共同浴場「海峡の湯」', { ...F(p, 'sections.0.info', '海峡の湯'), 値: ['海峡の湯'], reason: '閉館した施設の情報（現行の共同浴場は海峡の湯）' });
  E(p, 'sections.0.info', 'むつ市風間浦村下風呂', '下北郡風間浦村下風呂', { ...fA, 値: ['下北郡風間浦村下風呂'], 種類: '所在地', reason: '住所の誤り（風間浦村は下北郡。むつ市ではない）' });
  E(p, 'sections.1.info', 'むつ市風間浦村下風呂', '下北郡風間浦村下風呂', { ...fA, 値: ['下北郡風間浦村下風呂'], 種類: '所在地', reason: '住所の誤り（風間浦村は下北郡。むつ市ではない）' });
  E(p, 'sections.2.info', 'むつ市風間浦村下風呂', '下北郡風間浦村下風呂', { ...fA, 値: ['下北郡風間浦村下風呂'], 種類: '所在地', reason: '住所の誤り（同上）' });
  E(p, 'description', '共同浴場は料金60円で、番台に小銭を渡してのれんをくぐると、木張りの脱衣所にかごが並ぶ昭和の湯がある。大湯と新湯、2つを両方巡るのがこの温泉街の楽しみ方だ。', '共同浴場「海峡の湯」は450円で、「大湯」「新湯」2つの系統の温泉を楽しめる。', { ...fD, 値: ['海峡の湯', '450円', '「大湯」「新湯」２つの系統の温泉を楽しめます'], 種類: '料金', reason: '閉館した施設の情報（大湯・新湯は2020年閉館）。現行の海峡の湯の値に直す' });
  E(p, 'description', '東京からは約7時間32分。', '', { ...fD, 種類: '時刻', rule: 'P2', reason: '確認できず（公式に記載なし）' });
  E(p, 'description', '新青森駅からバスを利用し、冬季はスタッドレスタイヤが必要になる。', '下北駅からバスで1時間15分。', { ...fB, 値: ['JR下北駅より下北交通', '約1時間15分', '「下風呂温泉」下車'], 種類: '時刻', reason: 'アクセスの誤り（公式はJR下北駅から下北交通バスで約1時間15分。新青森駅からのバスは確認できない）' });
  E(p, 'tips', '大湯と新湯、2つの共同浴場を両方入ると満足度が上がる。', '「海峡の湯」では「大湯」「新湯」2つの系統の温泉を楽しめる。', { ...F(p, 'tips'), 値: ['「大湯」「新湯」２つの系統の温泉を楽しめます'], reason: '閉館した施設の情報（大湯・新湯は閉館。現行の海峡の湯で2系統の温泉）' });
  E(p, 'modelCourse.daytrip', '下風呂温泉「大湯」入浴', '下風呂温泉「海峡の湯」入浴', { ...F(p, 'modelCourse.daytrip', '海峡の湯'), 値: ['海峡の湯'], reason: '閉館した施設の情報（現行は海峡の湯）' });
  E(p, 'modelCourse.daytrip', '→「新湯」入浴（13:00）', '', { ...F(p, 'modelCourse.daytrip', '閉館'), reason: '閉館した施設（新湯は2020年11月30日閉館）' });
  E(p, 'modelCourse.onenight', '朝6時に共同浴場「大湯」', '朝に共同浴場「海峡の湯」', { ...F(p, 'modelCourse.onenight'), 値: ['海峡の湯'], reason: '閉館した施設の情報（現行は海峡の湯。営業は4〜10月7:00から・11〜3月8:00から。朝6時は開館前）' });
  E(p, 'sections.0.imageAlt', '大湯', '', { ...fT, rule: 'P1d', 種類: '施設名', reason: '閉館した施設名（大湯）を画像の説明から外す（新しい事実は足さない）' });
  E(p, 'spot:風呂のくらや', '江戸時代創業の酒蔵。温泉街の歴史と下北地方の醸造文化に触れ、試飲室で地酒の香りと芳醇な味わいを堪能できる。', '', { 公式の値: '（公式で確認できず）', 出典URL: [], rule: 'P2', 種類: '施設', reason: '確認できず（公式で確認できない施設の説明。欄は空になる）' }); }
// ---- 高橋・竜野 info の営業時間の行（別々の施設のブロックの行。R1の意図に沿って2行とも削除）
const R1 = { rule: 'P2', 種類: '営業時間', 公式の値: '', 値: [], 出典URL: [], snapshot: '', reason: '確認できず。公式で確認していない営業時間の行を削除（R1の対象。前回は同じ行が欄に2回あり、一意でないため見送った。別々の施設のブロックの行で、重複ではない）' };
E('takahashi', 'sections.1.info', '石火矢町2-6\n営業時間：9:00〜17:00', '石火矢町2-6', { ...R1, 削除する部分: '\n営業時間：9:00〜17:00' });
E('takahashi', 'sections.1.info', '頼久寺町18\n営業時間：9:00〜17:00', '頼久寺町18', { ...R1, 削除する部分: '\n営業時間：9:00〜17:00' });
E('tatsuno', 'sections.2.info', '1-areaインフォへ要確認\n営業時間：9:00〜17:00', '1-areaインフォへ要確認', { ...R1, 削除する部分: '\n営業時間：9:00〜17:00' });
E('tatsuno', 'sections.2.info', '■ 霞城館（三木露風資料室）\n営業時間：9:00〜17:00', '■ 霞城館（三木露風資料室）', { ...R1, 削除する部分: '\n営業時間：9:00〜17:00' });
fs.writeFileSync('scripts/data/mergeFactFixes20261118l.json', JSON.stringify({ note: '取り違えの確認による修正（神威脇温泉・丹波篠山・西山荘・喜多方・下風呂温泉）と、高橋・竜野の営業時間の行の削除（2026-11-18）', date: '2026-11-18', fixes: [{ id: 'L', topic: '取り違えの確認', result: '公式で確認', sources: [], edits }] }, null, 1));
fs.writeFileSync('logs/identity_20261118/edits_report.json', JSON.stringify({ 編集: edits.length, 規則別: edits.reduce((m, e) => ((m[e.rule] = (m[e.rule] || 0) + 1), m), {}), ページ: [...new Set(edits.map((e) => e.page))], 見送り: notes }, null, 1)); console.log(edits.length, JSON.stringify(notes));
