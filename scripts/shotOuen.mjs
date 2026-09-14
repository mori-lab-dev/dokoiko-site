#!/usr/bin/env node
/** shotOuen.mjs — 応援割ページの見た目を実寸(390x844)で確かめる。 */
import { chromium } from 'playwright';
import fs from 'fs';
import http from 'http';
import path from 'path';
const PORT = 4351;
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
fs.mkdirSync('logs/shots', { recursive: true });
for (const id of process.argv.slice(2)) {
  await page.goto(`http://localhost:${PORT}/${id}/`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `logs/shots/ouen_${id}.png`, fullPage: false });
  console.log(`logs/shots/ouen_${id}.png`);
}
await b.close(); server.close();
