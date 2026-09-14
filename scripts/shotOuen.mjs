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
// --full でページ全体、--sel <CSS> でその要素だけを撮る（長いページの一部を読みたいとき用）
const args = process.argv.slice(2);
const full = args[0] === '--full';
let sel = null;
let rest = full ? args.slice(1) : args;
if (rest[0] === '--sel') { sel = rest[1]; rest = rest.slice(2); }
for (const id of rest) {
  await page.goto(`http://localhost:${PORT}/${id}/`, { waitUntil: 'networkidle' });
  const tag = `${id.replace(/\//g, '_')}${sel ? '_sel' : full ? '_full' : ''}`;
  const out = `logs/shots/ouen_${tag}.png`;
  if (sel) await page.locator(sel).first().screenshot({ path: out });
  else await page.screenshot({ path: out, fullPage: full });
  console.log(out);
}
await b.close(); server.close();
