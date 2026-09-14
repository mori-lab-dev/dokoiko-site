#!/usr/bin/env node
/**
 * auditIndexability.mjs — 配信リポジトリの全HTMLを見て、検索に載らない状態のページを洗う。
 *
 *   ① <meta name="robots" content="noindex"> が付いているページ
 *   ② {id}.html のリダイレクトスタブが、正規の {id}/index.html を隠していないか
 *      （2026-07-07に事故があった generateRedirects.js 由来の再発確認）
 *   ③ sitemap.xml に全destinationが載っているか
 *   ④ canonical が自分以外を指しているページ（「代替ページ」の内訳）
 *
 * 配信リポジトリ(../dokoiko)を直接読む。本番と同じ中身なので速くて正確。
 */
import fs from 'fs';
import path from 'path';

const DEPLOY = path.resolve('../dokoiko');
const SITE = 'https://tabidokoiko.com';
const DATA = 'src/data/destinations.json';

const dests = JSON.parse(fs.readFileSync(DATA, 'utf8'));
const destIds = dests.map((d) => d.id);

// ── HTMLを集める ───────────────────────────────
const htmls = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) htmls.push(p);
  }
})(DEPLOY);

const rel = (p) => path.relative(DEPLOY, p);
const meta = (html, key) =>
  (html.match(new RegExp(`<meta\\s+(?:name|property)="${key}"[^>]*content="([^"]*)"`, 'i')) || [])[1] ?? null;
const canonicalOf = (html) =>
  (html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i) || [])[1] ?? null;

// ── ① noindex ────────────────────────────────
const noindex = [];
const canonicals = new Map();      // 正規化canonical → [ページ]
const selfCanon = [];
const crossCanon = [];
const noCanon = [];

for (const p of htmls) {
  const html = fs.readFileSync(p, 'utf8');
  const robots = meta(html, 'robots');
  if (robots && /noindex/i.test(robots)) {
    noindex.push({ page: rel(p), robots, stub: /移動中/.test(html) });
  }
  const canon = canonicalOf(html);
  // このファイルが配信されるURL。日本語IDはcanonical側がパーセント
  // エンコードされているので、比較するときは両方デコードして揃える。
  const url = SITE + '/' + rel(p).replace(/index\.html$/, '').replace(/\\/g, '/');
  if (!canon) {
    noCanon.push(rel(p));
  } else {
    const dec = (u) => { try { return decodeURIComponent(u); } catch { return u; } };
    const norm = dec(canon).replace(/\/$/, '');
    canonicals.set(norm, [...(canonicals.get(norm) || []), rel(p)]);
    if (norm === dec(url).replace(/\/$/, '')) selfCanon.push(rel(p));
    else crossCanon.push({ page: rel(p), canonical: canon, url });
  }
}

console.log('■ 配信HTML', htmls.length, '件');
console.log(`\n① noindex が付いているページ: ${noindex.length}件`);
for (const n of noindex.slice(0, 40)) {
  console.log(`   ${n.page}   robots="${n.robots}"${n.stub ? '  ← 「移動中」スタブ' : ''}`);
}
if (noindex.length > 40) console.log(`   … ほか${noindex.length - 40}件`);

// ── ② スタブが正規ページを隠していないか ─────────────
const destDir = path.join(DEPLOY, 'destinations');
const stubs = [];
if (fs.existsSync(destDir)) {
  for (const e of fs.readdirSync(destDir)) {
    if (!e.endsWith('.html') || e === 'index.html') continue;
    const slug = e.slice(0, -5);
    const stubPath = path.join(destDir, e);
    const realPath = path.join(destDir, slug, 'index.html');
    const stubHtml = fs.readFileSync(stubPath, 'utf8');
    const isStub = /移動中/.test(stubHtml);
    const realExists = fs.existsSync(realPath);
    const realIsStub = realExists && /移動中/.test(fs.readFileSync(realPath, 'utf8'));
    stubs.push({ slug, isStub, realExists, realIsStub,
      shadows: isStub && realExists && !realIsStub });
  }
}
const shadowing = stubs.filter((s) => s.shadows);
console.log(`\n② destinations/ の {id}.html スタブ: ${stubs.length}件`);
console.log(`   正規ページを隠しているもの: ${shadowing.length}件`);
for (const s of shadowing.slice(0, 20)) console.log(`   ❌ ${s.slug}.html が ${s.slug}/index.html を隠している`);

// ── ③ sitemap ────────────────────────────────
const smPath = path.join(DEPLOY, 'sitemap.xml');
console.log('\n③ sitemap.xml');
if (!fs.existsSync(smPath)) {
  console.log('   ❌ sitemap.xml が無い');
} else {
  const xml = fs.readFileSync(smPath, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const inSm = new Set(locs.map((u) => u.replace(/\/$/, '')));
  console.log(`   <loc> の総数: ${locs.length}`);
  const destLocs = locs.filter((u) => u.includes('/destinations/') && !u.endsWith('/destinations/'));
  console.log(`   うち destination: ${destLocs.length}  （データ上は ${destIds.length}件）`);

  const missing = destIds.filter((id) => !inSm.has(`${SITE}/destinations/${encodeURI(id)}`)
    && !inSm.has(`${SITE}/destinations/${id}`));
  console.log(`   sitemapに無いdestination: ${missing.length}件`);
  for (const id of missing.slice(0, 30)) console.log(`      - ${id}`);
  if (missing.length > 30) console.log(`      … ほか${missing.length - 30}件`);

  // sitemapにあるのに実体が無いURL
  const orphan = destLocs.filter((u) => {
    const id = decodeURIComponent(u.replace(`${SITE}/destinations/`, '').replace(/\/$/, ''));
    return !fs.existsSync(path.join(destDir, id, 'index.html'));
  });
  console.log(`   sitemapにあるが実体が無い: ${orphan.length}件`);
  for (const u of orphan.slice(0, 10)) console.log(`      - ${u}`);

  // sitemapに載っているのにnoindexのもの
  const niSet = new Set(noindex.map((n) => SITE + '/' + n.page.replace(/index\.html$/, '').replace(/\/$/, '')));
  const conflict = locs.filter((u) => niSet.has(u.replace(/\/$/, '')));
  console.log(`   sitemapに載っているのにnoindex: ${conflict.length}件`);
  for (const u of conflict.slice(0, 10)) console.log(`      - ${u}`);
}

// ── ④ canonical の内訳 ───────────────────────────
console.log('\n④ canonical の内訳');
console.log(`   自分自身を指す（正常）      ${selfCanon.length}件`);
console.log(`   他ページを指す（代替ページ扱い） ${crossCanon.length}件`);
console.log(`   canonicalが無い            ${noCanon.length}件`);
for (const c of crossCanon.slice(0, 30)) {
  console.log(`   - ${c.page}\n       canonical → ${c.canonical}`);
}
if (crossCanon.length > 30) console.log(`   … ほか${crossCanon.length - 30}件`);

const dupCanon = [...canonicals.entries()].filter(([, v]) => v.length > 1);
console.log(`\n   同じcanonicalを指すページが複数ある: ${dupCanon.length}組`);
for (const [c, pages] of dupCanon.slice(0, 15)) {
  console.log(`   - ${c}`);
  for (const p of pages) console.log(`       ${p}`);
}

const ng = noindex.length + shadowing.length;
console.log(`\n${ng ? `要確認 ${ng}件` : '✅ noindexもスタブ事故も無し'}`);
