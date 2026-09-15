#!/usr/bin/env node
/**
 * auditGeneratedSpots.mjs — 一括生成分（gen_ / niche_）の spots に、
 * その旅先とは関係のない土地の話が混ざっていないかを全件見る。
 *
 * 実例
 *   オーロラ温泉（北海道陸別町）  spot「天塩川流域の秘境谷」＝道北の川。400km近く離れている
 *   相乗温泉（青森）              spot「鮫角灯台」「八戸市街地の朝市」＝八戸。同じ県だが100km以上
 *   落合温泉（青森）              spot「弘前市周辺へのアクセス経由となる津軽伝統工芸品販売地点」
 *
 * 県名の一致だけ見ても、同じ県の中で100km離れている例を落とせない。
 * そこで spot 名そのものを地理院とNominatimで引き直し、旅先の座標からの距離を測る。
 * 遠すぎるもの、そもそも引けないもの（実在が疑わしいもの）を一覧にする。
 *
 * ここでは一覧にするだけで、消しはしない。距離が出ただけでは
 * 「近くの見どころとして正しく挙げている」のか「無関係」なのか決められないため。
 *
 * usage: node scripts/auditGeneratedSpots.mjs [--skip N] [--limit N] [--out path]
 */
import fs from 'fs';

const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const num = (f, d) => (args.includes(f) ? Number(args[args.indexOf(f) + 1]) : d);
const SKIP = num('--skip', 0);
const LIMIT = num('--limit', Infinity);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'logs/generated_spot_audit.json';

/** この距離を超えたら「その旅先の見どころ」とは言いにくい */
const FAR_KM = 40;

const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'))
  .filter((d) => /^(gen_|niche_)/.test(d.id) && d.lat && d.lng && (d.spots || []).length)
  .slice(SKIP, SKIP + LIMIT);

const R = 6371;
const rad = (x) => (x * Math.PI) / 180;
const km = (a, b, c, e) => {
  const dLat = rad(c - a), dLng = rad(e - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(dLng / 2) ** 2;
  return +(2 * R * Math.asin(Math.sqrt(h))).toFixed(1);
};

async function jget(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.json(); }
    catch { /* 再試行 */ }
    await sleep(900 * (i + 1));
  }
  return null;
}

/** 地理院の住所検索。施設名でも引けることがある */
async function gsi(q) {
  const j = await jget(`https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`);
  const c = j?.[0]?.geometry?.coordinates;
  return c ? { lat: c[1], lng: c[0], src: 'gsi', label: j[0]?.properties?.title } : null;
}

/** Nominatim。日本に限定して引く */
async function osm(q) {
  const j = await jget('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=jp'
    + `&accept-language=ja&q=${encodeURIComponent(q)}`);
  const h = j?.[0];
  return h ? { lat: +h.lat, lng: +h.lon, src: 'osm', label: h.display_name } : null;
}

/** カッコ書きや説明的な語尾を落として、引ける形にする */
function normalize(name) {
  return String(name)
    .replace(/[（(].*?[)）]/g, '')
    .replace(/(周辺|付近|一帯|群|など)$/, '')
    .trim();
}

const rows = [];
let n = 0;
for (const d of dests) {
  n++;
  const out = { id: d.id, name: d.name, prefecture: d.prefecture, lat: d.lat, lng: d.lng, spots: [] };
  for (let i = 0; i < d.spots.length; i++) {
    const s = d.spots[i];
    if (!s || typeof s !== 'object' || !s.name) continue;
    const q = normalize(s.name);
    // 旅先の名前そのものを冠した spot（「◯◯温泉」など）は、そこを指しているので飛ばす
    if (q === d.name || q.includes(d.name)) {
      out.spots.push({ idx: i, name: s.name, verdict: 'self' });
      continue;
    }
    let hit = await gsi(`${d.prefecture}${q}`) || await gsi(q);
    await sleep(350);
    if (!hit) { hit = await osm(`${q} ${d.prefecture}`) || await osm(q); await sleep(1200); }

    if (!hit) {
      out.spots.push({ idx: i, name: s.name, verdict: 'unresolved' });
      continue;
    }
    const dist = km(d.lat, d.lng, hit.lat, hit.lng);
    out.spots.push({
      idx: i, name: s.name, km: dist, src: hit.src, label: String(hit.label || '').slice(0, 60),
      verdict: dist > FAR_KM ? 'far' : 'near',
    });
  }
  const far = out.spots.filter((x) => x.verdict === 'far');
  const unresolved = out.spots.filter((x) => x.verdict === 'unresolved');
  out.flagged = far.length > 0;
  rows.push(out);
  const mark = far.length ? '❌' : unresolved.length ? '❓' : '✅';
  console.log(`${mark} ${String(SKIP + n).padStart(4)} ${d.id.padEnd(26)} 遠い${far.length} 不明${unresolved.length}`
    + (far.length ? `  ${far.map((x) => `${x.name}(${x.km}km)`).join(' / ').slice(0, 70)}` : ''));
}

fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
const farTotal = rows.reduce((a, r) => a + r.spots.filter((x) => x.verdict === 'far').length, 0);
const unTotal = rows.reduce((a, r) => a + r.spots.filter((x) => x.verdict === 'unresolved').length, 0);
console.log(`\n旅先 ${rows.length}件 / ${FAR_KM}kmより遠い spot ${farTotal}件 / 引けなかった spot ${unTotal}件`);
console.log(`→ ${OUT}`);
