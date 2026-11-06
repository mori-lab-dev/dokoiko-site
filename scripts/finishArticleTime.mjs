// 記事側の所要時間の文の仕上げ（2026-11-06）。
//  1. travelTime に値がない出発地を起点にした文 22文を削除（前後は、削った文を受ける語を外す程度）。新しい数字・固有名詞は足さない
//  2. travelTime と一致している文のうち、travelTimeEstimated が付いた組と一致するものを探す（該当は 0文のため、削除なし。数は標準出力に出す）
//  3. 起点が浅草・池袋・新宿の値を使った文を「東京から」のまま残す記録（article_official_notes.json / articleTimeVerified.json に origin_station_note を足す）
//  4. JRグループ共同サイトを出典にした記録は「JRグループ共同サイト」と書き、「公式」とは書かない（記録のみ。本文は変えない）
// 使い方: node scripts/finishArticleTime.mjs [--dry]   何度流しても同じ結果になる
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';
import { classifyArticleTime } from './classifyArticleTime.mjs';

const dry = process.argv.includes('--dry');
const E = (id, loc, from, to, sentence) => ({ id, loc, from, to, sentence });
const EDITS = [
  E('uchiko', 'lead', '松山から車で40分。\nそこに、時間が止まったような町がある。', '時間が止まったような町がある。', '松山から車で40分。'),
  E('ozu', 'lead', '松山から特急で30分。\nそのわずかな距離が、時代を変える。\n', '', '松山から特急で30分。'),
  E('wakasa-obama', 'lead', '京都から特急で2時間かからない。\nなのに、着いた瞬間に', '着いた瞬間に', '京都から特急で2時間かからない。'),
  E('otsu-shiga', 'lead', '京都から電車で10分。\nなのに、人がぐっと', '人がぐっと', '京都から電車で10分。'),
  E('kusatsu-shiga', 'lead', '新幹線で京都から30分もかからないのに、\nここには観光地の喧騒がない。', 'ここには観光地の喧騒がない。', '新幹線で京都から30分もかからないのに、'),
  E('gen_北海_層雲峡温泉', 'lead', '旭川から車で約1時間半。\n気づけば山が迫ってくる。', '気づけば山が迫ってくる。', '旭川から車で約1時間半。'),
  E('gen_北海_天人峡温泉', 'lead', '旭川から車で1時間半。\n道が細くなり', '道が細くなり', '旭川から車で1時間半。'),
  E('gen_北海_水無海浜温泉', 'lead', '函館から車で約2時間、南茅部の海岸線を走ると、\n突然その光景が', '南茅部の海岸線を走ると、\n突然その光景が', '函館から車で約2時間、南茅部の海岸線を走ると、'),
  E('gen_北海_就実の丘', 'lead', '旭川から車で30分ほど走ると、\nいきなり視界が開ける。', 'いきなり視界が開ける。', '旭川から車で30分ほど走ると、'),
  E('gen_北海_トラピスト修道院', 'lead', '函館から車で40分。\n木々の間に', '木々の間に', '函館から車で40分。'),
  E('gen_北海_戸切地陣屋', 'sections.1.body', '函館からは車で30分もかからない。\nもっと早く', 'もっと早く', '函館からは車で30分もかからない。'),
  E('gen_北海_太田山神社', 'sections.1.info', 'アクセス：函館から車で約2時間30分\n　　　　　札幌から車で約3時間30分', 'アクセス：札幌から車で約3時間30分', 'アクセス：函館から車で約2時間30分'),
  E('gen_北海_長万部温泉', 'lead', '函館から特急で1時間ちょっと。\n長万部という地名', '長万部という地名', '函館から特急で1時間ちょっと。'),
  E('gen_北海_びふか温泉', 'lead', '旭川から車で約1時間半。\nたどり着いた先に', 'たどり着いた先に', '旭川から車で約1時間半。'),
  E('gen_北海_中札内美術村', 'lead', '帯広から車で30分。\nそこに、森の中に', '森の中に', '帯広から車で30分。'),
  E('gen_北海_六花の森', 'lead', '帯広から車で40分ほど走ると、突然視界が開ける。', '突然視界が開ける。', '帯広から車で40分ほど走ると、突然視界が開ける。'),
  E('gen_北海_見市温泉', 'lead', '函館から車で2時間。\n看板もほとんど', '看板もほとんど', '函館から車で2時間。'),
  E('gen_北海_オーロラ温泉', 'sections.0.body', '帯広から車で約2時間。\n途中から街灯', '途中から街灯', '帯広から車で約2時間。'),
  E('gen_北海_鹿部温泉', 'lead', '函館から車で1時間ちょっと。\n到着した瞬間', '到着した瞬間', '函館から車で1時間ちょっと。'),
  E('tonaki', 'lead', '那覇から船で2時間半。\nたどり着いた島には', '島には', '那覇から船で2時間半。'),
  E('minamidaitojima', 'lead', '那覇から飛行機で約1時間。\nなのに、降り立った瞬間、', '降り立った瞬間、', '那覇から飛行機で約1時間。'),
  E('kitadaitojima', 'lead', '那覇から飛行機で約1時間。\nなのに、降り立った瞬間に', '降り立った瞬間に', '那覇から飛行機で約1時間。'),
];

// 起点が浅草・池袋・新宿の公式値を使って「東京から」のまま残した文
const ORIGIN_STATION = {
  'chichibu': '起点は池袋駅（特急ラビュー 池袋→西武秩父）。東京駅からではない',
  'gen_栃木_湯西川温泉': '起点は浅草駅（浅草→湯西川温泉駅 約3時間）。東京駅からではない',
  'gen_栃木_佐野プレミアム・アウトレット': '起点は東京・新宿（高速バス）。東京駅からではない。鉄道は東京→佐野 最速約80分',
  'gen_栃木_日光東照宮': '起点は浅草駅（浅草→東武日光 特急約2時間）。東京駅からではない',
  'azumino': '起点は新宿駅（新宿→穂高 あずさ）。東京駅からではない',
  'nagatoro': '起点は池袋駅・上野駅（池袋→西武秩父→長瀞、上野→熊谷→長瀞）。東京駅からではない',
};
// JRグループ共同サイトを出典にした記録の、「公式」の言い換え（記録のみ）
const REWORD = [['あさま個別の公式時刻', 'あさま個別の時刻'], ['新宿起点の公式値', '新宿起点の値'], ['公式の数字は新宿起点', '出典の数字は新宿起点'], ['（水戸線）の公式時間', '（水戸線）の時間'], ['公式で確認できたのは友部まで', '出典で確認できたのは友部まで'], ['公式の東京→身延通し時間', '東京→身延の通し時間'], ['東京-静岡/甲府の公式時間', '東京-静岡/甲府の時間']];
const KIND = 'JRグループ共同サイト（JR各社の共同サイト。各社の個別の公式時刻表ではない）';

const DEST = path.join(root, 'src/data/destinations.json');
const dests = JSON.parse(fs.readFileSync(DEST, 'utf8'));
// ── 2. 見積もり(travelTimeEstimated)の組と一致している文 ──
{
  const by = new Map(dests.map((d) => [d.id, d]));
  const hits = [];
  for (const x of classifyArticleTime(dests)) for (const h of x.hits) if (h.why.startsWith('一致') && by.get(x.id).travelTimeEstimated?.[h.key]) hits.push(`${x.id} ${x.line}`);
  console.log(`travelTime と一致している文のうち、travelTimeEstimated が付いた組の文: ${hits.length}文 ${hits.length ? '\n' + hits.join('\n') : '（削除なし）'}`);
}
// ── 1. 削除 ──
const artCache = new Map();
const art = (id) => { if (!artCache.has(id)) artCache.set(id, JSON.parse(fs.readFileSync(path.join(root, 'src/data/articles', `${id}.json`), 'utf8'))); return artCache.get(id); };
let applied = 0, already = 0; const stop = [];
for (const e of EDITS) {
  const parts = e.loc.split('.');
  const holder = parts[0] === 'lead' ? art(e.id) : art(e.id).sections[Number(parts[1])];
  const key = parts[0] === 'lead' ? 'lead' : parts[2];
  const text = holder[key]; const n = text.split(e.from).length - 1;
  if (n === 1) { holder[key] = text.replace(e.from, () => e.to); applied++; }
  else if (n === 0 && (e.to === '' || text.includes(e.to))) already++;
  else stop.push(`${e.id} ${e.loc}: from が ${n} か所`);
}
console.log(`削除 ${EDITS.length}文: 適用 ${applied} / 適用済み ${already} / 止まった ${stop.length}${stop.length ? '\n' + stop.join('\n') : ''}`);
if (stop.length) process.exit(1);

// ── 3・4. 記録 ──
const NOTES = path.join(root, 'backup/travelTime_20261106/article_official_notes.json');
const VER = path.join(root, 'scripts/data/articleTimeVerified.json');
const notes = JSON.parse(fs.readFileSync(NOTES, 'utf8'));
const ver = JSON.parse(fs.readFileSync(VER, 'utf8'));
const isJr = (x) => /^https:\/\/jr-group\.jp/.test(x.source_url || '');
const reword = (s) => REWORD.reduce((t, [a, b]) => t.split(a).join(b), s);
const fixJr = (x) => {
  if (!isJr(x)) return;
  x.source_name = x.source_name.replace(/^JRグループ(?!共同サイト)/, 'JRグループ共同サイト');
  x.source_kind = KIND;
  for (const k of ['note', 'decision_reason']) if (typeof x[k] === 'string') x[k] = reword(x[k]);
};
for (const x of notes) {
  fixJr(x);
  if (ORIGIN_STATION[x.id] && x.decision !== 'delete') x.origin_station_note = ORIGIN_STATION[x.id];
}
for (const x of ver.items) { fixJr(x); if (ORIGIN_STATION[x.id]) x.origin_station_note = ORIGIN_STATION[x.id]; }
ver.note = '出典で確認できた記事側の所要時間の文。auditTravelTime は、この一覧の文を travelTime との食い違いから除く。JRグループ共同サイトを出典にしたものは「公式」とは書かず、source_kind に区別を書く（キー名 official_minutes は出典の値の意味）。起点が東京駅でないものは origin_station_note に書く';
const dn = new Map(dests.map((d) => [d.id, d.name]));
let idx = Math.max(...notes.map((x) => x.idx));
const have = new Set(notes.map((x) => `${x.id}|${x.sentence}`));
for (const e of EDITS) {
  if (have.has(`${e.id}|${e.sentence}`)) continue;
  notes.push({ idx: ++idx, id: e.id, dest: dn.get(e.id), origin: e.sentence.match(/^(?:アクセス：)?(.+?)から/)?.[1] ?? null, sentence: e.sentence, decision: 'delete', agent_verdict: null, official_minutes: null, corrected_text: null, source_name: null, source_url: null, checked: '2026-11-06', note: '出発地の travelTime に値がなく、本文の数字を確かめる基準がない', decision_reason: 'travelTime に値がない出発地の文。確認できないため削除（新しい数字・固有名詞は足していない）' });
}
console.log(`記録: 出典がJRグループ共同サイトの記録 ${notes.filter(isJr).length}件 / 起点が東京駅でない記録 ${Object.keys(ORIGIN_STATION).length}旅先 / 削除の記録を ${notes.filter((x) => x.idx > 52).length}件追加`);
if (dry) process.exit(0);
for (const [id, a] of artCache) fs.writeFileSync(path.join(root, 'src/data/articles', `${id}.json`), JSON.stringify(a, null, 2) + '\n');
fs.writeFileSync(NOTES, JSON.stringify(notes, null, 2) + '\n');
fs.writeFileSync(VER, JSON.stringify(ver, null, 2) + '\n');
console.log(`書き込み: 記事 ${artCache.size}ファイル / 記録 2ファイル`);
