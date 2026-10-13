// dist を静的サーバで配り、指定ページのスクリーンショットを撮る（目視確認用）。
// usage: node scripts/shotPages.mjs outdir path1 path2 ...   例: node scripts/shotPages.mjs /tmp/shots /ouen-wari/ /kagoshima-oen/
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const [outDir, ...pages] = process.argv.slice(2);
const ROOT = path.join(process.cwd(), 'dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(4455);
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 1 });
for (const pg of pages) {
  const p = await ctx.newPage();
  await p.goto(`http://127.0.0.1:4455${pg}`, { waitUntil: 'load' });
  await p.waitForTimeout(600);
  const name = pg.replace(/\//g, '_').replace(/^_|_$/g, '') || 'index';
  await p.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  console.log(`${pg} → ${name}.png  badge: ${await p.$$eval('[data-status-badge], .ow-card-badge', (els) => els.map((e) => e.textContent.trim()).slice(0, 4).join(' / '))}`);
  await p.close();
}
await b.close(); srv.close();
