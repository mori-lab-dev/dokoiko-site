// width/height 属性を付けても見た目（画像の大きさ・ページの高さ）が変わらないかを、実ブラウザで確かめる（2026-11-04）。
// 各ページを開き、画像を読み込ませたうえで、全画像の寸法を測り、width/height 属性を外して測り直して比べる。
// 属性が見た目に影響する（CSSに height:auto などが無い）画像があれば NG として出す。
// 使い方: node scripts/checkImgAttrLayout.mjs [ベースURL=http://127.0.0.1:4311] [件数=40]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.argv[2] || 'http://127.0.0.1:4311';
const N = Number(process.argv[3] || 40);
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const hubs = JSON.parse(fs.readFileSync(path.join(root, 'src/data/hubCities.json'), 'utf8'));
const areas = JSON.parse(fs.readFileSync(path.join(root, 'src/data/kagoshimaAreas.json'), 'utf8'));
// 決まったページ + 旅先を等間隔に抜き取る
const fixed = ['/', '/destinations/', '/kyushu-fukko/', '/ouen-wari/', ...['kagoshima-oen', 'kagoshima-fukko', 'fukuoka-oen', 'miyazaki-oen', 'kumamoto-oen', 'nagasaki-oen', 'oita-oen', 'saga-oen'].map((s) => `/${s}/`), ...areas.map((a) => `/kagoshima-oen/${a.slug}/`), ...hubs.filter((_, i) => i % 6 === 0).map((h) => `/hub/${h.id}/`)];
const step = Math.max(1, Math.floor(dests.length / N));
const pages = [...fixed, ...dests.filter((_, i) => i % step === 0).map((d) => `/destinations/${d.id}/`)];
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
let ng = 0, imgs = 0;
for (const p of pages) {
  const pg = await ctx.newPage();
  const r = await pg.goto(base + encodeURI(p), { waitUntil: 'load', timeout: 60000 }).catch(() => null);
  if (!r || r.status() !== 200) { console.log('SKIP', p, r?.status()); await pg.close(); continue; }
  await pg.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  const h = await pg.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) { await pg.evaluate((v) => window.scrollTo(0, v), y); await pg.waitForTimeout(60); }
  await pg.waitForTimeout(500);
  const res = await pg.evaluate(() => {
    const all = [...document.querySelectorAll('img[width][height]')];
    const m = () => all.map((i) => { const r = i.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
    const before = m(), docBefore = document.documentElement.scrollHeight;
    const saved = all.map((i) => [i.getAttribute('width'), i.getAttribute('height')]);
    all.forEach((i) => { i.removeAttribute('width'); i.removeAttribute('height'); });
    const after = m(), docAfter = document.documentElement.scrollHeight;
    all.forEach((i, k) => { i.setAttribute('width', saved[k][0]); i.setAttribute('height', saved[k][1]); });
    const diffs = [];
    all.forEach((i, k) => { if (Math.abs(before[k][0] - after[k][0]) > 1 || Math.abs(before[k][1] - after[k][1]) > 1) diffs.push(`${i.className || i.tagName} ${before[k]}→${after[k]} ${i.getAttribute('src').slice(-30)}`); });
    return { n: all.length, diffs: diffs.slice(0, 3), nd: diffs.length, docBefore, docAfter };
  });
  imgs += res.n;
  const bad = res.nd || Math.abs(res.docBefore - res.docAfter) > 1;
  if (bad) { ng++; console.log('NG', p, `画像${res.n} 差${res.nd} ページ高 ${res.docAfter}→${res.docBefore}`, res.diffs); }
  await pg.close();
}
await b.close();
console.log(`${pages.length} ページ・属性つき画像 ${imgs} 枚を確認: ${ng ? ng + ' ページで見た目が変わる' : '属性の有無で見た目は変わらない'}`);
process.exit(ng ? 1 : 0);
