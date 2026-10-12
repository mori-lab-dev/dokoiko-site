#!/usr/bin/env node
/**
 * auditGeoOfReplaced.mjs — 差し替えた画像の撮影地点（Commons の GeoData 座標）が、旅先の座標から離れすぎていないかを見る（2026-10-13）。
 * 県名の一致だけでは同じ県の別の場所を通してしまう（益田市の滝に松江の庭園、など）。座標があるファイルは距離で客観的に確かめられる。
 * 座標の無いファイルは判定できない（「不明」として数える）。山・島・海の写真は旅先の中心から数十km離れて撮ることがあるので、
 * 既定の閾値は 40km。超えたものを一覧にする（データは書き換えない）。
 * usage: node scripts/auditGeoOfReplaced.mjs logs/replace_*.json [--km 40]
 */
import fs from 'fs';
const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const args = process.argv.slice(2);
const KM = args.includes('--km') ? Number(args[args.indexOf('--km') + 1]) : 40;
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--km');
const dests = new Map(JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')).map((d) => [d.id, d]));
const rad = (x) => (x * Math.PI) / 180;
const km = (a, b) => { const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
const rows = [];
for (const f of files) for (const a of JSON.parse(fs.readFileSync(f, 'utf8')).adopted || []) {
  const d = dests.get(a.id);
  if (!d || d.imageCredit?.url !== a.credit.url) continue;
  const r = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=coordinates&colimit=1&titles=${encodeURIComponent(a.file)}`, { headers: UA })).json();
  const c = Object.values(r.query?.pages || {})[0]?.coordinates?.[0];
  rows.push({ id: a.id, name: d.name, file: a.file, km: c ? +km({ lat: d.lat, lng: d.lng }, { lat: c.lat, lng: c.lon }).toFixed(1) : null });
  await new Promise((r2) => setTimeout(r2, 200));
}
const far = rows.filter((x) => x.km != null && x.km > KM).sort((a, b) => b.km - a.km);
console.log(`対象 ${rows.length}件 / 座標あり ${rows.filter((x) => x.km != null).length} / 不明 ${rows.filter((x) => x.km == null).length} / ${KM}km 超 ${far.length}件`);
for (const x of far) console.log(`  ${String(x.km).padStart(6)}km ${x.id.padEnd(22)} ${x.name.slice(0, 10).padEnd(11)} ${x.file.slice(5, 64)}`);
fs.writeFileSync('logs/replaced_geo_audit.json', JSON.stringify(rows, null, 1));
