#!/usr/bin/env node
// じゃらん /activity/?keyword= が UTF-8 / Shift_JIS のどちらを読むかを、ページ内の検索語の表示で確かめる（2026-10-13）
import iconv from 'iconv-lite';
import { encodeSjisParam } from './jalanUrl.js';
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
for (const w of process.argv.slice(2)) for (const [l, q] of [['UTF-8', encodeURIComponent(w)], ['SJIS', encodeSjisParam(w)]]) {
  const r = await fetch(`https://www.jalan.net/activity/?keyword=${q}`, { headers: { 'User-Agent': UA } });
  const buf = Buffer.from(await r.arrayBuffer());
  const html = iconv.decode(buf, 'Shift_JIS');
  const ti = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/\s+/g, ' ').trim();
  const vals = [...html.matchAll(/(?:value|content)="([^"]*)"/g)].map((m) => m[1]).filter((v) => v.includes(w) || /縺|繧|骼|�/.test(v));
  const cnt = (html.match(/([0-9,]+)\s*件/) || [])[0];
  console.log(`${w} ${l} status=${r.status} final=${r.url.slice(0, 80)} title=${ti?.slice(0, 50)} 件数=${cnt} 検索語の表示=${JSON.stringify(vals.slice(0, 3))}`);
}
