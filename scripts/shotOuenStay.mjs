#!/usr/bin/env node
/** shotOuenStay.mjs — 宿カード（公式リンク併記）の見た目を確かめる。 */
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';
const PORT = 4353;
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join('dist', p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  const ext = path.extname(f);
  res.writeHead(200, { 'Content-Type': ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : ext === '.jpg' ? 'image/jpeg' : 'application/octet-stream' });
  res.end(fs.readFileSync(f));
});
await new Promise((r) => server.listen(PORT, r));
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${PORT}/kumamoto-oen/`, { waitUntil: 'networkidle' });
const sec = page.locator('.kf-stays');
await sec.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: 'logs/shots/ouen_stays.png' });
const rows = await page.evaluate(() => [...document.querySelectorAll('.kf-stay')].slice(0, 6).map((s) => ({
  name: s.querySelector('.kf-stay-name')?.textContent?.trim(),
  official: s.querySelector('.kf-stay-official')?.getAttribute('href') ?? null,
})));
console.log(JSON.stringify(rows, null, 1));
await b.close(); server.close();
