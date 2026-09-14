#!/usr/bin/env node
/**
 * diagSpotImageOrigin.mjs — ローカルspot画像が「どの取得経路で入ったか」を寸法から切り分ける。
 *
 * 出所を突き止める前に、そもそもどのスクリプトが取ったのかを知りたい。
 * 取得元ごとに横幅が決まっているので、そこから絞り込める。
 *   fetchSpotImages.js  Commons の iiurlwidth=1000  → 幅1000
 *   pixabayFetchAll.js  Pixabay の largeImageURL    → 幅1280
 *   Wikipedia summary   originalimage              → まちまち
 * 再圧縮(3671fc0a)は1600px上限の縮小なので、1600以下の画像の幅は変わっていない。
 *
 * usage: node scripts/diagSpotImageOrigin.mjs
 */
import fs from 'fs';
import { execFileSync } from 'child_process';

const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const paths = [];
for (const d of dests) {
  for (const s of d.spots || []) {
    if (s && typeof s === 'object' && s.imageUrl?.startsWith('/images/spots/') && !s.imageCredit) {
      paths.push(`public${s.imageUrl}`);
    }
  }
}

/** JPEGのSOFマーカーから寸法を読む（sipsを1枚ずつ呼ぶより速い） */
function size(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

const tally = new Map();
let missing = 0;
for (const p of paths) {
  if (!fs.existsSync(p)) { missing++; continue; }
  const s = size(fs.readFileSync(p));
  const k = s ? String(s.w) : 'JPEGでない';
  tally.set(k, (tally.get(k) || 0) + 1);
}

console.log(`ローカルspot画像（クレジット無し） ${paths.length}枚 / ファイル欠落 ${missing}枚`);
console.log('\n横幅の分布');
for (const [w, n] of [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  const via = w === '1000' ? 'Commons(fetchSpotImages)' : w === '1280' ? 'Pixabay(largeImageURL)の可能性' : '';
  console.log(`  ${String(w).padStart(6)}px  ${String(n).padStart(4)}枚  ${via}`);
}

// git履歴に再圧縮前のバイト列が残っているか
let hasOld = 0;
for (const p of paths.slice(0, 60)) {
  try { execFileSync('git', ['cat-file', '-e', `3671fc0a^:${p}`], { stdio: 'ignore' }); hasOld++; } catch { /* 無い */ }
}
console.log(`\n再圧縮前のバイト列が git に残っているもの: 先頭60枚のうち ${hasOld}枚`);
