#!/usr/bin/env node
// じゃらん /activity/?keyword= をブラウザで開き、検索語が入力欄・見出しに反映されるかを見る（2026-10-13）
import { chromium } from 'playwright';
import { encodeSjisParam } from './jalanUrl.js';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const b = await chromium.launch(); const ctx = await b.newContext({ userAgent: UA, locale: 'ja-JP' });
for (const w of process.argv.slice(2)) for (const [l, q] of [['UTF-8', encodeURIComponent(w)], ['SJIS', encodeSjisParam(w)]]) {
  const p = await ctx.newPage();
  await p.goto(`https://www.jalan.net/activity/?keyword=${q}`, { waitUntil: 'networkidle', timeout: 40000 }).catch(() => {});
  const vals = await p.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.value).filter(Boolean));
  const body = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
  console.log(`${w} ${l} final=${p.url().slice(0, 90)} 入力欄=${JSON.stringify(vals.slice(0, 4))} 本文に検索語=${body.includes(w)}`);
  await p.close();
}
await b.close();
