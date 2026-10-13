#!/usr/bin/env node
/**
 * probeDistLinkInBrowser.mjs — dist の旅先ページにある宿検索リンクを、アフィリのラッパーごとブラウザで踏み、
 * 着地ページのタイトル（検索語がどう読まれたか）と件数を出す（2026-10-13）。
 * usage: node scripts/probeDistLinkInBrowser.mjs kamakura [id ...]
 */
import fs from 'fs';
import { chromium } from 'playwright';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const b = await chromium.launch();
const ctx = await b.newContext({ userAgent: UA, locale: 'ja-JP' });
for (const id of process.argv.slice(2)) {
  const html = fs.readFileSync(`dist/destinations/${id}/index.html`, 'utf8');
  const hrefs = [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;|&#38;/g, '&')))]
    .filter((h) => /hb\.afl\.rakuten|valuecommerce/.test(h) && !/rentacar|cars/.test(decodeURIComponent(h)) && !/activity/.test(decodeURIComponent(h)));
  for (const h of hrefs.slice(0, 4)) {
    const p = await ctx.newPage();
    try {
      await p.goto(h, { waitUntil: 'domcontentloaded', timeout: 40000 });
      await p.waitForTimeout(1500);
      const body = (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ');
      console.log(`${id}  ${h.includes('rakuten') ? '楽天' : 'じゃらん'}  title=${(await p.title()).replace(/\s+/g, ' ').slice(0, 50)}  件数=${(body.match(/[0-9,]+\s*件/) || [''])[0]}  着地=${p.url().slice(0, 100)}`);
    } catch (e) { console.log(`${id} ERR ${e.message.slice(0, 80)}`); }
    await p.close();
  }
}
await b.close();
