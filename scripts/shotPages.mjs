// 見た目の前後比較用: スマホ幅(390px)で複数ページの全画面スクリーンショットを撮る（2026-11-04）。
// 使い方: node scripts/shotPages.mjs <出力フォルダ> [ベースURL=http://127.0.0.1:4311]
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const out = process.argv[2]; const base = process.argv[3] || 'http://127.0.0.1:4311';
fs.mkdirSync(out, { recursive: true });
const pages = ['/', '/destinations/niche_大分_3/', '/destinations/kurokawa-k/', '/destinations/kamakura/', '/ouen-wari/', '/miyazaki-oen/', '/hub/sapporo/', '/kyushu-fukko/'];
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
for (const p of pages) {
  const pg = await ctx.newPage();
  await pg.goto(base + encodeURI(p), { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await pg.addStyleTag({ content: '*{animation:none!important;transition:none!important}' });
  const h = await pg.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 600) { await pg.evaluate((v) => window.scrollTo(0, v), y); await pg.waitForTimeout(120); }
  await pg.evaluate(() => window.scrollTo(0, 0)); await pg.waitForTimeout(800);
  const name = (p === '/' ? 'home' : p.replace(/\//g, '_')) + '.png';
  await pg.screenshot({ path: path.join(out, name), fullPage: true });
  console.log(name, await pg.evaluate(() => document.documentElement.scrollHeight));
  await pg.close();
}
await b.close();
