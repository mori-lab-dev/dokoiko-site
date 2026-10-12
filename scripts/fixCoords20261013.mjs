// 座標ずれ3件の修正（2026-10-13）。verifyDestCoords.mjs の合意座標を反映する。
//   shinojima        Wikipedia+Wikidata+OSM+国土地理院の4ソースが一致（現在値は12.2km北にずれていた）
//   tobishima-island OSM+国土地理院が一致（Wikipedia記事は座標なし。現在値は12.1km東にずれていた）
//   ryusendo         Wikidata+OSMが一致（国土地理院は東京の竜泉に誤ヒット。現在値は17kmずれていた）
import fs from 'fs';
const FIX = {
  shinojima: { lat: 34.6764, lng: 137.0038 },
  'tobishima-island': { lat: 39.195, lng: 139.5498 },
  ryusendo: { lat: 39.8603, lng: 141.7971 },
};
for (const f of ['src/data/destinations.json', 'public/data/destinations.json']) {
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const d of data) if (FIX[d.id]) { console.log(`${f.slice(0, 3)} ${d.id}: ${d.lat},${d.lng} → ${FIX[d.id].lat},${FIX[d.id].lng}`); Object.assign(d, FIX[d.id]); }
  fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n');
}
