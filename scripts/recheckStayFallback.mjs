#!/usr/bin/env node
/**
 * recheckStayFallback.mjs — 注目の宿(featured_stay)の宿名検索が 0 件で代替語に置き換えている分を再検索し、
 * 宿名で 1 件以上ヒットするようになっていれば置換表(src/data/stayKeywordFallback.json)から外す（2026-10-13）。
 * ヒットしないもの・判定できないもの(ブロック)は表に残す（現状維持）。
 * usage: node scripts/recheckStayFallback.mjs [--dry] [--delay 2500]
 */
import fs from 'fs';
import iconv from 'iconv-lite';
import { encodeSjisParam, toSjisSafe } from './jalanUrl.js';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const DELAY = Number(args.includes('--delay') ? args[args.indexOf('--delay') + 1] : 2500);
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILE = 'src/data/stayKeywordFallback.json';
const table = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));

async function probe(site, kw) {
  const url = site === 'rakuten'
    ? `https://kw.travel.rakuten.co.jp/keyword/Search.do?f_query=${encodeSjisParam(kw)}`
    : `https://www.jalan.net/uw/uwp2011/uww2011init.do?keyword=${encodeSjisParam(kw)}`;
  for (let a = 0; a < 4; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
      const html = iconv.decode(Buffer.from(await r.arrayBuffer()), 'Shift_JIS');
      const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
      if (r.status === 429 || r.status === 503 || /アクセスしにくい|混雑/.test(title)) { await sleep(8000 * (a + 1)); continue; }
      if (r.status !== 200) return { state: 'error', status: r.status };
      const count = site === 'rakuten' ? Number((html.match(/<em>([0-9,]+)<\/em>\s*件中/) || [])[1]?.replace(/,/g, '')) : null;
      return { state: /見つかりませんでした/.test(html) ? 'zero' : 'hit', count };
    } catch { await sleep(3000 * (a + 1)); }
  }
  return { state: 'blocked' };
}

const targets = [];
for (const d of dests) {
  const f = d.featured_stay;
  if (!f?.name || f.otaListed === false) continue;
  for (const site of ['rakuten', 'jalan']) {
    const t = table[site];
    const key = [f.name, f.name.normalize('NFD').replace(/[̀-ͯ]/g, '')].find((k) => t[k] !== undefined);
    if (key) targets.push({ id: d.id, site, name: f.name, key, now: t[key] });
  }
}
console.log(`再確認の対象: 注目の宿の置換 ${targets.length} 件（楽天 ${targets.filter((x) => x.site === 'rakuten').length} / じゃらん ${targets.filter((x) => x.site === 'jalan').length}）`);
const out = [];
for (const x of targets) {
  const r = await probe(x.site, toSjisSafe(x.name));
  out.push({ ...x, ...r });
  console.log(`  ${x.site.padEnd(7)} ${x.id.slice(0, 22).padEnd(22)} ${x.name.slice(0, 22).padEnd(22)} 現状→${x.now.slice(0, 10).padEnd(10)} 宿名検索=${r.state}${r.count ? ' ' + r.count + '件' : ''}`);
  await sleep(DELAY);
}
const restore = out.filter((x) => x.state === 'hit');
// 同じ語を別ページが使っている場合も同じ語なので、表から外してよい（宿名で検索して1件以上ヒット）
if (!DRY) {
  for (const x of restore) delete table[x.site][x.key];
  fs.writeFileSync(FILE, JSON.stringify(table, null, 1));
}
const tally = (s) => out.filter((x) => x.state === s).length;
console.log(`\n復元できる(宿名で1件以上) ${restore.length} / まだ0件 ${tally('zero')} / 判定不可 ${tally('blocked') + tally('error')}${DRY ? '（--dry: 表は変更していない）' : '（表から外した）'}`);
fs.writeFileSync('logs/stay_fallback_recheck.json', JSON.stringify(out, null, 1));
