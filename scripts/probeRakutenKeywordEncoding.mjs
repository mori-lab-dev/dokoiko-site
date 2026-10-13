#!/usr/bin/env node
/**
 * probeRakutenKeywordEncoding.mjs — 楽天トラベルのキーワード検索が UTF-8 / Shift_JIS のどちらの f_query を正しく読むかを、
 * ブラウザ（Playwright）で表示して確かめる（2026-10-13）。じゃらんは Shift_JIS 必須（scripts/jalanUrl.js）。楽天も同種の問題が無いかの検査用。
 * usage: node scripts/probeRakutenKeywordEncoding.mjs 鎌倉 箱根 "星のや京都"
 */
import { chromium } from 'playwright';
import { encodeSjisParam } from './jalanUrl.js';

const words = process.argv.slice(2);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const b = await chromium.launch();
const ctx = await b.newContext({ userAgent: UA, locale: 'ja-JP' });
for (const w of words) {
  for (const [label, q] of [['UTF-8', encodeURIComponent(w)], ['SJIS ', encodeSjisParam(w)]]) {
    const p = await ctx.newPage();
    const url = `https://kw.travel.rakuten.co.jp/keyword/Search.do?f_query=${q}`;
    try {
      await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.waitForTimeout(1500);
      const title = await p.title();
      const body = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
      const hit = (body.match(/([0-9,]+)\s*件/) || [])[0] || '';
      const zero = /見つかりませんでした|該当する[^ ]{0,10}ありません|0\s*件/.test(body);
      console.log(`${w}  ${label}  title=${title.replace(/\s+/g, ' ').slice(0, 40)}  hit=${hit}  zero=${zero}  final=${p.url().slice(0, 90)}`);
    } catch (e) { console.log(`${w} ${label} ERR ${e.message.slice(0, 60)}`); }
    await p.close();
  }
}
await b.close();
