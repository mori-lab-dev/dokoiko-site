// 自サイトの画像（public/images 配下）の縦横を読んで src/data/imageDims.json に書く（2026-11-04）。
// <img> の width/height 属性に使う（レイアウトのずれ(CLS)を防ぐ）。ヘッダだけ読むので速い。
// 使い方: node scripts/buildImageDims.mjs
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'public');
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(jpe?g|png|webp)$/i.test(e.name)) files.push(p); } };
walk(path.join(base, 'images'));
const out = {}; let bad = 0;
for (let i = 0; i < files.length; i += 64) {
  await Promise.all(files.slice(i, i + 64).map(async (f) => {
    try { const m = await sharp(f).metadata(); const key = '/' + path.relative(base, f).split(path.sep).join('/'); if (m.width && m.height) out[key] = [m.width, m.height]; else bad++; } catch { bad++; }
  }));
}
const sorted = Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
fs.writeFileSync(path.join(root, 'src/data/imageDims.json'), JSON.stringify(sorted) + '\n');
console.log(`画像 ${files.length} 枚中 ${Object.keys(out).length} 枚の縦横を記録（読めない ${bad}）`);
