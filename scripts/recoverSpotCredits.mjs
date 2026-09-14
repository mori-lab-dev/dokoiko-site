#!/usr/bin/env node
/**
 * recoverSpotCredits.mjs — ローカル保存したspot画像の出所をたどり直し、クレジットを復元する。
 *
 * public/images/spots/ 以下の865枚は fetchSpotImages.js / pixabayFetchAll.js で取ったもので、
 * そのとき作者もライセンスも記録していなかった。CC BY / CC BY-SA なら表示義務があるので、
 * 出所を特定できるものは特定し、できないものは「できない」と分かる形にしておく。
 *
 * やり方は当てずっぽうの再検索ではなく、バイト一致での証明。
 *   1. 当時と同じ検索（spot名＋県名 → spot名、Commons検索 上位3件、iiurlwidth=1000）を再現する
 *   2. 候補のサムネイルを落として、手元のファイルとハッシュを突き合わせる
 *   3. 一致したものだけ、その Commons ファイルの extmetadata からクレジットを作る
 * 「たぶんこれだろう」で別人の名前を載せる方が、クレジット無しより悪いため。
 *
 * 手元のファイルは 3671fc0a「全画像を1600px/quality80に再圧縮」で作り直されている。
 * そのため、現在のバイト列と再圧縮前（3671fc0a^）のバイト列の両方を突き合わせる。
 *
 * usage: node scripts/recoverSpotCredits.mjs [--limit N] [--out logs/spot_credit_recover.json]
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'logs/spot_credit_recover.json';
const RECOMPRESS = '3671fc0a';   // 全画像を1600px/quality80に再圧縮したコミット

const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));

const targets = [];
for (const d of dests) {
  for (let i = 0; i < (d.spots || []).length; i++) {
    const s = d.spots[i];
    if (!s || typeof s !== 'object') continue;
    if (!s.imageUrl?.startsWith('/images/spots/')) continue;
    if (s.imageCredit) continue;
    targets.push({ destId: d.id, destName: d.name, prefecture: d.prefecture, idx: i, spotName: s.name, url: s.imageUrl });
  }
}
console.log(`対象 ${targets.length}枚（クレジットの無いローカルspot画像）`);

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** 手元にあるバイト列（現在ぶんと、再圧縮前ぶん）を集める */
function localHashes(url) {
  const rel = `public${url}`;
  const set = new Map();
  if (fs.existsSync(rel)) set.set(sha(fs.readFileSync(rel)), 'current');
  try {
    const buf = execFileSync('git', ['show', `${RECOMPRESS}^:${rel}`], { maxBuffer: 64 * 1024 * 1024 });
    set.set(sha(buf), 'pre-recompress');
  } catch { /* その時点には無かったファイル */ }
  return set;
}

async function jget(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
      if (r.ok) return await r.json();
    } catch { /* 再試行 */ }
    await sleep(800 * (i + 1));
  }
  return null;
}

async function bget(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch { /* 再試行 */ }
    await sleep(800 * (i + 1));
  }
  return null;
}

/** 当時と同じ検索。上位3件ぶんのタイトルとサムネイルURLを返す */
async function commonsCandidates(q) {
  const j = await jget('https://commons.wikimedia.org/w/api.php?action=query&format=json'
    + `&generator=search&gsrnamespace=6&gsrlimit=3&gsrsearch=${encodeURIComponent(q)}`
    + '&prop=imageinfo&iiprop=url&iiurlwidth=1000');
  const pages = j?.query?.pages;
  if (!pages) return [];
  return Object.values(pages)
    .map((p) => ({ title: p.title, thumb: p.imageinfo?.[0]?.thumburl, full: p.imageinfo?.[0]?.url }))
    .filter((c) => c.thumb || c.full);
}

async function commonsCredit(title) {
  const j = await jget('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo'
    + `&iiprop=extmetadata&titles=${encodeURIComponent(title)}`);
  const p = Object.values(j?.query?.pages || {})[0];
  const m = p?.imageinfo?.[0]?.extmetadata;
  if (!m) return null;
  const strip = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const license = strip(m.LicenseShortName?.value);
  return {
    author: strip(m.Artist?.value) || '作者不明',
    license: license || 'ライセンス不明',
    url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    // CC0・パブリックドメインは表示義務なし。ここを一律trueにすると嘘になる。
    attributionRequired: !/^(CC0|Public domain|パブリック)/i.test(license),
  };
}

const found = [], unknown = [];
let n = 0;
for (const t of targets) {
  if (n >= LIMIT) break;
  n++;
  const mine = localHashes(t.url);
  if (mine.size === 0) { unknown.push({ ...t, why: 'ファイルが見当たらない' }); continue; }

  const pref = (t.prefecture || '').replace(/[県府都]$/, '');
  let hit = null;
  for (const q of [`${t.spotName} ${pref}`, t.spotName]) {
    const cands = await commonsCandidates(q);
    for (const c of cands) {
      const buf = await bget(c.thumb || c.full);
      await sleep(200);
      if (!buf) continue;
      const which = mine.get(sha(buf));
      if (which) { hit = { ...c, matched: which, query: q }; break; }
    }
    if (hit) break;
    await sleep(300);
  }

  if (hit) {
    const credit = await commonsCredit(hit.title);
    found.push({ ...t, title: hit.title, matched: hit.matched, query: hit.query, credit });
    console.log(`✅ ${String(n).padStart(3)} ${t.destId}/${t.idx} ${String(t.spotName).slice(0, 14).padEnd(16)} ${hit.title.slice(0, 46)}  [${credit?.license}]`);
  } else {
    unknown.push({ ...t, why: 'バイト一致する候補が無い' });
    console.log(`--  ${String(n).padStart(3)} ${t.destId}/${t.idx} ${String(t.spotName).slice(0, 14).padEnd(16)} 特定できず`);
  }
  await sleep(300);
}

fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ found, unknown }, null, 1));
console.log(`\n特定 ${found.length} / 不明 ${unknown.length}（試行 ${n}件）  → ${OUT}`);
