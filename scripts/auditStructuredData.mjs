#!/usr/bin/env node
/**
 * auditStructuredData.mjs — 旅先ページの構造化データ（JSON-LD）を、ビルド済みHTML（dist）で検査する（2026-10-13）。
 *
 *   ・JSON として読める
 *   ・TouristAttraction（name・url・address）が1つある。座標のある旅先は geo も
 *   ・BreadcrumbList が3段で、画面のパンくず（HOME › 地方 › 旅先）と同じ名前・最後が自分のURL
 *   ・featured_stay のある旅先には LodgingBusiness があり、名前が画面に出している宿名と同じ
 *   ・featured_stay が無い旅先に LodgingBusiness が出ていない（表示していない事実を載せない）
 *   ・includesAttraction のスポット名が、ページ本文にも出ている
 * 検出のみ。usage: node scripts/auditStructuredData.mjs [--verbose]
 */
import fs from 'fs';
import path from 'path';

const VERBOSE = process.argv.includes('--verbose');
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const bad = { json: [], attraction: [], geo: [], breadcrumb: [], lodging: [], ghostLodging: [], spots: [] };
let n = 0, withLodging = 0;
const flat = (g) => (Array.isArray(g) ? g : [g]);

for (const d of dests) {
  const f = path.join('dist/destinations', d.id, 'index.html');
  if (!fs.existsSync(f)) continue;
  n++;
  const html = fs.readFileSync(f, 'utf8');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let nodes = [];
  try { for (const b of blocks) { const j = JSON.parse(b); nodes.push(...(j['@graph'] ? flat(j['@graph']) : [j])); } }
  catch { bad.json.push(d.id); continue; }
  const types = (x) => flat(x['@type']);
  const att = nodes.find((x) => types(x).includes('TouristAttraction'));
  if (!att || !att.name || !att.url || !att.address) bad.attraction.push(d.id);
  else if (typeof d.lat === 'number' && !att.geo) bad.geo.push(d.id);
  const bc = nodes.find((x) => types(x).includes('BreadcrumbList'));
  const items = bc?.itemListElement || [];
  if (items.length !== 3 || items[0].name !== 'HOME' || items[2].name !== d.name || !String(items[2].item).endsWith(`/destinations/${d.id}/`)
      || !new RegExp(`<nav class="breadcrumb[^>]*>[\\s\\S]*?<span[^>]*>${d.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</span>`).test(html)) bad.breadcrumb.push(d.id);
  const lodging = nodes.find((x) => types(x).includes('LodgingBusiness'));
  if (d.featured_stay?.name) {
    withLodging++;
    if (!lodging || lodging.name !== d.featured_stay.name || !html.includes(d.featured_stay.name)) bad.lodging.push(d.id);
  } else if (lodging) bad.ghostLodging.push(d.id);
  for (const s of att?.includesAttraction || []) if (!html.includes(s.name)) { bad.spots.push(`${d.id}:${s.name}`); break; }
}
console.log(`旅先ページ ${n} 件（LodgingBusiness あり ${withLodging} 件）`);
const label = { json: 'JSONとして読めない', attraction: 'TouristAttraction が無い・不完全', geo: '座標があるのに geo が無い', breadcrumb: 'BreadcrumbList が画面のパンくずと合わない',
  lodging: 'featured_stay があるのに LodgingBusiness が無い・名前が違う', ghostLodging: 'featured_stay が無いのに LodgingBusiness が出ている', spots: 'スポット名が本文に出ていない' };
for (const [k, v] of Object.entries(bad)) console.log(`${label[k]}: ${v.length}件${VERBOSE && v.length ? ' ' + v.slice(0, 10).join(', ') : ''}`);
process.exit(Object.values(bad).some((v) => v.length) ? 1 : 0);
