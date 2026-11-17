#!/usr/bin/env node
/**
 * buildQuizOg.mjs — 診断（/quiz/）のOGP画像 public/images/quiz_og.png を作る（2026-11-17）。
 * 文字だけ（写真は使わない）・1200×675・100KB以下。メタデータ（EXIF など）は付けない。
 *   usage: node scripts/buildQuizOg.mjs
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';

const OUT = 'public/images/quiz_og.png';
const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400&family=Noto+Sans+JP:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:675px; overflow:hidden; background:#1e4d38; }
  .card { width:1200px; height:675px; background:#1e4d38; color:#fff; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; position:relative; }
  .eyebrow { font-family:'Noto Sans JP',sans-serif; font-weight:400; font-size:20px; letter-spacing:0.5em; text-indent:0.5em; color:#C9A84C; margin-bottom:34px; }
  .title { font-family:'Noto Serif JP',serif; font-weight:400; font-size:92px; letter-spacing:0.06em; text-indent:0.06em; line-height:1.3; }
  .rule { width:84px; height:2px; background:#C9A84C; margin:42px 0 34px; }
  .sub { font-family:'Noto Serif JP',serif; font-weight:300; font-size:36px; letter-spacing:0.1em; text-indent:0.1em; color:#e8f1ec; }
  .foot { position:absolute; left:0; right:0; bottom:42px; display:flex; justify-content:space-between; padding:0 60px; font-family:'Noto Sans JP',sans-serif; font-size:20px; letter-spacing:0.14em; color:#b9d2c5; }
  .foot b { font-family:'Noto Serif JP',serif; font-weight:400; font-size:26px; letter-spacing:0.1em; color:#fff; }
</style></head><body><div class="card">
  <div class="eyebrow">TRAVEL MATCH</div>
  <div class="title">あなたに似合う旅先は？</div>
  <div class="rule"></div>
  <div class="sub">12の質問で、旅先がみつかる</div>
  <div class="foot"><b>どこ行こ？</b><span>tabidokoiko.com</span></div>
</div></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const shot = await page.screenshot({ type: 'png' });
await browser.close();
// 平らな色の文字画像なので、パレットに減らして軽くする（写真・位置情報は無い。sharp は既定でメタデータを書かない）
const png = await sharp(shot).png({ palette: true, colours: 32, compressionLevel: 9, effort: 10 }).toBuffer();
fs.writeFileSync(OUT, png);
const m = await sharp(png).metadata();
console.log(`${OUT}: ${m.width}x${m.height} ${png.length}バイト exif=${m.exif ? 'あり' : 'なし'}`);
