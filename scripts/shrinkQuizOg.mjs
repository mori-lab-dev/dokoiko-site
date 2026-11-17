// 共有画像を横560pxに縮める（Xのタイムラインの縮小のイメージ）。usage: node scripts/shrinkQuizOg.mjs <出力フォルダ> <png...>
import sharp from 'sharp'; import path from 'path'; import fs from 'fs';
const [out, ...files] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
for (const f of files) await sharp(f).resize(560).png().toFile(path.join(out, path.basename(f, '.png') + '_560.png'));
