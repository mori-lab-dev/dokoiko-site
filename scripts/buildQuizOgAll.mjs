#!/usr/bin/env node
/**
 * buildQuizOgAll.mjs — 診断の結果ごとの共有画像 public/quiz/og/<code>.png を作る（2026-11-18）。
 *   1200×675・PNG（パレット）・メタデータなし（sharp は既定で書かない）。旅先名が主役。地図（結果画面と同じ輪郭 src/data/quizMap.json）の上に光る点。
 *   「この診断の1万通りの回答のうち、◯通りで1位になる旅先」（win が0ならこの行は出さない）・どこ行こ？ tabidokoiko.com・右下に小さく @mori__lab。
 * 文字は Noto Serif JP / Noto Sans JP（SIL Open Font License 1.1）をブラウザに読み込んで画像に焼き込む。フォントのファイルは dist にも public にも入れない。
 * 手順メモ: アカウント名が変わったら、ACCOUNT を直して `node scripts/buildQuizOgAll.mjs` で全件を作り直す（manifest が変わるので audit が古い画像を検出する）。
 *
 * usage: node scripts/buildQuizOgAll.mjs [--limit N] [--out public/quiz/og] [--only code,code]
 *   --limit は試作用（先頭から N 件）。既定は全件。src/data/quizOgManifest.json に、画像ごとの中身のハッシュを書く（全件作ったときだけ）。
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { ACCOUNT, contentHash as hash } from './lib/quizOg.mjs';

const args = process.argv.slice(2);
const val = (f, d = null) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const LIMIT = Number(val('--limit', Infinity));
const OUT = val('--out', 'public/quiz/og');
const ONLY = val('--only') ? new Set(val('--only').split(',')) : null;
const data = JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('src/data/quizMap.json', 'utf8'));
const mainFrame = map.frames.find((f) => f.key === 'main');

const contentHash = (d) => hash(d, map);

const MAPW = 560, S = MAPW / map.width, MAPH = Math.round(map.height * S);
const frameSvg = map.frames.map((f) => {
  const [x0, y0, x1, y1] = f.box;
  const frame = f.key === 'main' ? '' : `<rect x="${x0 - 6}" y="${y0 - 6}" width="${x1 - x0 + 12}" height="${y1 - y0 + 12}" rx="6" fill="none" stroke="#b9ad92" stroke-width="2.4" stroke-dasharray="7 6"/>`;
  return `${frame}<path d="${f.path}" fill="#e4d9bf" stroke="#9a8d72" stroke-width="1.6" stroke-linejoin="round"/>`;
}).join('');
const page = (d) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;700&family=Noto+Sans+JP:wght@400;500&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:675px; overflow:hidden; background:#f6f1e4; position:relative; }
  .label { position:absolute; left:64px; top:70px; font:500 27px 'Noto Sans JP',sans-serif; letter-spacing:.12em; color:#8a6a2c; }
  .name { position:absolute; left:64px; top:118px; width:548px; height:292px; display:flex; align-items:flex-end; }
  .name span { display:block; font:700 112px/1.12 'Noto Serif JP',serif; color:#25231f; letter-spacing:.02em; word-break:break-all; }
  .pref { position:absolute; left:68px; top:424px; font:500 36px 'Noto Sans JP',sans-serif; letter-spacing:.1em; color:#4a463d; }
  .win { position:absolute; left:68px; top:488px; width:540px; font:400 24px/1.6 'Noto Sans JP',sans-serif; color:#6b6252; }
  .win b { font-weight:500; color:#c4452d; font-size:30px; }
  .brand { position:absolute; left:68px; bottom:40px; font:500 26px 'Noto Serif JP',serif; letter-spacing:.08em; color:#25231f; }
  .brand span { font:400 20px 'Noto Sans JP',sans-serif; letter-spacing:.12em; color:#7d745f; margin-left:14px; }
  .acct { position:absolute; right:30px; bottom:22px; font:400 17px 'Noto Sans JP',sans-serif; letter-spacing:.06em; color:#9b927c; }
  svg { position:absolute; left:${1200 - MAPW - 24}px; top:${Math.round((675 - MAPH) / 2) - 6}px; }
</style></head><body>
  <div class="label">あなたに似合う旅先は</div>
  <div class="name"><span id="nm">${d.name}</span></div>
  <div class="pref">${d.prefecture}</div>
  ${d.win > 0 ? `<div class="win">この診断の1万通りの回答のうち、<br><b>${d.win.toLocaleString('ja-JP')}</b>通りで1位になる旅先</div>` : ''}
  <svg width="${MAPW}" height="${MAPH}" viewBox="0 0 ${map.width} ${map.height}">${frameSvg}
    <circle cx="${d.x}" cy="${d.y}" r="62" fill="#c4452d" fill-opacity=".14"/><circle cx="${d.x}" cy="${d.y}" r="40" fill="#c4452d" fill-opacity=".26"/>
    <circle cx="${d.x}" cy="${d.y}" r="22" fill="#c4452d" fill-opacity=".55"/><circle cx="${d.x}" cy="${d.y}" r="12" fill="#c4452d" stroke="#f6f1e4" stroke-width="4"/>
  </svg>
  <div class="brand">どこ行こ？<span>tabidokoiko.com</span></div>
  <div class="acct">${ACCOUNT}</div>
</body></html>`;

const todo = data.filter((d) => !ONLY || ONLY.has(d.code)).slice(0, LIMIT);
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 });
const pg = await ctx.newPage();
const t0 = Date.now(); const sizes = []; const manifest = {};
for (const d of todo) {
  await pg.setContent(page(d), { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  // 旅先名: 枠に収まる最大の大きさにする（長い名前は小さく）
  await pg.evaluate(() => { const e = document.getElementById('nm'); let fs = 120; e.style.fontSize = fs + 'px'; while (e.offsetHeight > 292 && fs > 40) { fs -= 4; e.style.fontSize = fs + 'px'; } });
  const shot = await pg.screenshot({ type: 'png' });
  const png = await sharp(shot).png({ palette: true, colours: 24, dither: 0, compressionLevel: 9, effort: 10 }).toBuffer();
  fs.writeFileSync(path.join(OUT, `${d.code}.png`), png);
  sizes.push(png.length); manifest[d.code] = contentHash(d);
}
await browser.close();
const sum = sizes.reduce((s, v) => s + v, 0);
console.log(`${todo.length}枚 ${((Date.now() - t0) / 1000).toFixed(1)}秒 / 1枚あたり 平均${Math.round(sum / sizes.length)}バイト 最小${Math.min(...sizes)} 最大${Math.max(...sizes)} 合計${sum}バイト`);
if (todo.length === data.length) { fs.writeFileSync('src/data/quizOgManifest.json', JSON.stringify(manifest) + '\n'); console.log('manifest を書いた'); }
