#!/usr/bin/env node
/**
 * auditContamination2.mjs — 「他destinationデータ総取り替え混入」の第2次監査。
 * 前回（座標・prefecture・宿リンク）で見なかった項目を検査する。
 *
 *  A. hotelArea が prefecture と別の県を指す
 *  B. railProvider が prefecture のJR会社エリアと矛盾
 *  C. railGateway 等の駅が別県のdestinationと同名かつ遠い
 *  D. spots[].googleMapsQuery の「○○県」が prefecture と不一致
 *  E. spots[].imageUrl / images が別destinationのIDを参照
 *  F. imageCredit.url を複数destinationが共有（コピペ疑い）
 *  G. stayDescription / catch / tags に遠方の別destination名
 *  H. 本文中の河川・湖・山などの固有名詞が、その県を流れない/存在しない
 *
 * 修正は行わず検出のみ。前回対応済みの16件は除外する。
 *
 * 【2026-10-13 精度向上】147件の内訳を実物で確認したところ、本物の混入は2件だけだった。誤検出の型を除いた。
 *   B  railProvider は src のどこからも参照されない項目で、県ごとに決まる値でもない（hub が東京でも e5489 が32件）→ 対象外
 *   A  「長野県・岐阜県」のような複数県の表記は、どれかに一致すればよい。五箇山の宿検索=高山は設計どおり（INTENDED_A）
 *   C  hubStation は「出発駅」の表記で、拠点の県とは別の場所を指すのが正常 → 対象外（railGateway・accessStation は従来どおり）
 *   G  その destination 自身の本文・スポットにも出てくる名前（糸島の夫婦岩・摩周湖の川湯温泉）は同名の別地ではない → 除外
 *   H  語の境界で判定（仁淀川・大淀川を「淀川」と誤読しない）。那珂川(福岡)・吉野川(奈良)・天竜川(愛知)の流域を追加
 */
import fs from 'fs';
import path from 'path';

const D = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const byName = new Map(D.map(d => [d.name, d]));
const nameCount = D.reduce((a, d) => { a[d.name] = (a[d.name] || 0) + 1; return a; }, {});
const FIXED = new Set(['ubayu-onsen', 'niche_群馬_1', 'hida-furukawa', 'niche_福岡_6', 'niche_福岡_7',
  'niche_石川_1', 'niche_愛知_5', 'niche_長崎_3', 'akakura-onsen', 'misaki-kochi', 'matsuba-gani',
  'mishima-yamaguchi', 'nushima', 'hiburi', 'ohara', 'ohara-2', 'kinosaki-onsen', 'oarai', 'matsusaka']);

const km = (a, b) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 111 * Math.cos(a.lat * Math.PI / 180));
const mentions = (d, s) => [d.description, d.catch, d.name, JSON.stringify(d.spots || []), d.city].filter(Boolean).join(' ').includes(s);
const okNames = (d) => new Set([d.name, d.hub, d.hubName, d.accessHub, d.city, d.fallbackCity, d.hubCity, d.prefecture].filter(Boolean));

/* 都道府県: ローマ字 / 漢字（「県」有無）→ 正式名 */
const PREFS = [['hokkaido','北海道'],['aomori','青森県'],['iwate','岩手県'],['miyagi','宮城県'],['akita','秋田県'],
  ['yamagata','山形県'],['fukushima','福島県'],['ibaraki','茨城県'],['tochigi','栃木県'],['gunma','群馬県'],
  ['saitama','埼玉県'],['chiba','千葉県'],['tokyo','東京都'],['kanagawa','神奈川県'],['niigata','新潟県'],
  ['toyama','富山県'],['ishikawa','石川県'],['fukui','福井県'],['yamanashi','山梨県'],['nagano','長野県'],
  ['gifu','岐阜県'],['shizuoka','静岡県'],['aichi','愛知県'],['mie','三重県'],['shiga','滋賀県'],
  ['kyoto','京都府'],['osaka','大阪府'],['hyogo','兵庫県'],['nara','奈良県'],['wakayama','和歌山県'],
  ['tottori','鳥取県'],['shimane','島根県'],['okayama','岡山県'],['hiroshima','広島県'],['yamaguchi','山口県'],
  ['tokushima','徳島県'],['kagawa','香川県'],['ehime','愛媛県'],['kochi','高知県'],['fukuoka','福岡県'],
  ['saga','佐賀県'],['nagasaki','長崎県'],['kumamoto','熊本県'],['oita','大分県'],['miyazaki','宮崎県'],
  ['kagoshima','鹿児島県'],['okinawa','沖縄県']];
const AREA2PREF = new Map();
for (const [r, k] of PREFS) { AREA2PREF.set(r, k); AREA2PREF.set(k, k); AREA2PREF.set(k.replace(/[都道府県]$/, ''), k); }
/* 市区町村・地域名の hotelArea → 県 */
for (const [a, p] of [['sapporo','北海道'],['hirosaki','青森県'],['hachinohe','青森県'],['maebashi','群馬県'],
  ['tsumagoi','群馬県'],['tokamachi','新潟県'],['kanazawa','石川県'],['kofu','山梨県'],['nagahama','滋賀県'],
  ['kobe','兵庫県'],['yokohama','神奈川県'],['matsue','島根県'],['oda','島根県'],['ozu','愛媛県'],
  ['tosa-shimizu','高知県'],['kagawa-takamatsu','香川県'],['hiketa','香川県'],['wakimachi','徳島県'],
  ['kitakyushu','福岡県'],['yame','福岡県'],['takatori','奈良県'],['arimatsu','愛知県'],['asuke','愛知県'],
  ['seki-juku','三重県'],['unno-juku','長野県']]) AREA2PREF.set(a, p);
const REGION_AREA = new Set(['kyushu', 'tohoku']);   // 地域名は判定対象外

/* JR会社エリア（railProvider の妥当性）*/
const JR_EAST = new Set(['青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','長野県','山梨県']);
const JR_WEST = new Set(['富山県','石川県','福井県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県']);
const JR_KYUSHU = new Set(['福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県']);
/* 東海・四国・北海道・沖縄は ekinet/e5489 どちらも運用され得るため判定しない */

/* 主要河川・湖沼が流れる県（本文の地理的矛盾検出用） */
const GEO_FEATURES = [
  ['利根川', ['群馬県','栃木県','茨城県','埼玉県','千葉県','東京都']],
  ['信濃川', ['新潟県','長野県']], ['千曲川', ['長野県']],
  ['最上川', ['山形県']], ['北上川', ['岩手県','宮城県']], ['阿武隈川', ['福島県','宮城県']],
  ['木曽川', ['長野県','岐阜県','愛知県','三重県']], ['長良川', ['岐阜県','三重県']],
  ['天竜川', ['長野県','静岡県','愛知県']], ['富士川', ['山梨県','静岡県']],
  ['淀川', ['京都府','大阪府','滋賀県']], ['熊野川', ['奈良県','三重県','和歌山県']],
  ['吉野川', ['徳島県','高知県','愛媛県','奈良県']], ['四万十川', ['高知県']], ['仁淀川', ['高知県','愛媛県']],
  ['筑後川', ['福岡県','佐賀県','大分県','熊本県']], ['球磨川', ['熊本県']],
  ['太田川', ['広島県']], ['江の川', ['広島県','島根県']], ['斐伊川', ['島根県']],
  ['渡良瀬川', ['群馬県','栃木県','茨城県','埼玉県']], ['那珂川', ['栃木県','茨城県','福岡県']],
  ['琵琶湖', ['滋賀県']], ['霞ヶ浦', ['茨城県']], ['猪苗代湖', ['福島県']], ['十和田湖', ['青森県','秋田県']],
  ['大村湾', ['長崎県']], ['有明海', ['福岡県','佐賀県','長崎県','熊本県']], ['瀬戸内海', ['兵庫県','岡山県','広島県','山口県','香川県','愛媛県','徳島県','大阪府']],
];

// 都道府県の完全名で照合する（「..県」だと神奈川県→奈川県のように誤検出する）
const PREF_RE = new RegExp('(' + PREFS.map(([, k]) => k).join('|') + ')');

/** 宿の検索地域を隣県の宿場にしているのが設計どおりのもの（五箇山は宿が少なく、高山・白川郷の宿を案内する） */
const INTENDED_A = new Set(['gokayama']);
/** 登録されていない同名の別地（北海道の川湯温泉＝弟子屈）を、登録済みの遠方の同名地（和歌山の川湯温泉）と取り違えているもの。id → 語 */
const INTENDED_G = new Map([['mashu-ko', '川湯温泉']]);

const hits = new Map();
const flag = (d, cat, detail) => {
  if (FIXED.has(d.id)) return;
  if (!hits.has(d.id)) hits.set(d.id, { d, items: [] });
  hits.get(d.id).items.push({ cat, detail });
};

for (const d of D) {
  /* A. hotelArea */
  if (d.hotelArea && d.prefecture && !REGION_AREA.has(d.hotelArea)) {
    const p = AREA2PREF.get(String(d.hotelArea).toLowerCase()) || AREA2PREF.get(String(d.hotelArea));
    const declared = d.prefecture.split(/[・、,]/).map((x) => x.trim());
    if (p && !declared.includes(p) && !INTENDED_A.has(d.id)) flag(d, 'A:hotelArea', `hotelArea=${d.hotelArea}（${p}）だが prefecture=${d.prefecture}`);
  }
  /* B. railProvider — 2026-10-13 に対象外（未使用の項目。検出ルールも粗く、100件がすべてノイズだった） */
  if (false && d.railProvider && d.prefecture) {
    const p = d.prefecture, rp = d.railProvider;
    const bad = (rp === 'jrkyushu' && !JR_KYUSHU.has(p))
      || (rp === 'ekinet' && (JR_WEST.has(p) || JR_KYUSHU.has(p)))
      || (rp === 'e5489' && (JR_EAST.has(p) || JR_KYUSHU.has(p)));
    if (bad) flag(d, 'B:railProvider', `railProvider=${rp} だが prefecture=${p}`);
  }
  /* C. 駅名が別県の遠方destinationと同名 */
  if (typeof d.lat === 'number') {
    for (const [f, raw] of [['railGateway', d.railGateway], ['accessStation', d.accessStation]]) {   // hubStation は出発駅の表記なので対象外（2026-10-13）
      if (!raw) continue;
      const base = String(raw).replace(/駅$/, '');
      if (nameCount[base] !== 1) continue;
      const o = byName.get(base);
      if (!o || typeof o.lat !== 'number') continue;
      if (okNames(d).has(base) || mentions(d, base)) continue;
      if (o.prefecture && o.prefecture !== d.prefecture && km(d, o) > 60)
        flag(d, 'C:駅', `${f}=${raw} → 「${base}」は${o.prefecture}・${Math.round(km(d, o))}km`);
    }
  }
  /* D. spots の googleMapsQuery の県名 */
  for (const s of (d.spots || [])) {
    const q = String(s.googleMapsQuery || '');
    const m = q.match(PREF_RE);
    if (m && d.prefecture && m[1] !== d.prefecture)
      flag(d, 'D:spots県', `spots「${s.name}」の googleMapsQuery に「${m[1]}」（prefecture=${d.prefecture}）`);
  }
  /* E. 画像パスが別ID */
  const idOf = (p) => {
    const m = String(p).match(/^\/images\/(?:spots\/)?([^/]+)\//);
    return m ? m[1] : null;
  };
  for (const p of (d.images || [])) {
    const i = idOf(p);
    if (i && i !== d.id) { flag(d, 'E:画像', `images に別IDのパス ${p}`); break; }
  }
  for (const s of (d.spots || [])) {
    const i = idOf(s.imageUrl || '');
    if (i && i !== d.id) { flag(d, 'E:画像', `spots「${s.name}」の imageUrl が別ID ${s.imageUrl}`); break; }
  }
  /* G. stayDescription / catch / tags の遠方地名 */
  if (typeof d.lat === 'number') {
    const texts = [['stayDescription', d.stayDescription], ['catch', d.catch], ['tags', (d.tags || []).join(' ')]];
    for (const [f, t] of texts) {
      if (!t) continue;
      for (const o of D) {
        if (o.name === d.name || o.name.length < 3 || nameCount[o.name] !== 1 || typeof o.lat !== 'number') continue;
        if (!t.includes(o.name) || okNames(d).has(o.name)) continue;
        if (mentions(d, o.name) || INTENDED_G.get(d.id) === o.name) continue;   // 自分の本文・スポットにも出る名前は、同名の別地ではない（2026-10-13）
        if (o.prefecture !== d.prefecture && km(d, o) > 80)
          flag(d, 'G:テキスト', `${f} に「${o.name}」（${o.prefecture}・${Math.round(km(d, o))}km）`);
      }
    }
  }
  /* H. 河川・湖沼の地理的矛盾 */
  const prose = [d.description, d.catch, d.stayDescription, (d.tags || []).join(' ')].filter(Boolean).join(' ');
  for (const [feat, prefs] of GEO_FEATURES) {
    const declaredH = (d.prefecture || '').split(/[・、,]/).map((x) => x.trim());
    // 語の境界: 直前が漢字・カタカナなら別の語の一部（仁淀川・大淀川の「淀川」）。2026-10-13
    const hasFeat = new RegExp('(?<![一-龥ァ-ヶ])' + feat).test(prose);
    if (hasFeat && d.prefecture && !declaredH.some((x) => prefs.includes(x)))
      flag(d, 'H:地理矛盾', `本文に「${feat}」（${prefs.join('/')}）だが prefecture=${d.prefecture}`);
  }
}

/* F. imageCredit.url の共有 */
const credit = new Map();
for (const d of D) {
  const u = d.imageCredit?.url; if (!u) continue;
  if (!credit.has(u)) credit.set(u, []);
  credit.get(u).push(d);
}
for (const [u, list] of credit) {
  if (list.length < 2) continue;
  for (const d of list) flag(d, 'F:credit共有', `imageCredit.url を${list.length}件で共有（${list.map(x => x.name).join(' / ')}）`);
}

/* 出力 */
const rows = [...hits.values()].map(h => ({ ...h, cats: [...new Set(h.items.map(i => i.cat))] }))
  .sort((a, b) => b.cats.length - a.cats.length || b.items.length - a.items.length);
const catCount = {};
for (const r of rows) for (const c of r.cats) catCount[c] = (catCount[c] || 0) + 1;
console.log(`\n${'═'.repeat(74)}`);
console.log(`総destination ${D.length} 件（対応済み${FIXED.size}件を除外） / 新規検出 ${rows.length}件`);
console.log(`項目別: ${Object.entries(catCount).sort().map(([k, v]) => `${k}=${v}`).join(' / ')}`);
console.log(`${'═'.repeat(74)}\n`);
for (const [n, r] of rows.slice(0, 40).entries()) {
  console.log(`${String(n + 1).padStart(2)}. [${r.d.id}] ${r.d.name}（${r.d.prefecture ?? '-'}） — ${r.cats.length}項目`);
  for (const it of r.items.slice(0, 5)) console.log(`      ${it.cat} ${it.detail}`);
  if (r.items.length > 5) console.log(`      … ほか${r.items.length - 5}件`);
}
if (rows.length > 40) console.log(`\n… ほか ${rows.length - 40}件`);
fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync('logs/contamination_audit2.json', JSON.stringify(rows.map(r => ({ id: r.d.id, name: r.d.name, prefecture: r.d.prefecture, cats: r.cats, items: r.items })), null, 2));
