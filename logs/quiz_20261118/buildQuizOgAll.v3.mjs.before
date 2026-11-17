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

// 丸い枠（スタンプ）に入れる地図。選ばれた旅先の周りへ寄せて、どこなのかが分かる大きさにする。点は朱色。発光・ぼかしは使わない
const STAMP = 300, ZOOM = 2.6;
const frameSvg = map.frames.map((f) => {
  const [x0, y0, x1, y1] = f.box;
  const frame = f.key === 'main' ? '' : `<rect x="${x0 - 6}" y="${y0 - 6}" width="${x1 - x0 + 12}" height="${y1 - y0 + 12}" rx="6" fill="none" stroke="#c9bd9f" stroke-width="2.4" stroke-dasharray="7 6"/>`;
  return `${frame}<path d="${f.path}" fill="#dccfae" stroke="#7d7155" stroke-width="1.8" stroke-linejoin="round"/>`;
}).join('');
const page = (d) => {
  const k = ZOOM, vw = STAMP / (STAMP / map.width) ; // 論理座標での円の幅 = map.width / k
  const half = map.width / k / 2;                     // 円の半径（論理座標）
  const vb = `${(d.x - half).toFixed(1)} ${(d.y - half).toFixed(1)} ${(half * 2).toFixed(1)} ${(half * 2).toFixed(1)}`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:675px; overflow:hidden; background:#f2eadb; position:relative; }
  .label { position:absolute; left:64px; top:60px; font:500 22px/1.7 'Noto Sans JP',sans-serif; letter-spacing:.08em; color:#8b6b2f; width:260px; }
  .stage { position:absolute; left:340px; top:56px; width:460px; height:520px; display:flex; justify-content:center; align-items:flex-start; gap:30px; }
  .pref { writing-mode:vertical-rl; font:500 30px/1.3 'Noto Sans JP',sans-serif; letter-spacing:.3em; color:#5a5446; padding-top:6px; }
  .name { writing-mode:vertical-rl; font:700 96px/1.15 'Noto Serif JP',serif; color:#1f1d1a; letter-spacing:.04em; max-height:520px; }
  .stamp { position:absolute; left:850px; top:56px; width:${STAMP}px; height:${STAMP}px; border-radius:50%; border:3px solid #1f1d1a; background:#f7f1e3; overflow:hidden; }
  .stamp svg { position:absolute; left:0; top:0; display:block; }
  .stamp::after { content:''; position:absolute; inset:8px; border-radius:50%; border:1px solid #1f1d1a; }
  .badge { position:absolute; left:850px; top:392px; width:${STAMP}px; text-align:center; padding:9px 0 10px; border:1.8px solid #1f1d1a; border-radius:999px; font:500 24px 'Noto Sans JP',sans-serif; letter-spacing:.05em; color:#1f1d1a; background:#f7f1e3; }
  .badge b { font:700 32px 'Noto Sans JP',sans-serif; color:#c8321f; margin:0 3px; }
  .brand { position:absolute; left:64px; bottom:34px; font:400 17px 'Noto Sans JP',sans-serif; letter-spacing:.14em; color:#7d7461; }
  .brand b { font:500 19px 'Noto Serif JP',serif; letter-spacing:.1em; color:#3b372f; margin-right:10px; }
  .rule { position:absolute; left:64px; right:64px; top:604px; height:1px; background:#cdbfa0; }
  .seal { position:absolute; right:66px; bottom:30px; width:62px; height:62px; background:#c8321f; border-radius:7px; transform:rotate(-4deg); color:#f6efe0; display:flex; align-items:center; justify-content:center; text-align:center; font:700 14px/1.25 'Noto Sans JP',sans-serif; letter-spacing:.04em; }
  .seal::before { content:''; position:absolute; inset:4px; border:1.5px solid #f6efe0; border-radius:4px; opacity:.85; }
</style></head><body>
  <div class="label">あなたに似合う<br>旅先は</div>
  <div class="stage"><div class="pref">${d.prefecture}</div><div class="name" id="nm">${d.name}</div></div>
  <div class="stamp"><svg width="${STAMP}" height="${STAMP}" viewBox="${vb}">${frameSvg}
    <circle cx="${d.x}" cy="${d.y}" r="30" fill="none" stroke="#c8321f" stroke-width="5"/><circle cx="${d.x}" cy="${d.y}" r="13" fill="#c8321f" stroke="#f7f1e3" stroke-width="4"/></svg></div>
  ${d.win > 0 ? `<div class="badge">1万通り中 <b>${d.win.toLocaleString('ja-JP')}</b>通りで1位</div>` : ''}
  <div class="rule"></div>
  <div class="brand"><b>どこ行こ？</b>tabidokoiko.com</div>
  <div class="seal"><span>${ACCOUNT.replace('@mori', '@mori<br>')}</span></div>
</body></html>`;
};

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
  await pg.evaluate(() => { const e = document.getElementById('nm'); let L = [...e.textContent].length; let fs = L <= 3 ? 112 : L <= 5 ? 92 : L <= 8 ? 76 : 64; e.style.fontSize = fs + 'px'; while ((e.offsetWidth > 270 || e.offsetHeight > 520) && fs > 36) { fs -= 4; e.style.fontSize = fs + 'px'; } });
  const shot = await pg.screenshot({ type: 'png' });
  const png = await sharp(shot).png({ palette: true, colours: 24, dither: 0, compressionLevel: 9, effort: 10 }).toBuffer();
  fs.writeFileSync(path.join(OUT, `${d.code}.png`), png);
  sizes.push(png.length); manifest[d.code] = contentHash(d);
}
await browser.close();
const sum = sizes.reduce((s, v) => s + v, 0);
console.log(`${todo.length}枚 ${((Date.now() - t0) / 1000).toFixed(1)}秒 / 1枚あたり 平均${Math.round(sum / sizes.length)}バイト 最小${Math.min(...sizes)} 最大${Math.max(...sizes)} 合計${sum}バイト`);
if (todo.length === data.length) { fs.writeFileSync('src/data/quizOgManifest.json', JSON.stringify(manifest) + '\n'); console.log('manifest を書いた'); }
