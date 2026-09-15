#!/usr/bin/env node
/**
 * auditAllPrefBox.mjs — 全destinationの座標が、宣言した都道府県に入っているかを見る。
 *
 * 記事の住所を検査していて気づいた。記事に書かれた住所のほうが正しく、
 * 座標のほうが県境を越えて隣の県に落ちている例が並んでいた。
 *   銀山温泉   宣言=山形県 / 座標は宮城県大崎市
 *   五箇山     宣言=富山県 / 座標は岐阜県白川村
 *   象潟       宣言=秋田県 / 座標は山形県遊佐町
 * 座標は地図リンクと距離計算に使っているので、ずれていると別の場所へ案内する。
 * 南大隅で同じ型の誤りを直したが、単発ではなかった。
 *
 * 逆ジオコーディングは国土地理院を主に使う。Nominatim は 1req/秒の制限があり、
 * 並列で回すと 429 を返してくる（実際に出した）。地理院で引けなかったものだけ、
 * 間隔を空けて Nominatim に回す。
 *
 * usage: node scripts/auditAllPrefBox.mjs [--out path]
 */
import fs from 'fs';

const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'logs/pref_box_audit.json';

const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'))
  .filter((d) => d.lat && d.lng && d.prefecture);

// 市区町村コード表。地理院の逆ジオコーダはコードしか返さない
const muniJs = await (await fetch('https://maps.gsi.go.jp/js/muni.js', { headers: UA })).text();
const muni = new Map();
for (const m of muniJs.matchAll(/MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']+)'/g)) {
  const p = m[2].split(',');
  muni.set(m[1], { pref: p[1], city: p[3] });
}

async function gsi(lat, lng) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(
        `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`,
        { headers: UA, signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      const cd = j?.results?.muniCd;
      if (cd) return muni.get(String(cd).padStart(5, '0')) || muni.get(String(cd)) || null;
      return null;                       // 海上など。素直に null
    } catch { await sleep(700); }
  }
  return null;
}
let osmBudget = 0;
async function osm(lat, lng) {
  // 1秒に1回を守る
  const wait = Math.max(0, osmBudget - Date.now());
  if (wait) await sleep(wait);
  osmBudget = Date.now() + 1300;
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1&accept-language=ja`,
      { headers: UA, signal: AbortSignal.timeout(20000) });
    if (r.status === 429) { await sleep(20000); return null; }
    const j = await r.json();
    const a = j.address || {};
    return { pref: a.province || a.state || '', city: a.city || a.town || a.village || a.county || '' };
  } catch { return null; }
}

const rows = [];
let n = 0, ng = 0, unknown = 0;
for (const d of dests) {
  n++;
  let actual = await gsi(d.lat, d.lng);
  await sleep(250);
  if (!actual?.pref) actual = await osm(d.lat, d.lng);

  if (!actual?.pref) { unknown++; rows.push({ ...pick(d), actual: null, verdict: 'unknown' }); continue; }
  // 「長野県・岐阜県」のように複数県にまたがる表記があるので、どれかに入っていればよい
  const declared = d.prefecture.split(/[・、,]/).map((x) => x.trim()).filter(Boolean);
  const ok = declared.includes(actual.pref);
  if (!ok) {
    ng++;
    console.log(`❌ ${String(n).padStart(4)} ${d.id.slice(0, 24).padEnd(26)} ${String(d.name).slice(0, 10).padEnd(12)} 宣言=${d.prefecture.padEnd(5)} 実際=${actual.pref}${actual.city}`);
  }
  rows.push({ ...pick(d), actual, verdict: ok ? 'ok' : 'pref-ng' });
  if (n % 100 === 0) console.log(`   …${n}/${dests.length}  NG${ng} 不明${unknown}`);
}
function pick(d) { return { id: d.id, name: d.name, prefecture: d.prefecture, lat: d.lat, lng: d.lng }; }

fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
console.log(`\n${n}件中 県が違う ${ng}件 / 引けなかった ${unknown}件 → ${OUT}`);
