// SEO技術面の検査（2026-11-04）: sitemap の lastmod、画像の width/height・loading・LCP画像の優先指定、フォントの読み込み方。
//  - 旅先ページ(1307)の sitemap に lastmod が入っている・日付形式・未来日でない
//  - src/data/imageDims.json が public/images の実物と一致している（縦横が古くなっていない）
//  - 旅先・ハブ・特設ページの自サイト画像(/images/…)に width/height がある
//  - 旅先・ハブのヒーロー画像は fetchpriority="high"・lazy でない。ヒーロー以外の画像は loading="lazy"
//  - フォントは CSS の @import ではなく <link> で読んでいる
// 使い方: node scripts/auditSeoTech.mjs
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const res = {};

// sitemap
const sm = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
const urls = [...sm.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({ loc: m[1].match(/<loc>([^<]+)/)[1], lm: m[1].match(/<lastmod>([^<]+)/)?.[1] }));
const destUrls = urls.filter((u) => /\/destinations\/[^/]+\/$/.test(u.loc));
res['旅先ページで lastmod が無い'] = destUrls.filter((u) => !u.lm).length;
res['lastmod の形式が不正（YYYY-MM-DD でない）'] = urls.filter((u) => u.lm && !/^\d{4}-\d{2}-\d{2}$/.test(u.lm)).length;
res['lastmod が未来の日付'] = urls.filter((u) => u.lm && u.lm > today).length;
// sitemap の loc と、そのページの dist の canonical タグが、1文字も違わず一致しているか（2026-11-06）
{
  let noFile = 0, noCanon = 0, differ = 0, rawNonAscii = 0, lowerHex = 0; const ex = [];
  for (const u of urls) {
    if (/[^\x00-\x7f]/.test(u.loc)) rawNonAscii++;
    if (/%[0-9a-f]{2}/.test(u.loc.replace(/%[0-9A-F]{2}/g, ''))) lowerHex++;
    const p = u.loc.replace(/^https:\/\/tabidokoiko\.com/, '');
    const f = path.join(dist, p === '/' ? 'index.html' : path.join(decodeURIComponent(p), 'index.html'));
    if (!fs.existsSync(f)) { noFile++; continue; }
    const m = fs.readFileSync(f, 'utf8').match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/);
    if (!m) { noCanon++; continue; }
    if (m[1] !== u.loc) { differ++; if (ex.length < 3) ex.push([u.loc, m[1]]); }
  }
  res['sitemap の loc が日本語のまま（%エンコードでない）'] = rawNonAscii;
  res['sitemap の loc の16進が小文字'] = lowerHex;
  res['sitemap の loc に対応する dist のページが無い'] = noFile;
  res['sitemap のページに canonical タグが無い'] = noCanon;
  res['sitemap の loc と canonical が完全一致しない'] = differ;
  globalThis.__smCanon = { total: urls.length, ex };
}
const lmCount = urls.filter((u) => u.lm).length;

// 画像の縦横表
const dims = JSON.parse(fs.readFileSync(path.join(root, 'src/data/imageDims.json'), 'utf8'));
let dimBad = 0;
const keys = Object.keys(dims);
for (let i = 0; i < keys.length; i += 64) await Promise.all(keys.slice(i, i + 64).map(async (k) => {
  try { const m = await sharp(path.join(root, 'public', k)).metadata(); if (m.width !== dims[k][0] || m.height !== dims[k][1]) dimBad++; } catch { dimBad++; }
}));
const allFiles = []; const w2 = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w2(p); else if (/\.(jpe?g|png|webp)$/i.test(e.name)) allFiles.push('/' + path.relative(path.join(root, 'public'), p).split(path.sep).join('/')); } };
w2(path.join(root, 'public/images'));
res['画像の縦横表が実物とずれている（縦横違い・表に無い画像）'] = dimBad + allFiles.filter((k) => !dims[k]).length;

// dist の画像
const walk = (d, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (!['_astro', 'images', 'data'].includes(e.name)) walk(p, o); } else if (e.name.endsWith('.html')) o.push(p); } return o; };
let missingFile = 0, noDim = 0, heroNoFp = 0, heroLazy = 0, otherNoLazy = 0, noDimHome = 0, pagesChecked = 0;
for (const f of walk(dist)) {
  const rel = path.relative(dist, f);
  const isHome = rel === 'index.html';
  const target = /^(destinations|hub)\//.test(rel) || /-(oen|fukko)\//.test(rel + '/') || rel === 'kyushu-fukko/index.html';
  if (!target && !isHome) continue;
  pagesChecked++;
  const h = fs.readFileSync(f, 'utf8');
  for (const m of h.matchAll(/<img\b[^>]*>/g)) {
    const t = m[0];
    if (!/\ssrc="\/images\//.test(t)) continue;
    const hasDim = /\swidth="\d+"/.test(t) && /\sheight="\d+"/.test(t);
    const srcPath = t.match(/\ssrc="(\/images\/[^"]+)"/)[1];
    if (!fs.existsSync(path.join(root, 'public', decodeURI(srcPath)))) { missingFile++; continue; }
    if (!hasDim) { if (isHome) noDimHome++; else noDim++; }
    if (isHome) continue;
    const hero = /class="[^"]*(dest-hero-img|hub-hero-img)/.test(t);
    if (hero) { if (!/fetchpriority="high"/.test(t)) heroNoFp++; if (/loading="lazy"/.test(t)) heroLazy++; }
    else if (!/loading="lazy"/.test(t)) otherNoLazy++;
  }
}
res['自サイト画像に width/height が無い（旅先・ハブ・特設）'] = noDim;
res['ヒーロー画像に fetchpriority="high" が無い'] = heroNoFp;
res['ヒーロー画像が lazy になっている'] = heroLazy;
res['ヒーロー以外の画像に loading="lazy" が無い'] = otherNoLazy;

// フォント
const layout = fs.readFileSync(path.join(root, 'src/layouts/DestinationLayout.astro'), 'utf8');
res['フォントを @import で読んでいる'] = /@import\s+url\([^)]*fonts\.googleapis/.test(layout) ? 1 : 0;
res['フォントの <link> が無い'] = /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com/.test(layout) ? 0 : 1;

console.log(`sitemap ${urls.length} URL（lastmod あり ${lmCount}）・画像の縦横表 ${keys.length} 枚・検査したページ ${pagesChecked}`);
console.log(`sitemap と canonical の照合: ${urls.length}件`);
for (const [a, b] of globalThis.__smCanon.ex) console.log(`  不一致の例: ${a} ≠ ${b}`);
console.log(`参考: 実在しない画像を指す <img>（404になる）: ${missingFile}件`);
console.log(`参考: トップページの自サイト画像で width/height が無い: ${noDimHome}件`);
for (const [k, v] of Object.entries(res)) console.log(`${k}: ${v}件`);
process.exit(Object.values(res).some((v) => v) ? 1 : 0);
