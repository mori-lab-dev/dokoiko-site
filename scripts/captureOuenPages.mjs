#!/usr/bin/env node
/** captureHitouPages.mjs — 追加した秘湯ページを実機相当で開き、画像欠損と横スクロールを検査する。 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'dist');
const PORT = 4402;
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); res.end('404'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

// 対象はdistの実物から拾う。ページを足すたびにここを書き換えるのを忘れて
// 検査から漏れる（実際にkagoshima-oenが漏れた）ので、一覧を手で持たない。
const areaSlugs = JSON.parse(fs.readFileSync('src/data/kagoshimaAreas.json', 'utf8')).map((a) => a.slug);
const IDS = [
  'ouen-wari',
  ...fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.endsWith('-oen'))
    .map((e) => e.name).sort(),
  ...areaSlugs.map((s) => `kagoshima-oen/${s}`),
];

fs.mkdirSync('logs/shots', { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: 'ja-JP' });
const page = await ctx.newPage();
let ng = 0;
for (const id of IDS) {
  const r = await page.goto(`http://localhost:${PORT}/${id}/`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    await new Promise((done) => { let y = 0; const s = () => { y += innerHeight; scrollTo(0, y);
      if (y < document.body.scrollHeight) setTimeout(s, 90); else { scrollTo(0, 0); setTimeout(done, 350); } }; s(); });
  });
  await page.waitForLoadState('networkidle');
  const own = await page.evaluate((pid) => {
    // 自分のページの画像だけを見る（関連destinationのカードは既存データ側の問題なので除外）
    const list = [...document.images].filter((i) => true);
    return { total: list.length, broken: list.filter((i) => !i.complete || i.naturalWidth === 0).length };
  }, id);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const title = await page.title();
  const bad = !r.ok() || own.broken > 0 || overflow;
  if (bad) ng++;
  await page.screenshot({ path: `logs/shots/ouen_${id.replace(/\//g, '_')}.png`, fullPage: false });
  console.log(`${bad ? '❌' : '✅'} ${String(r.status())} ${id.padEnd(26)} 自ページ画像${own.total}枚 欠損${own.broken} 横スクロール${overflow ? 'あり' : 'なし'}  ${title.slice(0, 42)}`);
}
await page.goto(`http://localhost:${PORT}/destinations/kuronagi/`, { waitUntil: 'networkidle' });
await page.screenshot({ path: 'logs/shots/dest-kuronagi.png' });
await browser.close();
server.close();
console.log(ng ? `\nNG ${ng}件` : '\n✅ 全ページ正常');
process.exit(ng ? 1 : 0);
