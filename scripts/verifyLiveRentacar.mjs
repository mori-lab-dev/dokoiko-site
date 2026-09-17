#!/usr/bin/env node
/**
 * verifyLiveRentacar.mjs — 本番の全旅先ページに楽天レンタカーが残っていないかを確認する。
 * dist/destinations のページ一覧を元に本番（tabidokoiko.com）を取得し、
 *   ・楽天レンタカー（travel.rakuten.co.jp/cars/ 宛て、または「楽天レンタカー」の文言）が 0 件
 *   ・じゃらんレンタカーのリンクがある
 * を数える。GitHub Pages は連続取得で 429 を返すので、待ってから取り直す。
 *   node scripts/verifyLiveRentacar.mjs
 */
import fs from 'fs';

const BASE = 'https://tabidokoiko.com';
const CONCURRENCY = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ids = fs.readdirSync('dist/destinations', { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(`dist/destinations/${e.name}/index.html`))
  .map((e) => e.name);
const pages = [...ids.map((id) => `/destinations/${encodeURIComponent(id)}/`), '/privacy/'];

async function get(url) {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
    if (r.status === 429 || r.status >= 500) { await sleep(3000 * (i + 1)); continue; }
    return { status: r.status, text: await r.text() };
  }
  return { status: 429, text: '' };
}

let rakuten = [], noJalan = [], failed = [], ok = 0;
let next = 0;
async function worker() {
  while (next < pages.length) {
    const p = pages[next++];
    const { status, text } = await get(`${BASE}${p}?v=${Date.now()}`);
    if (status !== 200) { failed.push(`${status} ${p}`); continue; }
    ok++;
    if (/travel\.rakuten\.co\.jp(%2F|\/)cars/.test(text) || text.includes('楽天レンタカー')) rakuten.push(p);
    if (p.startsWith('/destinations/') && !/jalan\.net(%2F|\/)rentacar/.test(text)) noJalan.push(p);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`取得: ${ok} / ${pages.length} ページ`);
console.log(`楽天レンタカーが残っているページ: ${rakuten.length}`);
rakuten.slice(0, 10).forEach((p) => console.log('   ' + decodeURIComponent(p)));
console.log(`じゃらんレンタカーが無い旅先ページ: ${noJalan.length}`);
noJalan.slice(0, 10).forEach((p) => console.log('   ' + decodeURIComponent(p)));
console.log(`取得失敗: ${failed.length}`);
failed.slice(0, 10).forEach((p) => console.log('   ' + decodeURIComponent(p)));
process.exit(rakuten.length || failed.length ? 1 : 0);
