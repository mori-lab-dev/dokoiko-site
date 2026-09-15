#!/usr/bin/env node
/**
 * auditArticleAddresses.mjs — 記事（articles/*.json）に書かれた住所が、
 * その旅先の実際の所在市町村と合っているかを全件見る。
 *
 * destination の spots を直していて気づいたが、ページに実際に出ているのは
 * articles/*.json の sections のほうで、spots ではない。しかも記事の info 欄には
 * 住所・電話番号・料金・営業時間という、読んだ人がそのまま動く情報が書いてある。
 * そこが間違っていると実害が出る。
 *
 *   塩別温泉      住所「北海道上川郡上川町塩別番外地」／TEL 01658-2-3741
 *                 実際の塩別つるつる温泉は北見市留辺蘂町で、市外局番も違う
 *   神居岩温泉    住所「北海道雨竜郡沼田町」。実際は留萌市
 *   神威脇温泉    住所「北海道積丹郡積丹町神威脇町」。実際は奥尻町
 *   与路島        住所「鹿児島県大島郡与論町」。与路島は瀬戸内町
 *
 * 記事に出てくる都道府県名・市区町村名を拾い、旅先の座標から引いた
 * 実際の市町村と突き合わせる。県が違うもの、市区町村が違うものを一覧にする。
 *
 * usage: node scripts/auditArticleAddresses.mjs
 */
import fs from 'fs';
import path from 'path';

const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));
const DIR = 'src/data/articles';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));

/** 記事の全文から「住所：…」の行を拾う */
function addresses(article) {
  const texts = [];
  const walk = (v) => {
    if (typeof v === 'string') texts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(article);
  const out = [];
  for (const t of texts) {
    for (const m of t.matchAll(/住所[：:]\s*([^\n]+)/g)) out.push(m[1].trim());
  }
  return out;
}

const PREF = /(北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)/;
const CITY = /([^\s（(]{1,8}?[市区町村])/;

async function reverse(lat, lng) {
  try {
    const j = await (await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1&accept-language=ja`,
      { headers: UA, signal: AbortSignal.timeout(20000) })).json();
    const a = j.address || {};
    return { pref: a.province || a.state || '', city: a.city || a.town || a.village || a.county || '' };
  } catch { return null; }
}

const rows = [];
let n = 0;
for (const f of files) {
  const id = path.basename(f, '.json');
  const d = byId.get(id);
  if (!d?.lat) continue;
  const article = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  const addrs = addresses(article);
  if (!addrs.length) continue;

  const wantPref = d.prefecture;
  const prefMismatch = addrs.filter((a) => {
    const m = a.match(PREF);
    return m && m[1] !== wantPref;
  });
  const cities = [...new Set(addrs.map((a) => (a.replace(PREF, '').match(CITY) || [])[1]).filter(Boolean))];

  // 県が違うものは、それだけで確定。県が合っていても市区町村を実測と突き合わせる
  let actual = null;
  if (cities.length) {
    actual = await reverse(d.lat, d.lng);
    await sleep(1200);
  }
  const cityMismatch = actual?.city
    ? cities.filter((c) => c !== actual.city && !actual.city.includes(c.replace(/[市区町村]$/, '')) && !c.includes(actual.city.replace(/[市区町村]$/, '')))
    : [];

  n++;
  if (prefMismatch.length || cityMismatch.length) {
    rows.push({ id, name: d.name, prefecture: wantPref, actual, addrs, prefMismatch, cityMismatch });
    console.log(`❌ ${id.slice(0, 26).padEnd(28)} ${String(d.name).slice(0, 10).padEnd(12)} 実際=${actual?.pref ?? ''}${actual?.city ?? ''}`);
    for (const a of [...new Set([...prefMismatch, ...addrs.filter((x) => cityMismatch.some((c) => x.includes(c)))])]) {
      console.log(`      記事の住所: ${a.slice(0, 56)}`);
    }
  }
}

fs.writeFileSync('logs/article_address_audit.json', JSON.stringify(rows, null, 1));
console.log(`\n住所の書かれた記事 ${n}件 / 食い違い ${rows.length}件`);
console.log('→ logs/article_address_audit.json');
