#!/usr/bin/env node
/**
 * shotStayBatch.mjs — featured_stay 追加後の標準確認スクショ。
 * 標準フローの4枚（トップ hero / トップ 地域カード / 直島 記事上部 / 直島 宿セクション）に加え、
 * 今回追加した宿カードを撮る。
 *   node scripts/shotStayBatch.mjs <出力ディレクトリ> [destinationId ...] [--sel=<CSSセレクタ>]
 *   --sel を付けると宿カードの代わりにそのセレクタの位置を撮る
 */
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';

const OUT = process.argv[2];
const SEL_ARG = process.argv.find((a) => a.startsWith('--sel='));
const SEL = SEL_ARG ? SEL_ARG.slice(6) : '.fs-card';
const EXTRA = process.argv.slice(3).filter((a) => !a.startsWith('--sel='));
if (!OUT) { console.error('出力ディレクトリを指定すること'); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.json': 'application/json', '.woff2': 'font/woff2' };
const PORT = 4361;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join('dist', p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(PORT, r));

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const base = `http://localhost:${PORT}`;
async function shot(url, file, selector) {
  await page.goto(base + url, { waitUntil: 'networkidle' });
  if (selector) {
    const el = page.locator(selector).first();
    if (await el.count()) {
      await el.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -60));
    } else {
      console.log(`  （${selector} が無いのでページ上部を撮る）`);
    }
  }
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, file) });
  console.log('撮影', file);
}

await shot('/', 'トップ_hero.png', null);
await shot('/', 'トップ_地域カード.png', '.jp-region');
await shot('/destinations/naoshima/', '直島_記事上部.png', null);
await shot('/destinations/naoshima/', '直島_宿セクション.png', '.fs-card, .hotel-section');
for (const id of EXTRA) {
  await shot(`/destinations/${encodeURIComponent(id)}/`, `${SEL === '.fs-card' ? '宿カード' : 'セクション'}_${id}.png`, SEL);
}
await b.close();
server.close();
