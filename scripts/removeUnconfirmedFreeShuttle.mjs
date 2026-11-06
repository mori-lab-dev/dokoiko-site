// 公式で確認できない送迎の「無料」を外す（2026-11-06）。
// 対象: 前回の点検で公式を確認できずに触らなかった宿（backup/stay_shuttle_20261106/untouched.json）のうち、「無料」を含む送迎の文があるもの。
// 入力: backup/stay_free_20261106/stay_free_check.json（宿ごとに公式サイトを探し直して読んだ記録）、targets.json（「無料」を含む文の一覧）
// 規則:
//   A 公式で送迎に「無料」と確認できた宿 → そのまま残す
//   B 公式の送迎ページを読めたが「無料」の記載がない宿 → 「無料」を外し、送迎は公式の記載に合わせる（公式が「送迎なし」「宿専用の送迎の記載なし」なら送迎の文ごと消す）
//   C 公式を読めない／送迎の記載を読めない宿 → 送迎の文ごと消す（hasShuttle=false）。「送迎あり」だけ残してよいのは公式にそう書いてあるときだけ
// 本文の文は、前後がつながる最小限だけ直す。新しい数字・固有名詞は足さない。宿とは別の施設（スキー場など）のシャトルの文は対象外。
// 出力: backup/stay_free_20261106/{before_after.json,kept.json}、scripts/data/stayShuttleChecked.json の更新
// 使い方: node scripts/removeUnconfirmedFreeShuttle.mjs [--dry]   何度流しても同じ結果になる
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';
import { checkDesc } from './descStyleCheck.mjs';

const dry = process.argv.includes('--dry');
const OUT = path.join(root, 'backup/stay_free_20261106');
const rows = JSON.parse(fs.readFileSync(path.join(OUT, 'stay_free_check.json'), 'utf8'));
const byName = new Map(rows.map((r) => [r.name, r]));
const targets = JSON.parse(fs.readFileSync(path.join(OUT, 'targets.json'), 'utf8')).filter((t) => byName.has(t.stay));
const FILE = path.join(root, 'src/data/destinations.json');
const dests = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));
const norm = (s) => s.replace(/\(/g, '（').replace(/\)/g, '）');
// B の宿のうち、公式の記載から作った文を使わず人が決めたもの
const OVERRIDE = new Map([
  ['ザ レイクビュー TOYA 乃の風リゾート', '札幌駅北口・新千歳空港から送迎バスあり（3日前までに要予約・料金は公式サイトで確認）'],
]);
const REMOVE_B = new Set(['十勝川温泉第一ホテル']); // 公式に宿専用の送迎の記載なし（帯広駅からは路線バス）
const catOf = (r) => (r.status === 'verified' && r.free_word_on_official === true ? 'A' : r.status === 'verified' ? 'B' : 'C');

const log = [], kept = [];
// ── 1. featured_stay の送迎 ──
for (const t of targets) {
  const r = byName.get(t.stay), d = byId.get(t.destId), f = d.featured_stay; if (!f) continue;
  const c = catOf(r);
  if (c === 'A') { kept.push({ destId: d.id, stay: t.stay, official_url: r.official_url, access_page_url: r.access_page_url, quote: r.quote }); continue; }
  if (!f.shuttleInfo && !f.hasShuttle) continue;
  const before = { shuttleInfo: f.shuttleInfo ?? null, hasShuttle: !!f.hasShuttle };
  let after;
  if (c === 'C' || REMOVE_B.has(t.stay)) after = { shuttleInfo: null, hasShuttle: false };
  else { const s = OVERRIDE.get(t.stay) ?? norm(r.proposed_shuttleInfo || ''); if (!s || /無料/.test(s)) throw new Error(`${t.stay}: 掲載用の文を作れない`); after = { shuttleInfo: s, hasShuttle: true }; }
  if (before.shuttleInfo === after.shuttleInfo && before.hasShuttle === after.hasShuttle) continue;
  if (after.shuttleInfo) f.shuttleInfo = after.shuttleInfo; else delete f.shuttleInfo; f.hasShuttle = after.hasShuttle;
  log.push({ destId: d.id, dest: d.name, stay: t.stay, field: 'featured_stay.shuttleInfo', category: c, before: before.shuttleInfo, after: after.shuttleInfo, reason: reasonOf(r, c, t.stay) });
}
function reasonOf(r, c, name) {
  if (c === 'C') return { official_unreachable: '公式サイトが開けず（403・メンテナンス中など）確認できない', no_shuttle_info_on_official: '公式サイトを読めたが、送迎の記載を読めなかった' }[r.status] || r.status;
  if (REMOVE_B.has(name)) return '公式に宿専用の送迎の記載なし（帯広駅からは路線バス）';
  return '公式の送迎の記載に「無料」の語がない（' + (r.price_text_official || '料金の記載なし') + '）';
}

// ── 2. 本文の文（旅先の description・メタ・記事の info）──
const E = (id, field, from, to, stay, cat, exempt = false) => ({ id, field, from, to, stay, cat, exempt });
const EDITS = [
  E('hanamaki', 'description', '新花巻駅・花巻駅からの無料送迎バスがあり、前日までの予約が必要だ。', '新花巻駅・花巻駅からの送迎バスがあり、予約が必要だ。', '大沢温泉 湯治屋', 'B'),
  E('hanamaki', 'article.sections.1.info', 'または無料送迎バスあり（要確認）', 'または送迎バスあり（要確認）', '大沢温泉 湯治屋', 'B'),
  E('gen_北海_十勝川温泉', 'description', '帯広駅からは十勝川温泉第一ホテルの無料送迎シャトルを利用でき、前日17時までの予約が必要だ。', '', '十勝川温泉第一ホテル', 'B', true),   // 文を消すと数値が1つになる。数字を作らないため、数値の条件を外す一覧に入れる
  E('gen_北海_洞爺湖温泉', 'description', '札幌駅から送迎バスが出ており、宿泊予約者は無料で利用できる。', '札幌駅から送迎バスが出ている。', 'ザ レイクビュー TOYA 乃の風リゾート', 'B'),
  E('nachikatsuura', 'description', '勝浦港の桟橋から無料の送迎船が約5分。', '勝浦港の桟橋から送迎船が約5分。', '碧き島の宿 熊野別邸 中の島', 'B'),
  E('shonai', 'description', '宿の選択肢に迷うなら、鶴岡駅から無料送迎のある湯田川温泉 九兵衛旅館が便利だ。', '宿の選択肢に迷うなら、湯田川温泉 九兵衛旅館が便利だ。', '湯田川温泉 九兵衛旅館', 'C'),
  E('iwakuni', 'description', 'JR岩国駅からの無料送迎もある（前日15時までに要予約）。', '', '錦帯橋温泉 岩国国際観光ホテル', 'C'),
  E('hakuba', 'description', '八方尾根の麓に立ち、白馬駅・八方バスターミナルから無料送迎（要連絡）がある。', '八方尾根の麓に立つ。', '白馬八方温泉 しろうま荘', 'C'),
  E('ozu', 'description', '伊予大洲駅からの無料送迎がある（要予約）。', '伊予大洲駅からの送迎がある（前日までに要連絡）。', 'NIPPONIA HOTEL 大洲 城下町', 'B'),
  E('isawa-onsen', 'description', '石和温泉駅北口から無料送迎がある。', '電車で来る場合は宿の車で迎えてもらえる（要申し出）。', '銘石の宿 かげつ', 'B'),
  E('yamanakako', 'description', '湖畔バス停から無料送迎がある。', '湖畔バス停から送迎がある。', 'ホテルマウント富士', 'B'),
  E('takayama-2', 'description', '高山駅から無料送迎がある。', '高山駅から送迎がある。', '本陣平野屋 花兆庵', 'B'),
  E('yufuin-2', 'description', '金鱗湖畔一万坪の敷地に立つ宿で、由布院駅から無料送迎あり（10〜16時・要予約）。', '金鱗湖畔一万坪の敷地に立つ宿である。', '亀の井別荘', 'C'),
  E('minami-izu', 'description', '伊豆急下田駅から無料送迎バスで約20分。', '伊豆急下田駅からシャトルバスで約20分。', '南伊豆弓ヶ浜温泉 季一遊', 'B'),
  E('urabandai', 'description', '猪苗代駅からバスで五色沼入口へアクセスでき、裏磐梯高原ホテルは猪苗代駅から無料送迎バスも運行している（前日までに要予約）。', '猪苗代駅からバスで五色沼入口へアクセスできる。', '裏磐梯高原ホテル', 'C'),
  E('urabandai', 'seo.description', '猪苗代駅からバスで五色沼入口へアクセスでき、裏磐梯高原ホテルは猪苗代駅から無料送迎バスも運行している（前日までに要予約）。', '猪苗代駅からバスで五色沼入口へアクセスできる。', '裏磐梯高原ホテル', 'C'),
];
const ART = path.join(root, 'src/data/articles'); const artCache = new Map();
const art = (id) => { if (!artCache.has(id)) artCache.set(id, JSON.parse(fs.readFileSync(path.join(ART, `${id}.json`), 'utf8'))); return artCache.get(id); };
function holder(e) {
  const d = byId.get(e.id);
  if (e.field === 'description') return [d, 'description'];
  if (e.field === 'seo.description') return [d.seo, 'description'];
  const m = e.field.match(/^article\.sections\.(\d+)\.(\w+)$/); return [art(e.id).sections[+m[1]], m[2]];
}
let applied = 0, already = 0; const stop = [], broke = [];
for (const e of EDITS) {
  const [h, k] = holder(e); const text = h[k] || '';
  const n = text.split(e.from).length - 1;
  if (n === 1) {
    const next = text.replace(e.from, () => e.to);
    if (e.field === 'description' && !e.exempt) { const r0 = checkDesc(text, e.id), r = checkDesc(next, e.id); if (r0.ok && !r.ok) { broke.push(`${e.id}: ${r.issues.join(' / ')}`); continue; } }
    h[k] = next; applied++;
    log.push({ destId: e.id, dest: byId.get(e.id).name, stay: e.stay, field: e.field, category: e.cat, before: e.from, after: e.to || '(文ごと削除)', reason: e.cat === 'C' ? '公式で送迎を確認できない' : '公式の送迎の記載に「無料」の語がない' });
  } else if (n === 0 && (e.to === '' || text.includes(e.to))) already++;
  else stop.push(`${e.id} ${e.field}: from が ${n} か所`);
}
// 送迎の文を消して数値が足りなくなった description は、数字を作らないため数値の条件を外す一覧へ（descStyleCheck が読む）
const trimFile = path.join(root, 'scripts/data/descTimeTrimmed.json');
const trim = JSON.parse(fs.readFileSync(trimFile, 'utf8'));
const addIds = EDITS.filter((e) => e.exempt).map((e) => e.id).filter((id) => !trim.ids.includes(id));
if (addIds.length) { trim.ids = [...trim.ids, ...addIds].sort(); trim.note = '所要時間または宿の送迎の文を削除した description。descStyleCheck は数値・字数・短文の条件を、この一覧には適用しない（数字を作らないため）'; }
// 確認の記録（監査用）
const rec = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/stayShuttleChecked.json'), 'utf8'));
for (const r of rows) rec.stays[r.name] = { status: r.status, free_on_official: r.free_word_on_official, official_url: r.official_url, access_page_url: r.access_page_url, shuttle: r.shuttle, checked: '2026-11-06' };
const cnt = { A: 0, B: 0, C: 0 }; for (const r of rows) cnt[catOf(r)]++;
console.log(`宿 ${rows.length}軒: 公式で「無料」を確認して残す ${cnt.A} / 公式に「無料」の記載なし（無料を外す・公式に合わせる） ${cnt.B} / 公式で確認できず（送迎の文ごと消す） ${cnt.C}`);
console.log(`送迎の文の変更 ${log.length}件（featured_stay ${log.filter((l) => l.field.startsWith('featured')).length} / 本文 ${log.filter((l) => !l.field.startsWith('featured')).length}）。本文の編集: 適用 ${applied} / 適用済み ${already} / 止まった ${stop.length} / 基準に落ちる ${broke.length}`);
for (const s of [...stop, ...broke]) console.log('  ' + s);
if (stop.length || broke.length) process.exit(1);
if (dry) process.exit(0);
fs.writeFileSync(FILE, JSON.stringify(dests, null, 2) + '\n');
for (const [id, a] of artCache) fs.writeFileSync(path.join(ART, `${id}.json`), JSON.stringify(a, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'scripts/data/stayShuttleChecked.json'), JSON.stringify(rec, null, 2) + '\n');
fs.writeFileSync(trimFile, JSON.stringify(trim, null, 2) + '\n');
const beforeAfterFile = path.join(OUT, 'before_after.json');
const prev = fs.existsSync(beforeAfterFile) ? JSON.parse(fs.readFileSync(beforeAfterFile, 'utf8')) : [];
const keyOf = (l) => `${l.destId}|${l.field}|${l.before}`; const have = new Set(prev.map(keyOf));
fs.writeFileSync(beforeAfterFile, JSON.stringify([...prev, ...log.filter((l) => !have.has(keyOf(l)))], null, 2) + '\n');
fs.writeFileSync(path.join(OUT, 'kept.json'), JSON.stringify(kept, null, 2) + '\n');
console.log('書き込み完了');
