#!/usr/bin/env node
// 指定の検索語でじゃらん宿検索をブラウザ・curl 相当で開き、結果を見る（2026-10-13・404の切り分け）
import { chromium } from 'playwright';
import { jalanKeywordSearchTarget } from './jalanUrl.js';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const b = await chromium.launch(); const ctx = await b.newContext({ userAgent: UA, locale: 'ja-JP' });
for (const w of process.argv.slice(2)) {
  const p = await ctx.newPage();
  const r = await p.goto(jalanKeywordSearchTarget(w), { waitUntil: 'domcontentloaded', timeout: 40000 }).catch((e) => ({ status: () => 'ERR ' + e.message.slice(0, 40) }));
  console.log(`${w} → status=${r.status()} title=${(await p.title()).slice(0, 60)} final=${p.url().slice(0, 100)}`);
  await p.close();
}
await b.close();
