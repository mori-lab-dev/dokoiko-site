#!/usr/bin/env node
/**
 * fixPrefBoxRemainder.mjs — 県境検査で残った4件を個別に確かめて直す。
 *
 * resolvePrefBoxNg では次の理由で見送りになった。
 *   尾瀬        引き当てた座標（36.937, 139.251）は福島県檜枝岐村。尾瀬は群馬・福島・新潟に
 *               またがるが、宣言は群馬県で、記事とdescriptionの起点も鳩待峠。群馬側に寄せる
 *   象潟        座標（39.20306, 139.90764）は正しかった。国土地理院の逆ジオコーダが
 *               海沿いで何も返さず、判定できなかっただけ。Nominatimでは秋田県にかほ市
 *   仁淀川      Wikidataと地理院が20km以上離れて一致しなかった。
 *               仁淀ブルーの中心である仁淀川町大崎で引き直す
 *   水郷筑波国定公園  公園が茨城・千葉にまたがり、引き当てた点が千葉県香取市だった。
 *               宣言は茨城県なので、茨城側の潮来あやめ園で引き直す
 *
 * 入れる前に、その座標が宣言した県に入るかを2ソース（地理院・Nominatim）で確かめる。
 *
 * usage: node scripts/fixPrefBoxRemainder.mjs [--apply]
 */
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];

const FIXES = [
  { id: 'oze',        lat: 36.89193, lng: 139.27298, why: '群馬側の玄関口・鳩待峠（国土地理院の住所検索）' },
  { id: 'kisakata',   lat: 39.20306, lng: 139.90764, why: 'wikipedia×wikidataが一致した象潟の位置。地理院が返さなかっただけで値は正しい' },
  { id: 'niyodogawa', lat: 33.57602, lng: 133.16982, why: '仁淀川町大崎（国土地理院の住所検索）' },
  { id: 'gen_茨城_水郷筑波国定公園', lat: 35.93651, lng: 140.54747, why: '茨城側の潮来あやめ園（国土地理院の住所検索）' },
];

const muniJs = await (await fetch('https://maps.gsi.go.jp/js/muni.js', { headers: UA })).text();
const muni = new Map();
for (const m of muniJs.matchAll(/MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']+)'/g)) {
  const p = m[2].split(',');
  muni.set(m[1], `${p[1]}${p[3]}`);
}
async function gsi(lat, lng) {
  try {
    const j = await (await fetch(`https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`,
      { headers: UA, signal: AbortSignal.timeout(20000) })).json();
    const cd = j?.results?.muniCd;
    return cd ? muni.get(String(cd).padStart(5, '0')) || muni.get(String(cd)) || null : null;
  } catch { return null; }
}
async function osm(lat, lng) {
  try {
    const j = await (await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1&accept-language=ja`,
      { headers: UA, signal: AbortSignal.timeout(20000) })).json();
    const a = j.address || {};
    return `${a.province || a.state || ''}${a.city || a.town || a.village || a.county || ''}`;
  } catch { return null; }
}

const R = 6371, rad = (x) => (x * Math.PI) / 180;
const km = (a, b, c, e) => {
  const dLat = rad(c - a), dLng = rad(e - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
  return +(2 * R * Math.asin(Math.sqrt(h))).toFixed(2);
};

const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
const byId = new Map(data.map((d) => [d.id, d]));

let ok = 0, ng = 0;
for (const f of FIXES) {
  const d = byId.get(f.id);
  if (!d) { console.log(`❌ ${f.id} が見つからない`); ng++; continue; }
  const g = await gsi(f.lat, f.lng);
  await sleep(500);
  const o = await osm(f.lat, f.lng);
  await sleep(1300);
  const hit = [g, o].filter(Boolean).some((x) => x.startsWith(d.prefecture));
  const moved = km(d.lat, d.lng, f.lat, f.lng);
  if (!hit) {
    console.log(`❌ ${f.id.padEnd(24)} 宣言=${d.prefecture} だが GSI=${g ?? '-'} OSM=${o ?? '-'}`);
    ng++; continue;
  }
  console.log(`✅ ${f.id.padEnd(24)} ${String(d.name).slice(0, 10).padEnd(12)} ${moved}km移動  GSI=${g ?? '-'} OSM=${o ?? '-'}`);
  console.log(`      根拠: ${f.why}`);
  d.lat = f.lat; d.lng = f.lng;
  ok++;
}

console.log(`\n採用 ${ok}件 / 見送り ${ng}件`);
if (APPLY && ok) {
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const file of FILES) fs.writeFileSync(file, json);
  console.log('✅ destinations.json を更新');
} else if (!APPLY) {
  console.log('（--apply で反映）');
}
