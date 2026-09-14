#!/usr/bin/env node
/**
 * recoverSpotOrigin.mjs — ローカルspot画像の出所を、取得経路ごとに再現して突き止める。
 *
 * recoverSpotCredits.mjs は Commons だけを見て0件だった。寸法を調べたところ
 * 865枚のうち622枚が幅1280px＝Pixabayの largeImageURL で、取ったのは
 * pixabayFetchAll.js（Pixabay → Openverse → Wikipedia の順）だと分かった。
 * そこで当時と同じ順・同じクエリで引き直し、バイト一致したものを出所とする。
 *
 * Pixabay はクレジット表示義務が無いライセンスなので、一致すれば「表示義務なし」と確定できる。
 * ただし Pixabay は日本語で引いても土地とは無関係のストック写真を返すことがあるため、
 * 一致したヒットのタグとページURLも残す。クレジットの話とは別に、
 * 写真が本当にその場所かを後で見直せるようにしておく。
 *
 * usage: node scripts/recoverSpotOrigin.mjs [--limit N] [--out logs/spot_origin.json]
 */
import fs from 'fs';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const SKIP = args.includes('--skip') ? Number(args[args.indexOf('--skip') + 1]) : 0;
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'logs/spot_origin.json';
const RECOMPRESS = '3671fc0a';
const PIXABAY_KEY = '55917935-4c63d9c4d75af8f3d831e21a6';  // pixabayFetchAll.js と同じ鍵

const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const targets = [];
for (const d of dests) {
  for (let i = 0; i < (d.spots || []).length; i++) {
    const s = d.spots[i];
    if (!s || typeof s !== 'object') continue;
    if (!s.imageUrl?.startsWith('/images/spots/') || s.imageCredit) continue;
    targets.push({ destId: d.id, destName: d.name, prefecture: d.prefecture, idx: i, spotName: s.name, url: s.imageUrl });
  }
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function localHashes(url) {
  const rel = `public${url}`;
  const m = new Map();
  if (fs.existsSync(rel)) m.set(sha(fs.readFileSync(rel)), 'current');
  try {
    m.set(sha(execFileSync('git', ['show', `${RECOMPRESS}^:${rel}`], { maxBuffer: 64 * 1024 * 1024 })), 'pre-recompress');
  } catch { /* その時点には無かった */ }
  return m;
}

async function jget(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) }); if (r.ok) return await r.json(); }
    catch { /* 再試行 */ }
    await sleep(900 * (i + 1));
  }
  return null;
}
async function bget(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()); }
    catch { /* 再試行 */ }
    await sleep(900 * (i + 1));
  }
  return null;
}

/**
 * 当時と同じ順・同じクエリで候補を出す。
 * 全部まとめて作ると、Pixabayで当たる大半のケースでもOpenverseとWikipediaを
 * 無駄に叩くことになるので、1件ずつ遅延で返す。
 */
async function* candidates(spotName, prefecture) {
  const pref = (prefecture || '').replace(/[県府都]$/, '');
  const queries = [spotName, pref ? `${spotName} ${pref}` : null].filter(Boolean);

  for (const q of queries) {
    const j = await jget(`https://pixabay.com/api/?key=${PIXABAY_KEY}&q=${encodeURIComponent(q)}`
      + '&image_type=photo&lang=ja&per_page=3&safesearch=true');
    const h = j?.hits?.[0];
    if (h) yield { via: 'pixabay', query: q, imgUrl: h.largeImageURL || h.webformatURL,
      ref: h.pageURL, tags: h.tags, by: h.user };
    await sleep(350);
  }
  for (const q of queries) {
    // 旧エンドポイント api.openverse.engineering は現在 api.openverse.org
    const j = await jget(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}`
      + '&page_size=3&aspect_ratio=wide&license_type=commercial');
    const h = j?.results?.[0];
    if (h) yield { via: 'openverse', query: q, imgUrl: h.url, ref: h.foreign_landing_url,
      by: h.creator, license: h.license, licenseVersion: h.license_version, title: h.title };
    await sleep(350);
  }
  for (const q of queries) {
    const j = await jget(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`);
    const u = j?.originalimage?.source || j?.thumbnail?.source;
    if (u) yield { via: 'wikipedia', query: q, imgUrl: u, ref: j?.content_urls?.desktop?.page, title: j?.title };
    await sleep(250);
  }
}

const found = [], unknown = [];
let n = 0;
for (const t of targets.slice(SKIP)) {
  if (n >= LIMIT) break;
  n++;
  const mine = localHashes(t.url);
  let hit = null;
  const tried = new Set();
  for await (const c of candidates(t.spotName, t.prefecture)) {
    if (tried.has(c.imgUrl)) continue;     // 2つのクエリが同じ画像を返すことがある
    tried.add(c.imgUrl);
    const buf = await bget(c.imgUrl);
    await sleep(120);
    if (!buf) continue;
    const which = mine.get(sha(buf));
    if (which) { hit = { ...c, matched: which }; break; }
  }
  if (hit) {
    found.push({ ...t, origin: hit });
    console.log(`✅ ${String(SKIP + n).padStart(4)} ${t.destId}/${t.idx} ${String(t.spotName).slice(0, 12).padEnd(14)} ${hit.via.padEnd(9)} ${String(hit.tags || hit.license || '').slice(0, 40)}`);
  } else {
    unknown.push({ ...t, why: 'どの経路でもバイト一致しない' });
    console.log(`--  ${String(SKIP + n).padStart(4)} ${t.destId}/${t.idx} ${String(t.spotName).slice(0, 12).padEnd(14)} 特定できず`);
  }
}

fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ found, unknown }, null, 1));
const by = {};
for (const f of found) by[f.origin.via] = (by[f.origin.via] || 0) + 1;
console.log(`\n特定 ${found.length} / 不明 ${unknown.length}（試行 ${n}件）`);
for (const [k, v] of Object.entries(by)) console.log(`  ${k}  ${v}件`);
console.log(`→ ${OUT}`);
