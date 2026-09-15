#!/usr/bin/env node
/**
 * auditDestMainImages.mjs — destination の main.jpg とクレジットを全件突き合わせる。
 *
 * spot 側には verifySpotCredits.mjs があるが、destination 側には同じ検査が無かった。
 * 実際、シェア画像の背景を選ぶときに4件調べただけで2件ずれていた。
 *   kirishima          中身は霧島神宮で正しいが、imageCredit.url は Kagoshima_Airport…
 *   sakurajima-onsen   クレジットは正しいが、写真は霧島温泉郷であって古里温泉ではない
 *
 * 2つを見る。
 *   A クレジット照合  imageCredit.url の Commons ファイルを実際に落として、
 *                     手元の main.jpg と画素を突き合わせる（再圧縮で
 *                     バイトは変わるので、64x36のグレースケールにして平均差を見る）
 *   B 所在地照合      その Commons ファイルのカテゴリと説明文に、
 *                     旅先の県名・地名が出てくるか（commonsPlaceCheck と同じ考え方）
 *
 * Aが通ってBが ng のときは「クレジットは合っているが、写真が別の場所」。
 * Aが落ちたときは「クレジットのリンク先が違う」。原因が切り分けられる。
 *
 * usage: node scripts/auditDestMainImages.mjs [--skip N] [--limit N] [--out path]
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { placeCheck } from './commonsPlaceCheck.mjs';

const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const num = (f, d) => (args.includes(f) ? Number(args[args.indexOf(f) + 1]) : d);
const SKIP = num('--skip', 0);
const LIMIT = num('--limit', Infinity);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'logs/dest_image_audit.json';

const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));

/** そのdestinationが実際に表示している画像のパス（[id].astro と同じ優先順） */
function localMain(d) {
  for (const p of [`public/images/${d.id}/main.jpg`, `public/images/${d.id}.jpg`]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

const targets = dests.filter((d) => d.imageCredit?.url && localMain(d)).slice(SKIP, SKIP + LIMIT);

/** 64x36のグレースケールにして平均絶対差を取る。同じ写真なら数以下に収まる */
const fp = (buf) => sharp(buf).resize(64, 36, { fit: 'fill' }).greyscale().raw().toBuffer();
const diff = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return +(s / a.length).toFixed(1);
};

async function jget(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) }); if (r.ok) return await r.json(); }
    catch { /* 再試行 */ }
    await sleep(800 * (i + 1));
  }
  return null;
}
async function bget(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(35000) }); if (r.ok) return Buffer.from(await r.arrayBuffer()); }
    catch { /* 再試行 */ }
    await sleep(800 * (i + 1));
  }
  return null;
}

const rows = [];
let n = 0;
for (const d of targets) {
  n++;
  const local = localMain(d);
  const c = d.imageCredit;
  const title = decodeURIComponent((c.url.split('/wiki/')[1] || '').replace(/_/g, ' '));
  const row = { id: d.id, name: d.name, prefecture: d.prefecture, file: title, credit: c, local };

  if (!/^File:/i.test(title)) {
    row.verdict = 'skip';
    row.why = 'クレジットのURLが Commons のファイルページではない';
    rows.push(row);
    continue;
  }

  const j = await jget('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo'
    + `&iiprop=url&iiurlwidth=800&titles=${encodeURIComponent(title)}`);
  const ii = Object.values(j?.query?.pages || {})[0]?.imageinfo?.[0];
  if (!ii) {
    row.verdict = 'missing';
    row.why = 'Commons にそのファイルが無い';
    rows.push(row);
    console.log(`❓ ${String(SKIP + n).padStart(4)} ${d.id.padEnd(22)} ファイルが無い  ${title.slice(0, 44)}`);
    await sleep(250);
    continue;
  }

  const remote = await bget(ii.thumburl || ii.url);
  if (!remote) {
    row.verdict = 'fetchfail';
    rows.push(row);
    await sleep(400);
    continue;
  }
  try {
    row.pixelDiff = diff(await fp(fs.readFileSync(local)), await fp(remote));
  } catch {
    row.verdict = 'fetchfail';
    rows.push(row);
    continue;
  }

  // 地名照合。spot名と旅先名を手がかりに渡す
  const words = [d.name, d.mainSpot, ...(d.spots || []).filter((s) => s && typeof s === 'object').map((s) => s.name)]
    .filter(Boolean);
  let place = null;
  try { place = await placeCheck(title, d.prefecture, words); } catch { /* 取れなければ null */ }
  row.place = place?.verdict ?? null;
  row.placeWhy = place?.reason ?? place?.others ?? null;

  row.verdict = row.pixelDiff <= 6
    ? (row.place === 'ng' ? 'place-ng' : 'ok')
    : 'credit-mismatch';

  const mark = row.verdict === 'ok' ? '✅' : row.verdict === 'place-ng' ? '🟡' : '❌';
  console.log(`${mark} ${String(SKIP + n).padStart(4)} ${d.id.padEnd(22)} 画素差${String(row.pixelDiff).padStart(6)} 所在=${String(row.place).padEnd(5)} ${title.slice(0, 40)}`);
  rows.push(row);
  await sleep(300);
}

fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
const tally = {};
for (const r of rows) tally[r.verdict] = (tally[r.verdict] || 0) + 1;
console.log(`\n${rows.length}件`);
for (const [k, v] of Object.entries(tally)) console.log(`  ${k.padEnd(16)} ${v}`);
console.log(`→ ${OUT}`);
