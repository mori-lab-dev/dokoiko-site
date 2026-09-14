#!/usr/bin/env node
/**
 * fixMinamiosumiCoord.mjs — 南大隅の座標を直す。
 *
 * エリア別ページを作るときに座標から市町村を引いたところ、南大隅が肝付町を指していた。
 * 現在値 31.2298, 130.9778 は内之浦のあたりで、南大隅町から約20km東に外れている。
 * 地図リンクがまったく別の町へ着地していた。
 *
 * 新しい値は南大隅町（根占）。4ソースのうち3つが41m以内で一致した。
 *   wikipedia 31.217330, 130.768220
 *   wikidata  31.217333, 130.768222
 *   gsi       31.217297, 130.768646
 *   osm       31.117059, 130.774254  ← 11km南。町域の別の点を返しているので採らない
 * 記事の主役は佐多岬（30.995, 130.662）だが、こちらは spots 側に持っている。
 * 旅先そのものは町の中心（根占温泉・港のあるあたり）を指すのが実態に合う。
 *
 * usage: node scripts/fixMinamiosumiCoord.mjs
 */
import fs from 'fs';

const NEW = { lat: 31.21733, lng: 130.76822 };
const P = 'src/data/destinations.json';

const data = JSON.parse(fs.readFileSync(P, 'utf8'));
const d = data.find((x) => x.id === 'minamiosumi');
if (!d) { console.error('❌ minamiosumi が見つからない'); process.exit(1); }

const R = 6371000, rad = (x) => (x * Math.PI) / 180;
const dist = (a, b, c, e) => {
  const dLat = rad(c - a), dLng = rad(e - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
};

console.log(`旧 ${d.lat}, ${d.lng}`);
console.log(`新 ${NEW.lat}, ${NEW.lng}`);
console.log(`移動 ${dist(d.lat, d.lng, NEW.lat, NEW.lng)}m`);

d.lat = NEW.lat;
d.lng = NEW.lng;
fs.writeFileSync(P, JSON.stringify(data, null, 2) + '\n');
console.log('✅ destinations.json を更新');
