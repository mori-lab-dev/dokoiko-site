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
import { clusterDots, radiusFor, clusterScale } from '../src/lib/quizCluster.js';

const args = process.argv.slice(2);
const val = (f, d = null) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const LIMIT = Number(val('--limit', Infinity));
const OUT = val('--out', 'public/quiz/og');
const ONLY = val('--only') ? new Set(val('--only').split(',')) : null;
const data = JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('src/data/quizMap.json', 'utf8'));
const mainFrame = map.frames.find((f) => f.key === 'main');

const contentHash = (d) => hash(d, map);

// 日本全体の点の地図（2026-11-18 v4）。旅先1,191件を小さな墨色の点で打ち、選ばれた旅先だけ朱色の点を細い朱色の輪で囲む。
// 輪郭は塗りつぶさず、ごく薄い線だけ。沖縄・小笠原は今の別枠（quizMap.json の3枠）のまま。発光・ぼかし・暗い紺地は使わない
const MAPW = 560, SC = MAPW / map.width, MAPH = Math.round(map.height * SC);
const LAND = '#ddd0b0', INKLINE = '#4a463d';   // 陸は紙色より少し濃く・海岸線は細い墨線・県境はごく薄い墨線
const outlineSvg = map.frames.map((f) => {
  const [x0, y0, x1, y1] = f.box;
  const frame = f.key === 'main' ? '' : `<rect x="${x0 - 6}" y="${y0 - 6}" width="${x1 - x0 + 12}" height="${y1 - y0 + 12}" rx="6" fill="#f2eadb" stroke="#bfb298" stroke-width="1.8" stroke-dasharray="6 6"/>`;
  return `${frame}<path d="${f.path}" fill="${LAND}" stroke="none"/><path d="${f.pref}" fill="none" stroke="${INKLINE}" stroke-opacity=".18" stroke-width="1.1" stroke-linejoin="round"/><path d="${f.path}" fill="none" stroke="${INKLINE}" stroke-opacity=".75" stroke-width="1.3" stroke-linejoin="round"/>`;
}).join('');
// 近い点は1つにまとめて描く（画面上で約14px以内。画像の中の地図は幅560pxなので、論理座標で 14/0.56 = 25）。選ばれた旅先はまとめず、本当の位置に朱の輪。
const CLUSTER_RADIUS = radiusFor(SC);
const dotsFor = (d) => {
  const idx = data.indexOf(d);
  return clusterDots(data, CLUSTER_RADIUS, new Set([idx])).map((c) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${(2.8 * clusterScale(c.m.length)).toFixed(2)}"/>`).join('');
};
const page = (d) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:675px; overflow:hidden; background:#f2eadb; position:relative; }
  .label { position:absolute; left:64px; top:60px; font:500 22px/1.7 'Noto Sans JP',sans-serif; letter-spacing:.08em; color:#8b6b2f; width:230px; }
  .stage { position:absolute; left:210px; top:150px; width:300px; height:430px; display:flex; justify-content:center; align-items:flex-start; gap:26px; }
  .pref { writing-mode:vertical-rl; font:500 28px/1.3 'Noto Sans JP',sans-serif; letter-spacing:.3em; color:#5a5446; padding-top:6px; }
  .name { writing-mode:vertical-rl; font:700 92px/1.15 'Noto Serif JP',serif; color:#1f1d1a; letter-spacing:.04em; max-height:430px; }
  .map { position:absolute; left:${1200 - MAPW - 44}px; top:36px; }
  .badge { position:absolute; left:64px; bottom:92px; display:inline-block; padding:8px 20px 9px; border:1.8px solid #1f1d1a; border-radius:999px; font:500 22px 'Noto Sans JP',sans-serif; letter-spacing:.05em; color:#1f1d1a; background:#f7f1e3; }
  .badge b { font:700 30px 'Noto Sans JP',sans-serif; color:#c8321f; margin:0 3px; }
  .brand { position:absolute; left:64px; bottom:34px; font:400 17px 'Noto Sans JP',sans-serif; letter-spacing:.14em; color:#7d7461; }
  .brand b { font:500 19px 'Noto Serif JP',serif; letter-spacing:.1em; color:#3b372f; margin-right:10px; }
  .rule { position:absolute; left:64px; right:64px; top:604px; height:1px; background:#cdbfa0; }
  .seal { position:absolute; right:64px; bottom:36px; width:120px; height:34px; background:#c8321f; border-radius:4px; transform:rotate(-2deg); color:#fbf5e8; display:flex; align-items:center; justify-content:center; font:700 17px/1 'Noto Sans JP',sans-serif; letter-spacing:.05em; white-space:nowrap; }
</style></head><body>
  <div class="label">あなたに似合う<br>旅先は</div>
  <div class="stage"><div class="pref">${d.prefecture}</div><div class="name" id="nm">${d.name}</div></div>
  <svg class="map" width="${MAPW}" height="${MAPH}" viewBox="0 0 ${map.width} ${map.height}">${outlineSvg}
    <g fill="#46423b" fill-opacity=".62">${dotsFor(d)}</g>
    <circle cx="${d.x}" cy="${d.y}" r="42" fill="none" stroke="#f6f0e2" stroke-width="10"/><circle cx="${d.x}" cy="${d.y}" r="42" fill="none" stroke="#c8321f" stroke-width="4.5"/><circle cx="${d.x}" cy="${d.y}" r="13" fill="#c8321f"/></svg>
  ${d.win > 0 ? `<div class="badge">1万通り中 <b>${d.win.toLocaleString('ja-JP')}</b>通りで1位</div>` : ''}
  <div class="rule"></div>
  <div class="brand"><b>どこ行こ？</b>tabidokoiko.com</div>
  <div class="seal">${ACCOUNT}</div>
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
  await pg.evaluate(() => { const e = document.getElementById('nm'); let L = [...e.textContent].length; let fs = L <= 3 ? 104 : L <= 5 ? 88 : L <= 8 ? 72 : 60; e.style.fontSize = fs + 'px'; while ((e.offsetWidth > 250 || e.offsetHeight > 430) && fs > 34) { fs -= 4; e.style.fontSize = fs + 'px'; } });
  const shot = await pg.screenshot({ type: 'png' });
  const png = await sharp(shot).png({ palette: true, colours: 16, dither: 0, compressionLevel: 9, effort: 10 }).toBuffer();
  fs.writeFileSync(path.join(OUT, `${d.code}.png`), png);
  sizes.push(png.length); manifest[d.code] = contentHash(d);
}
await browser.close();
const sum = sizes.reduce((s, v) => s + v, 0);
console.log(`${todo.length}枚 ${((Date.now() - t0) / 1000).toFixed(1)}秒 / 1枚あたり 平均${Math.round(sum / sizes.length)}バイト 最小${Math.min(...sizes)} 最大${Math.max(...sizes)} 合計${sum}バイト`);
if (todo.length === data.length) { fs.writeFileSync('src/data/quizOgManifest.json', JSON.stringify(manifest) + '\n'); console.log('manifest を書いた'); }
