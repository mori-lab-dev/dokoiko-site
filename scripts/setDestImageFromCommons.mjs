#!/usr/bin/env node
/**
 * setDestImageFromCommons.mjs — 指定した Commons ファイルを destination の main 画像にする（人が選んだ1枚を入れるとき。2026-10-13）。
 * 1600px に縮め（mozjpeg q80）、出典（著作者・ライセンス・URL）を extmetadata から取り、保存後に Commons から取り直して画素照合する。
 * usage: node scripts/setDestImageFromCommons.mjs <destination id> "File:タイトル.jpg"
 */
import fs from 'fs';
import sharp from 'sharp';
const [id, title] = process.argv.slice(2);
const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];
const info = async () => Object.values((await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600&titles=${encodeURIComponent(title)}`, { headers: UA })).json()).query.pages)[0].imageinfo?.[0];
const ii = await info();
if (!ii) { console.error('Commons にそのファイルが無い'); process.exit(1); }
const lic = ii.extmetadata.LicenseShortName?.value || '';
if (!/^(CC BY|CC0|Public domain|PD|Attribution)/i.test(lic) || /NC|ND/.test(lic)) { console.error(`ライセンスが使えない: ${lic}`); process.exit(1); }
const get = async () => Buffer.from(await (await fetch(ii.thumburl || ii.url, { headers: UA })).arrayBuffer());
const buf = await get();
const out = `public/images/${id}/main.jpg`;
fs.mkdirSync(`public/images/${id}`, { recursive: true });
await sharp(buf).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true, progressive: true }).toFile(out);
const fp = (b) => sharp(b).resize(64, 36, { fit: 'fill' }).greyscale().raw().toBuffer();
const a = await fp(fs.readFileSync(out)), b = await fp(await get());
let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
const diff = +(s / a.length).toFixed(1);
const credit = { author: (ii.extmetadata.Artist?.value || '').replace(/<[^>]*>/g, '').trim() || 'unknown', license: lic,
  url: ii.descriptionurl, attributionRequired: true };
for (const f of FILES) {
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  const d = data.find((x) => x.id === id);
  d.images = [`/images/${id}/main.jpg`]; d.imageCredit = credit;
  fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n');
}
console.log(`✅ ${id} ← ${title}（${credit.author}・${lic}・画素差 ${diff}）`);
