// 共有画像の変更前後を、実寸と横560pxの縮小版で並べて残す（2026-11-18）。変更前は logs/quiz_20261118b/before、変更後は public/quiz/og から。
import sharp from 'sharp';
import fs from 'node:fs';
const D = 'logs/quiz_20261118b'; fs.mkdirSync(`${D}/after`, { recursive: true }); fs.mkdirSync(`${D}/small`, { recursive: true });
const names = { '32eddad5': '隠岐の島', 'affbd838': '海士町', '5bf53d64': '西ノ島', 'e2069b2f': '鎌倉', 'ca39d0eb': '宮古島', 'a83fdb9e': '父島', '5476f082': '札幌' };
for (const code of Object.keys(names)) {
  fs.copyFileSync(`public/quiz/og/${code}.png`, `${D}/after/${code}.png`);
  const a = await sharp(`${D}/before/${code}.png`).resize(560).png().toBuffer(), b = await sharp(`${D}/after/${code}.png`).resize(560).png().toBuffer();
  fs.writeFileSync(`${D}/small/${code}_before_560.png`, a); fs.writeFileSync(`${D}/small/${code}_after_560.png`, b);
  const h = (await sharp(a).metadata()).height;
  await sharp({ create: { width: 1130, height: h, channels: 3, background: '#ffffff' } }).composite([{ input: a, left: 0, top: 0 }, { input: b, left: 570, top: 0 }]).png().toFile(`${D}/small/${code}_${names[code] === '隠岐の島' ? 'oki' : 'pair'}_before_after.png`);
  console.log(code, names[code], fs.statSync(`${D}/after/${code}.png`).size, 'バイト');
}
