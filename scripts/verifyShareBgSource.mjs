#!/usr/bin/env node
/**
 * verifyShareBgSource.mjs — シェア画像の背景に使う写真が、クレジット先の
 * Commonsファイルと本当に同じものかを確かめる。
 *
 * 画像にクレジットを焼き込む以上、作者名とライセンスが間違っていると
 * そのまま表示義務違反になる。destinations.json の imageCredit.url を鵜呑みにせず、
 * その Commons ファイルを実際に落としてピクセルを比べる。
 * 手元のファイルは再圧縮されているのでバイト一致はしない。
 * 縮小してグレースケールにした画素の差で見る。
 *
 * usage: node scripts/verifyShareBgSource.mjs <destination-id> [...]
 */
import fs from 'fs';
import sharp from 'sharp';

const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));

/** 64x36に潰したグレースケールの平均絶対差。同じ写真なら数以下に収まる */
async function fingerprint(buf) {
  return await sharp(buf).resize(64, 36, { fit: 'fill' }).greyscale().raw().toBuffer();
}
const diff = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return +(s / a.length).toFixed(1);
};

for (const id of process.argv.slice(2)) {
  const d = dests.find((x) => x.id === id);
  const c = d?.imageCredit;
  const local = `public/images/${id}/main.jpg`;
  if (!d || !c?.url || !fs.existsSync(local)) { console.log(`❌ ${id} 必要なものが揃っていない`); continue; }

  const title = decodeURIComponent(c.url.split('/wiki/')[1] || '');
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo'
    + `&iiprop=url|extmetadata&iiurlwidth=1200&titles=${encodeURIComponent(title)}`;
  const j = await (await fetch(api, { headers: UA, signal: AbortSignal.timeout(30000) })).json();
  const ii = Object.values(j?.query?.pages || {})[0]?.imageinfo?.[0];
  if (!ii) { console.log(`❌ ${id} Commonsに ${title} が無い`); continue; }

  const remote = Buffer.from(await (await fetch(ii.thumburl || ii.url, { headers: UA, signal: AbortSignal.timeout(40000) })).arrayBuffer());
  const dd = diff(await fingerprint(fs.readFileSync(local)), await fingerprint(remote));
  const strip = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const meta = ii.extmetadata || {};
  console.log(`${dd <= 6 ? '✅' : '❌'} ${id.padEnd(20)} 画素差 ${String(dd).padStart(5)}  ${title}`);
  console.log(`     データ側  ${c.author} / ${c.license}`);
  console.log(`     Commons側 ${strip(meta.Artist?.value)} / ${strip(meta.LicenseShortName?.value)}`);
}
