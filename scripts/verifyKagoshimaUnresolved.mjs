#!/usr/bin/env node
/**
 * verifyKagoshimaUnresolved.mjs — エリア割り当てで2ソース一致しなかったものを個別に確かめる。
 *
 * 国土地理院の逆ジオコーダは離島で空を返すことがある（一度きりの失敗かどうかは再試行で分かる）。
 * 再試行してもだめなら、Wikidataの所在地（P131）を2つ目のソースとして使う。
 * どちらでも裏が取れないものは、こちらで勝手に決めずに外す。
 *
 * usage: node scripts/verifyKagoshimaUnresolved.mjs
 */
import fs from 'fs';

const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { unresolved } = JSON.parse(fs.readFileSync('logs/kagoshima_area_assign.json', 'utf8'));

const muniJs = await (await fetch('https://maps.gsi.go.jp/js/muni.js', { headers: UA })).text();
const muniCd = new Map();
for (const m of muniJs.matchAll(/MUNI_ARRAY\["(\d+)"\]\s*=\s*'([^']+)'/g)) {
  muniCd.set(m[1], m[2].split(',')[3]);
}

async function gsiRetry(lat, lng, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(
        `https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress?lat=${lat}&lon=${lng}`,
        { headers: UA, signal: AbortSignal.timeout(25000) });
      const j = await r.json();
      const cd = j?.results?.muniCd;
      if (cd) return muniCd.get(String(cd).padStart(5, '0')) || muniCd.get(String(cd)) || null;
    } catch { /* 次の試行へ */ }
    await sleep(1500 * (i + 1));
  }
  return null;
}

/** Wikidata で島名を引き、所在する行政区画（P131）のラベルを取る */
async function wikidataAdmin(name) {
  try {
    const s = await (await fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}`
      + '&language=ja&uselang=ja&format=json&limit=5', { headers: UA })).json();
    for (const hit of s.search || []) {
      const e = await (await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${hit.id}`
        + '&props=claims&format=json', { headers: UA })).json();
      const claims = e.entities?.[hit.id]?.claims?.P131;
      if (!claims?.length) { await sleep(300); continue; }
      const ids = claims.map((c) => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
      if (!ids.length) { await sleep(300); continue; }
      const lab = await (await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}`
        + '&props=labels&languages=ja&format=json', { headers: UA })).json();
      const names = ids.map((i) => lab.entities?.[i]?.labels?.ja?.value).filter(Boolean);
      if (names.length) return names;
      await sleep(300);
    }
  } catch { /* そのまま */ }
  return null;
}

for (const u of unresolved) {
  const g = await gsiRetry(u.lat, u.lng);
  const w = await wikidataAdmin(u.name);
  const agree = g && u.osm && g === u.osm;
  console.log(`■ ${u.name}（${u.id}） ${u.lat}, ${u.lng}`);
  console.log(`   OSM      : ${u.osm ?? '-'}`);
  console.log(`   GSI再試行 : ${g ?? '取得できず'}`);
  console.log(`   Wikidata : ${w ? w.join(' / ') : '取得できず'}`);
  console.log(`   判定     : ${agree ? `✅ ${g} で2ソース一致`
    : (w && u.osm && w.some((x) => x === u.osm)) ? `✅ ${u.osm} でOSMとWikidataが一致`
      : '❌ 裏が取れない'}`);
  await sleep(800);
}
