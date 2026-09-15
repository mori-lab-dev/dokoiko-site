#!/usr/bin/env node
/**
 * locateSuspectDests.mjs — spots に地理的な誤りが出た旅先の、実際の所在市町村を確定する。
 *
 * 差し替えるspotを考える前に、その旅先がどこにあるのかを押さえる。
 * 座標から国土地理院とNominatimの2つで引き、両方が同じ市町村を指したものを採る。
 * 例えば神威脇温泉は「積丹の神威岬」がspotに入っているが、
 * 座標（42.17, 139.41）は奥尻島で、積丹半島とは100km以上離れている。
 *
 * usage: node scripts/locateSuspectDests.mjs
 */
import fs from 'fs';

const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const suspects = JSON.parse(fs.readFileSync('logs/generated_spot_suspect.json', 'utf8'));
const ids = [...new Set(suspects.map((s) => s.id))];
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));

const muniJs = await (await fetch('https://maps.gsi.go.jp/js/muni.js', { headers: UA })).text();
const muni = new Map();
for (const m of muniJs.matchAll(/MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']+)'/g)) {
  const p = m[2].split(',');
  muni.set(m[1], `${p[1]}${p[3]}`);
}

async function gsi(lat, lng) {
  try {
    const j = await (await fetch(
      `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`,
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
    return `${a.province || a.state || ''}${a.city || a.town || a.village || a.county || ''}` || null;
  } catch { return null; }
}

const out = [];
for (const id of ids) {
  const d = byId.get(id);
  const g = await gsi(d.lat, d.lng);
  await sleep(300);
  const o = await osm(d.lat, d.lng);
  await sleep(1200);
  const agree = g && o && (g === o || g.includes(o.replace(/^.*?[都道府県]/, '')) || o.includes(g.replace(/^.*?[都道府県]/, '')));
  out.push({ id, name: d.name, lat: d.lat, lng: d.lng, gsi: g, osm: o, agree });
  console.log(`${agree ? '✅' : '❓'} ${id.padEnd(26)} ${String(d.name).slice(0, 12).padEnd(14)} GSI=${g ?? '-'}  OSM=${o ?? '-'}`);
}
fs.writeFileSync('logs/suspect_dest_locations.json', JSON.stringify(out, null, 1));
console.log(`\n→ logs/suspect_dest_locations.json`);
