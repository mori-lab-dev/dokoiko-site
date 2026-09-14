#!/usr/bin/env node
/**
 * assignKagoshimaAreas.mjs — 鹿児島県の旅先を、公式のエリア区分へ割り当てる。
 *
 * destinations.json は市町村を持っていないので、座標から逆ジオコーディングして市町村を引く。
 * 割り当てを間違えると「このエリアに無い場所」を載せてしまうので、
 * 国土地理院とNominatimの2ソースで引き、両方が同じ市町村を指したものだけを確定とする。
 * 食い違ったもの・引けなかったものは unresolved に落とし、こちらで裏を取ってから入れる。
 *
 * usage: node scripts/assignKagoshimaAreas.mjs
 * 入力:  logs/kagoshima_areas.json（parseKagoshimaAreas.mjs の出力）
 * 出力:  logs/kagoshima_area_assign.json
 */
import fs from 'fs';

const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const areas = JSON.parse(fs.readFileSync('logs/kagoshima_areas.json', 'utf8'));
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'))
  .filter((d) => d.prefecture === '鹿児島県');

// 公式の value は「薩摩郡さつま町」のように郡付き。末尾の市区町村名だけを照合キーにする。
const townToArea = new Map();
for (const a of areas) {
  for (const t of a.towns) {
    const bare = t.replace(/^.*?郡/, '');
    townToArea.set(bare, a.name);
    townToArea.set(t, a.name);
  }
}

// 国土地理院の市区町村コード表
const muniJs = await (await fetch('https://maps.gsi.go.jp/js/muni.js', { headers: UA })).text();
const muniCd = new Map();
for (const m of muniJs.matchAll(/MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']+)'/g)) {
  const parts = m[2].split(',');           // 46,鹿児島県,46201,鹿児島市
  muniCd.set(m[1], { pref: parts[1], city: parts[3] });
}

async function gsi(lat, lng) {
  try {
    const j = await (await fetch(
      `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`,
      { headers: UA, signal: AbortSignal.timeout(20000) })).json();
    const cd = j?.results?.muniCd;
    return cd ? (muniCd.get(String(cd).padStart(5, '0')) || muniCd.get(String(cd)))?.city ?? null : null;
  } catch { return null; }
}

async function osm(lat, lng) {
  try {
    const j = await (await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1&accept-language=ja`,
      { headers: UA, signal: AbortSignal.timeout(20000) })).json();
    const a = j.address || {};
    return a.city || a.town || a.village || a.municipality || a.county || null;
  } catch { return null; }
}

const resolved = [], unresolved = [];
for (const d of dests) {
  const g = await gsi(d.lat, d.lng);
  await sleep(400);
  const o = await osm(d.lat, d.lng);
  await sleep(1200);

  const area = g && o && g === o ? townToArea.get(g) : null;
  if (area) {
    resolved.push({ id: d.id, name: d.name, city: g, area });
    console.log(`OK   ${d.id.padEnd(20)} ${d.name.padEnd(14)} ${g.padEnd(10)} ${area}`);
  } else {
    unresolved.push({ id: d.id, name: d.name, lat: d.lat, lng: d.lng, gsi: g, osm: o });
    console.log(`❓   ${d.id.padEnd(20)} ${d.name.padEnd(14)} GSI=${g ?? '-'} OSM=${o ?? '-'}`);
  }
}

console.log(`\n確定 ${resolved.length} / 要確認 ${unresolved.length}（全${dests.length}件）`);
for (const a of areas) {
  const n = resolved.filter((r) => r.area === a.name).length;
  console.log(`  ${a.name.padEnd(12)} ${n}件`);
}

fs.writeFileSync('logs/kagoshima_area_assign.json',
  JSON.stringify({ resolved, unresolved }, null, 1));
console.log('→ logs/kagoshima_area_assign.json');
