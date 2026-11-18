#!/usr/bin/env node
/**
 * buildIdentityFixes20261119.mjs — 取り違え・混入の残りの修正（scripts/data/mergeFactFixes20261119a.json）（2026-11-19）。公式で確認できたものだけ。
 *   文・句の削除/置換: P1/P1d（出典URL・写しつき）／構造の削除（見どころ・節・モデルコース・欄・画像）: op つき
 *   触らないもの（報告）: 弁天台場（ページ全体が現存しない場所の内容）・金花湯（本文全体が標茶町）・座標・hub・最寄駅（独立した2源の一致が無い）・確認できずのもの
 */
import fs from 'fs';
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const R8 = (id) => J(`logs/identity_20261118/results/${id}.json`); const R9 = (id) => J(`logs/identity_20261119/results/${id}.json`);
const dests = J('src/data/destinations.json'); const byId = new Map(dests.map((d) => [d.id, d]));
const arts = new Map(); const art = (id) => { if (!arts.has(id)) arts.set(id, J(`src/data/articles/${id}.json`)); return arts.get(id); };
const DATE = '2026-11-19'; const edits = []; const notes = [];
const src = (r, 欄, sub) => { const f = r.所見.find((x) => x.欄 === 欄 && (!sub || JSON.stringify(x).includes(sub))); if (!f) throw new Error(`所見なし ${欄} ${sub}`); return { 公式の値: f.公式の事実 || '', 出典URL: f.出典URL || [], snapshot: f.snapshot || '' }; };
const grpOf = (page, group) => { const a = art(page); return group ? a.groups.find((g) => g.id === group) : a; };
const text = (page, group, path) => { if (path === 'description') return byId.get(page).description; if (path.startsWith('spot:')) return byId.get(page).spots.find((s) => s.name === path.slice(5)).description; return path.split('.').reduce((x, k) => x?.[k], grpOf(page, group)); };
const setText = (page, group, path, v) => { if (path === 'description') { byId.get(page).description = v; return; } if (path.startsWith('spot:')) { byId.get(page).spots.find((s) => s.name === path.slice(5)).description = v; return; } const ks = path.split('.'); const last = ks.pop(); ks.reduce((x, k) => x[k], grpOf(page, group))[last] = v; };
const loc = (page, group, path) => path === 'description' ? { file: 'src/data/destinations.json', dest: page, field: 'description' } : path.startsWith('spot:') ? { file: 'src/data/destinations.json', spot: [page, path.slice(5)] } : { file: `src/data/articles/${page}.json`, ...(group ? { group } : {}), field: path };
// 文・句の編集（置換・削除）
const T = (page, path, old, nw, o) => { const group = o.group; const cur = text(page, group, path); if (typeof cur !== 'string' || cur.split(old).length - 1 !== 1) { notes.push({ page, path, 理由: 'oldが欄に1回だけ無い', old: old.slice(0, 40) }); return; } setText(page, group, path, cur.replace(old, nw)); const rule = nw === '' || o.削除する部分 ? 'P1d' : 'P1'; edits.push({ page, rule, 種類: o.種類 || '所在地・施設', reason: o.reason, 公式の値: o.公式の値 || '', 値: o.値 || [], 出典URL: o.出典URL || [], snapshot: o.snapshot || '', 確認日: DATE, 旧文: old, old, new: nw, ...(o.削除する部分 ? { 削除した文: o.削除する部分, 削除する部分: o.削除する部分 } : nw === '' ? { 削除した文: old } : {}), ...loc(page, group, path) }); };
// 構造の編集
const OP = (e) => edits.push({ rule: 'P1d', 種類: '混入', 確認日: DATE, 値: [], ...e });
// ---- (a) 平川（鹿児島市の平川動物公園の混入）
{ const p = 'hirakawa'; const r = R8(p); const s1 = src(r, 'sections.1'); const sp = src(r, 'spot:平川動物公園'); const a = art(p);
  OP({ page: p, op: 'removeSection', file: `src/data/articles/${p}.json`, index: 1, title: a.sections[1].title, old: a.sections[1].title, reason: '別の場所の混入（平川動物公園は鹿児島市平川町5669-1の施設。青森県平川市に動物園は無い）', ...s1 });
  OP({ page: p, op: 'removeSpot', file: 'src/data/destinations.json', dest: p, name: '平川動物公園', old: byId.get(p).spots.find((x) => x.name === '平川動物公園').description, reason: '別の場所の混入（同上。画像・クレジットも鹿児島のもの）', ...sp });
  T(p, 'lead', '温泉に浸かって、動物と目が合って、もぎたてのりんご', '温泉に浸かって、もぎたてのりんご', { ...s1, 削除する部分: '動物と目が合って、', reason: '別の場所の混入（鹿児島市の動物園の記述）' });
  T(p, 'modelCourse.daytrip', '平川動物公園 → 市内でランチ', '市内でランチ', { ...s1, 削除する部分: '平川動物公園 → ', reason: '別の場所の混入（行程から鹿児島市の動物園を除く）' });
  T(p, 'modelCourse.onenight', '【2日目】平川動物公園 → 温泉で一汗', '【2日目】温泉で一汗', { ...s1, 削除する部分: '平川動物公園 → ', reason: '別の場所の混入（行程から鹿児島市の動物園を除く）' }); }
// ---- (b) 神威脇温泉（奥尻島）: モデルコース2本・bestSeason は積丹の内容
{ const p = 'gen_北海_神威脇温泉'; const r = R8(p); const a = art(p);
  OP({ page: p, op: 'removeModelCourseKey', file: `src/data/articles/${p}.json`, key: 'daytrip', old: a.modelCourse.daytrip, reason: '別の場所の混入（札幌発・余市・積丹の行程。実際は奥尻島で、フェリー（江差）か空路）', ...src(r, 'modelCourse.daytrip') });
  OP({ page: p, op: 'removeModelCourseKey', file: `src/data/articles/${p}.json`, key: 'onenight', old: a.modelCourse.onenight, reason: '別の場所の混入（小樽・余市・積丹の行程）', ...src(r, 'modelCourse.onenight') });
  OP({ page: p, op: 'removeField', file: `src/data/articles/${p}.json`, field: 'bestSeason', old: a.bestSeason, reason: '別の場所の混入（積丹ブルーとウニの記述）', ...src(r, 'bestSeason') }); }
// ---- (c) 西山荘（大子町側の月居山）
{ const p = 'gen_茨城_西山荘'; const r = R9('gen_茨城_西山荘_spots'); const s = src(r, 'spot:月居山ハイキングコース');
  OP({ page: p, op: 'removeSpot', file: 'src/data/destinations.json', dest: p, name: '月居山ハイキングコース', old: byId.get(p).spots.find((x) => x.name === '月居山ハイキングコース').description, reason: '別の場所の混入（月居山は久慈郡大子町の山。西山荘は常陸太田市）', ...s });
  T(p, 'description', '周辺には月居山ハイキングコースがあり、標高433mの尾根道から那珂川や筑波山系の眺望を一望できる。', '', { ...s, reason: '別の場所の混入（月居山は大子町。標高も公式は404mで433mと合わない）' }); }
// ---- (d) 喜多方蔵座敷美術館の画像（Read で開いて確認: 喜多方駅の駅舎の写真）
{ const p = 'kitakata'; edits.push({ page: p, rule: 'IMG', 種類: '画像', op: 'removeSpotImage', file: 'src/data/destinations.json', dest: p, name: '喜多方蔵座敷美術館', localImage: '/images/kitakata/spot-2.jpg', old: byId.get(p).spots.find((x) => x.name === '喜多方蔵座敷美術館').imageUrl, reason: '画像が見どころと合わない（public/images/kitakata/spot-2.jpg を開いて確認: 喜多方駅の駅舎の写真。元のファイル名は Kitakata_ramen…）。外す（差し替えは探さない）', 確認日: DATE, 値: [], 出典URL: [] }); }
// ---- (e) 下風呂温泉: 北の防波堤ドーム（稚内市）
{ const p = 'gen_青森_下風呂温泉'; const r = R8(p); OP({ page: p, op: 'removeSpot', file: 'src/data/destinations.json', dest: p, name: '北の防波堤ドーム', old: byId.get(p).spots.find((x) => x.name === '北の防波堤ドーム').description, reason: '別の場所の混入（北防波堤ドームは北海道稚内市の施設）', ...src(r, 'spot:北の防波堤ドーム') }); }
// ---- (f) 濁川温泉・チキウ岬・島原・阿波連園地
{ const p = 'gen_北海_濁川温泉'; const r = R9(p);
  T(p, 'description', '周辺には標高約1,000mの高層湿原・雨竜沼湿原があり、季節ごとに表情が変わる。', '', { ...src(r, 'description'), reason: '別の場所の混入（雨竜沼湿原は雨竜町。標高も公式は850〜900m）' });
  OP({ page: p, op: 'removeSpot', file: 'src/data/destinations.json', dest: p, name: '雨竜沼湿原', old: byId.get(p).spots.find((x) => x.name === '雨竜沼湿原').description, reason: '別の場所の混入（雨竜町の湿原）', ...src(r, 'spot:雨竜沼湿原') }); }
{ const p = 'gen_北海_チキウ岬'; const r = R9(p); for (const n of ['利尻島', '礼文島']) OP({ page: p, op: 'removeSpot', file: 'src/data/destinations.json', dest: p, name: n, old: byId.get(p).spots.find((x) => x.name === n).description, reason: `別の場所の混入（${n}は稚内の西。室蘭のチキウ岬のページの見どころではない）`, ...src(r, `spot:${n}`) }); }
{ const p = 'shimabara'; const r = R9(p);
  T(p, 'sections.2.body', 'ロープウェイで山頂まで上がれる。\n所要時間は約4分。\n', '', { ...src(r, 'sections.2.body'), reason: '施設の混同（眉山ロープウェイは徳島市。島原市の眉山にロープウェイは無い）' });
  T(p, 'sections.2.info', '■ 眉山ロープウェイ\n住所：長崎県島原市片山町537', '', { ...src(r, 'sections.2.info'), reason: '施設の混同（同上。住所も公式で確認できない）' });
  T(p, 'modelCourse.daytrip', '眉山ロープウェイ→', '', { ...src(r, 'modelCourse.daytrip'), reason: '施設の混同（同上）' }); }
{ const p = 'tokashiki-jima'; const r = R9(p); const s = src(r, 'spot:阿波連園地');
  T(p, 'spot:阿波連園地', '無人島に位置する園地で、', '沖縄海岸国定公園の園地で、', { ...s, 値: ['沖縄海岸国定公園', '阿波連園地'], reason: '所在地の誤り（阿波連園地は有人の渡嘉敷島にある沖縄海岸国定公園の園地。無人島ではない）' });
  T(p, 'sections.1.body', '無人島に位置する園地で、', '沖縄海岸国定公園の園地で、', { ...s, group: 'aharen', 値: ['沖縄海岸国定公園'], reason: '所在地の誤り（同上）' }); }
fs.writeFileSync('scripts/data/mergeFactFixes20261119a.json', JSON.stringify({ note: '取り違え・混入の残りの修正（2026-11-19）', date: '2026-11-19', fixes: [{ id: 'A', topic: '取り違え・混入', result: '公式で確認', sources: [], edits }] }, null, 1));
fs.writeFileSync('logs/identity_20261119/edits_report.json', JSON.stringify({ 編集: edits.length, 構造の編集: edits.filter((e) => e.op).length, ページ: [...new Set(edits.map((e) => e.page))], 見送り: notes }, null, 1)); console.log(edits.length, JSON.stringify(notes));
