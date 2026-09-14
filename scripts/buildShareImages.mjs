#!/usr/bin/env node
/**
 * buildShareImages.mjs — X投稿用のシェア画像を作る。
 *
 * 旧 brand_share は写真の上に緑を opacity 0.72 でかぶせていたため、
 * 写真がほとんど見えず、タイムラインでは緑の板に文字が乗っているだけに見えていた。
 * 写真を主役にし、文字は下端のスクリムの上に小さく置く構成に変える。
 *
 * 背景写真の条件
 *   ・継承義務のないライセンス（CC BY / CC0 / パブリックドメイン）に限る。
 *     CC BY-SA を背景にすると合成物まで同じ条件で配布する義務が生じるため。
 *   ・クレジット先の Commons ファイルと実際に同じ写真であることを
 *     verifyShareBgSource.mjs で確かめてから使う。作者名を焼き込む以上、
 *     取り違えたままだとそのまま表示義務違反になる。
 *
 * usage: node scripts/buildShareImages.mjs [キー...]   キー省略で全部
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import fs from 'node:fs';

const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const count = dests.length.toLocaleString();

const SHEETS = {
  // サイト全体のシェア画像
  default: {
    out: 'public/images/share_default.jpg',
    destId: 'kamikochi',
    place: '上高地（長野県）',
    lead: `全国 ${count} か所から、次の旅先が決まる。`,
  },
  // かごしま観光応援割のページ用
  kagoshima: {
    out: 'public/images/share_kagoshima.jpg',
    destId: 'sakurajima-onsen',   // 画像の中身は霧島温泉郷。遠景に桜島が写る
    place: '霧島温泉郷（鹿児島県）',
    lead: 'かごしま観光応援割で行く、鹿児島の宿と旅先。',
    eyebrow: 'かごしま観光応援割',
  },
};

const keys = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHEETS);

const browser = await chromium.launch();
for (const key of keys) {
  const s = SHEETS[key];
  if (!s) { console.error(`❌ 未知のキー: ${key}`); process.exitCode = 1; continue; }
  const d = dests.find((x) => x.id === s.destId);
  const c = d?.imageCredit;
  const photo = `public/images/${s.destId}/main.jpg`;
  if (!c || !fs.existsSync(photo)) { console.error(`❌ ${key}: 写真かクレジットが無い`); process.exitCode = 1; continue; }
  if (/BY-SA/i.test(c.license)) { console.error(`❌ ${key}: ${c.license} は継承義務があるので背景に使えない`); process.exitCode = 1; continue; }

  const credit = `Photo: ${c.author} / ${c.license}`;
  const b64 = fs.readFileSync(photo).toString('base64');

  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400&family=Noto+Sans+JP:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:1200px; height:675px; overflow:hidden; }
  .card { position:relative; width:1200px; height:675px; background:#0d1f18; overflow:hidden; }
  .bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
  /* 写真は素のまま見せる。文字が乗る下端だけを暗く落とす。 */
  /* ロゴとドメインは明るい被写体の上に乗ることがあるので、下端は確実に落とす */
  .scrim { position:absolute; left:0; right:0; bottom:0; height:68%;
    background:linear-gradient(to bottom, rgba(8,22,17,0) 0%, rgba(8,22,17,0.34) 38%,
      rgba(8,22,17,0.72) 72%, rgba(8,22,17,0.93) 100%); }
  /* 上端にもごく薄くかけて、空が白飛びしている写真でも締まって見えるようにする */
  .top { position:absolute; left:0; right:0; top:0; height:26%;
    background:linear-gradient(to bottom, rgba(8,22,17,0.34) 0%, rgba(8,22,17,0) 100%); }

  .place { position:absolute; top:34px; left:54px;
    font-family:'Noto Sans JP',sans-serif; font-size:15px; letter-spacing:0.16em;
    color:rgba(255,255,255,0.86); text-shadow:0 1px 10px rgba(0,0,0,0.5); }
  .eyebrow { position:absolute; top:34px; right:54px;
    font-family:'Noto Sans JP',sans-serif; font-size:13px; letter-spacing:0.18em;
    color:#0d1f18; background:#C9A84C; padding:7px 14px; border-radius:3px; font-weight:500; }

  .foot { position:absolute; left:54px; right:54px; bottom:46px; }
  .logo { font-family:'Noto Serif JP',serif; font-weight:400; font-size:62px;
    letter-spacing:0.08em; text-indent:0.08em; line-height:1.15; color:#fff;
    text-shadow:0 2px 20px rgba(0,0,0,0.55); }
  .logo-en { font-family:'Noto Sans JP',sans-serif; font-weight:300; font-size:12px;
    letter-spacing:0.46em; text-indent:0.46em; color:rgba(255,255,255,0.62); margin-top:9px; }
  .rule { width:54px; height:2px; background:#C9A84C; margin:20px 0 16px; }
  .lead { font-family:'Noto Sans JP',sans-serif; font-weight:300; font-size:22px;
    letter-spacing:0.06em; color:rgba(255,255,255,0.95);
    text-shadow:0 2px 14px rgba(0,0,0,0.5); }
  .domain { position:absolute; right:54px; bottom:52px;
    font-family:'Noto Sans JP',sans-serif; font-size:16px; letter-spacing:0.16em;
    color:rgba(255,255,255,0.84); text-shadow:0 1px 10px rgba(0,0,0,0.5); }
  .credit { position:absolute; left:54px; bottom:18px;
    font-family:'Noto Sans JP',sans-serif; font-size:10px; letter-spacing:0.04em;
    color:rgba(255,255,255,0.44); }
</style></head><body>
<div class="card">
  <img class="bg" src="data:image/jpeg;base64,${b64}">
  <div class="top"></div>
  <div class="scrim"></div>
  <div class="place">${s.place}</div>
  ${s.eyebrow ? `<div class="eyebrow">${s.eyebrow}</div>` : ''}
  <div class="foot">
    <div class="logo">どこ行こ？</div>
    <div class="logo-en">DOKOIKO</div>
    <div class="rule"></div>
    <div class="lead">${s.lead}</div>
  </div>
  <div class="domain">tabidokoiko.com</div>
  <div class="credit">${credit}</div>
</div></body></html>`;

  const page = await browser.newPage({ viewport: { width: 1200, height: 675 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  const png = await page.screenshot({ type: 'png' });
  await page.close();

  await sharp(png).jpeg({ quality: 88, mozjpeg: true, progressive: true, chromaSubsampling: '4:4:4' }).toFile(s.out);
  const st = fs.statSync(s.out);
  const m = await sharp(s.out).metadata();
  console.log(`✅ ${s.out}  ${m.width}x${m.height} / ${(st.size / 1024).toFixed(0)}KB`);
  console.log(`   背景 ${photo}  ${credit}`);
}
await browser.close();
