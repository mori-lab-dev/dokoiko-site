#!/usr/bin/env node
/**
 * auditFeaturedStayLinks.mjs — featured_stay(424件) のリンク到達性を検証する。
 * アフィリのラッパではなく「実際の遷移先」を取り出して HTTP を確認する。
 *   - 個別URL（jalan yad… / rakuten HOTEL/…）: 全件チェック
 *   - 宿名検索フォールバック: 同一形式のためサンプリング
 * 検出のみ。
 */
import fs from 'fs';
import { jalanKeywordSearchTarget } from './jalanUrl.js';
import { rakutenKeywordSearchTarget } from './rakutenUrl.js';

const D = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept-Language': 'ja' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function check(url, tries = 2) {
  for (let i = 0; i < tries; i++) {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 15000);
      const r = await fetch(url, { headers: UA, redirect: 'follow', signal: c.signal });
      clearTimeout(t);
      const b = Buffer.from(await r.arrayBuffer());
      let h = b.toString('utf8');
      if (/�/.test(h.slice(0, 2000))) { try { h = new TextDecoder('shift_jis').decode(b); } catch {} }
      const ti = (h.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() || '';
      if (/アクセスしにくい|混雑/.test(ti)) { await sleep(8000 * (i + 1)); continue; }
      return { status: r.status, title: ti, finalUrl: r.url };
    } catch { await sleep(2500 * (i + 1)); }
  }
  return { status: 'BLOCKED', title: '', finalUrl: '' };
}

const feats = D.filter(d => d.featured_stay);
const explicit = [], fallback = [];
for (const d of feats) {
  const f = d.featured_stay;
  if (f.jalanUrl)   explicit.push({ d, kind: 'じゃらん個別', url: f.jalanUrl });
  if (f.rakutenUrl) explicit.push({ d, kind: '楽天個別',   url: f.rakutenUrl });
  if (!f.jalanUrl && !f.rakutenUrl) fallback.push({ d, name: f.name });
}
console.log(`featured_stay ${feats.length}件 / 個別URL ${explicit.length}件 / 宿名検索フォールバックのみ ${fallback.length}件\n`);

const ng = [], blocked = [], redirected = [];
let ok = 0, i = 0;
for (const e of explicit) {
  const r = await check(e.url);
  i++;
  if (i % 25 === 0) process.stderr.write(`  ${i}/${explicit.length}（OK ${ok} / NG ${ng.length} / 判定不可 ${blocked.length}）\n`);
  if (r.status === 'BLOCKED') { blocked.push({ ...e, ...r }); }
  else if (r.status !== 200 || /エラー画面|見つかり/.test(r.title)) { ng.push({ ...e, ...r }); }
  else {
    ok++;
    // 個別ページのはずが検索/一覧に飛ばされていないか
    if (/rstLst|hotellist|uww2011init|Search\.do|\/yado\/[a-z]+\/?$/.test(r.finalUrl)) redirected.push({ ...e, ...r });
  }
  await sleep(1300);
}

// フォールバック（宿名検索）はサンプリング
const sample = fallback.slice(0, 12);
const fbNg = [];
console.log(`\n宿名検索フォールバックのサンプル ${sample.length}件を確認…`);
for (const s of sample) {
  const rk = rakutenKeywordSearchTarget(s.name); // Shift_JIS 必須（UTF-8 だと文字化けして 0 件・2026-10-13）
  const jl = jalanKeywordSearchTarget(s.name);
  const a = await check(rk); await sleep(900);
  const b = await check(jl); await sleep(900);
  if (a.status !== 200) fbNg.push({ id: s.d.id, name: s.name, which: '楽天検索', ...a });
  if (b.status !== 200) fbNg.push({ id: s.d.id, name: s.name, which: 'じゃらん検索', ...b });
}

console.log(`\n${'═'.repeat(68)}`);
console.log(`個別URL: OK ${ok} / ❌NG ${ng.length} / 判定不可(ブロック) ${blocked.length} / ⚠️一覧へリダイレクト ${redirected.length}`);
console.log(`フォールバック検索: サンプル${sample.length}件 × 2サイト → 異常 ${fbNg.length}件`);
console.log(`${'═'.repeat(68)}`);
if (ng.length) { console.log('\n❌ 到達不可（404等）'); for (const x of ng) console.log(`  [${x.d.id}] ${x.d.name} — ${x.d.featured_stay.name}\n     ${x.kind} ${x.url}\n     status=${x.status} title=${x.title.slice(0, 40)}`); }
if (redirected.length) { console.log('\n⚠️ 個別ページのはずが一覧/検索に着地'); for (const x of redirected) console.log(`  [${x.d.id}] ${x.d.featured_stay.name} → ${x.finalUrl.slice(0, 80)}`); }
if (blocked.length) { console.log(`\n△ 判定不可（サイト側の一時ブロック）: ${blocked.length}件`); for (const x of blocked.slice(0, 8)) console.log(`  [${x.d.id}] ${x.d.featured_stay.name}`); }
if (fbNg.length) { console.log('\n❌ フォールバック検索の異常'); for (const x of fbNg) console.log(`  [${x.id}] ${x.name} ${x.which} status=${x.status}`); }

fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync('logs/featured_stay_links.json', JSON.stringify({ ok, ng, blocked, redirected, fbNg }, null, 2));
