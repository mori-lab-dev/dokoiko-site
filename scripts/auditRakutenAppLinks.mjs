#!/usr/bin/env node
/**
 * auditRakutenAppLinks.mjs — 楽天リンクが「楽天アプリを起動しない」かを実測で監査する。
 *
 * なぜ要るか（2026-09-17 実測）:
 *   楽天トラベルの AASA は /HOTEL/* や /yado/*\/* をアプリの対象にしている。
 *   さらにアフィリのリダイレクタ hb.afl.rakuten.co.jp は、宛先によって
 *   /travel/…（これもアプリ対象）を経由させる。じゃらんで実機確認した
 *   「リダイレクト途中でアプリ対象URLに着地するとアプリが起動する」と同じ構図になるので、
 *   HTML上の見た目のURLではなく、リダイレクトの全段を AASA と突き合わせる。
 *
 * やること:
 *   1. dist の HTML から楽天リンクを全部拾い、宛先の「形」ごとにまとめる
 *   2. 形ごとに代表URLを iPhone の UA で1本ずつ追跡し、全段の URL を記録する
 *   3. 各段のホストの AASA を取得し、どれかのアプリの対象になっていないか判定する
 *
 * 使い方:
 *   node scripts/auditRakutenAppLinks.mjs            # 監査。アプリ対象の形が1つでもあれば exit 1
 *   node scripts/auditRakutenAppLinks.mjs --verbose  # 各段の判定も表示
 */
import fs from 'fs';
import path from 'path';

const VERBOSE = process.argv.includes('--verbose');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 1. dist から楽天リンクを集めて形ごとにまとめる ────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const decodeEntities = (s) => s.replace(/&amp;/g, '&').replace(/&#38;/g, '&').replace(/&quot;/g, '"');

function shapeOf(href) {
  let u;
  try { u = new URL(href); } catch { return null; }
  if (!/rakuten\.co\.jp$/.test(u.hostname)) return null;
  let target = u;
  let wrap = '(直リンク)';
  if (u.hostname === 'hb.afl.rakuten.co.jp') {
    wrap = 'hb.afl' + u.pathname.replace(/\/[0-9a-f.]+\/?$/i, '/<id>/');
    const pc = u.searchParams.get('pc');
    if (pc) { try { target = new URL(pc); } catch { /* noop */ } }
  }
  const p = target.pathname
    .replace(/\d+/g, 'N')
    .replace(/^\/yado\/[a-z_-]+\/[a-z_-]+\.html$/, '/yado/<県>/<エリア>.html')
    .replace(/^\/yado\/[a-z_-]+\/$/, '/yado/<県>/');
  return `${wrap} → ${target.hostname}${p}`;
}

const shapes = new Map(); // shape → { count, pages:Set, sample }
for (const file of walk('dist')) {
  const html = fs.readFileSync(file, 'utf8');
  for (const m of html.matchAll(/href="([^"]*rakuten\.co\.jp[^"]*)"/g)) {
    const href = decodeEntities(m[1]);
    const shape = shapeOf(href);
    if (!shape) continue;
    const s = shapes.get(shape) || { count: 0, pages: new Set(), sample: href };
    s.count++; s.pages.add(file);
    shapes.set(shape, s);
  }
}

// ── 2. AASA の取得と判定 ─────────────────────────────────────────────
const aasaCache = new Map();
async function aasaFor(host) {
  if (aasaCache.has(host)) return aasaCache.get(host);
  let json = null;
  for (const p of ['/.well-known/apple-app-site-association', '/apple-app-site-association']) {
    try {
      const r = await fetch(`https://${host}${p}`, { headers: { 'User-Agent': IPHONE_UA } });
      if (r.ok) { json = await r.json(); break; }
    } catch { /* 取れなければ対象なし扱い */ }
  }
  aasaCache.set(host, json);
  return json;
}

// AASA の glob: * は0文字以上（/ を含む）、? は1文字
function globToRe(g) {
  return new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
}
function componentMatches(c, u) {
  if (c['/'] !== undefined && !globToRe(c['/']).test(u.pathname)) return false;
  const q = c['?'];
  if (q !== undefined) {
    if (typeof q === 'string') {
      if (!globToRe(q).test(u.search.replace(/^\?/, ''))) return false;
    } else {
      for (const [k, v] of Object.entries(q)) {
        const got = u.searchParams.get(k);
        if (got === null || !globToRe(v).test(got)) return false;
      }
    }
  }
  if (c['#'] !== undefined && !globToRe(c['#']).test(u.hash.replace(/^#/, ''))) return false;
  return true;
}

/** そのURLをアプリ対象にしている appID の一覧（空ならブラウザで開く） */
function claimingApps(aasa, u) {
  const apps = [];
  for (const det of aasa?.applinks?.details || []) {
    const ids = det.appIDs || (det.appID ? [det.appID] : []);
    let verdict = null; // true=対象 / false=除外 / null=どれにも当たらない
    if (Array.isArray(det.components)) {
      for (const c of det.components) {
        if (componentMatches(c, u)) { verdict = !c.exclude; break; }
      }
    } else if (Array.isArray(det.paths)) {
      const full = u.pathname + u.search;
      for (const p of det.paths) {
        const neg = p.startsWith('NOT ');
        const pat = neg ? p.slice(4) : p;
        if (globToRe(pat).test(u.pathname) || globToRe(pat).test(full)) { verdict = !neg; break; }
      }
    }
    if (verdict) apps.push(...ids);
  }
  return apps;
}

// ── 3. リダイレクトを1段ずつ追う ─────────────────────────────────────
async function trace(start) {
  const hops = [];
  let url = start;
  for (let i = 0; i < 12; i++) {
    hops.push(url);
    let r;
    try {
      r = await fetch(url, { headers: { 'User-Agent': IPHONE_UA }, redirect: 'manual' });
    } catch (e) {
      return { hops, status: `ERR ${e.message}` };
    }
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc) {
      url = new URL(loc, url).href;
      continue;
    }
    return { hops, status: r.status };
  }
  return { hops, status: 'too many redirects' };
}

// --probe <url> [url...] : dist を見ずに、指定URLだけを追跡・判定する（代替形式の検証用）
const probeIdx = process.argv.indexOf('--probe');
if (probeIdx !== -1) {
  let bad = 0;
  for (const start of process.argv.slice(probeIdx + 1)) {
    const { hops, status } = await trace(start);
    let hit = false;
    console.log(`\n${start}`);
    for (const h of hops) {
      const u = new URL(h);
      const apps = claimingApps(await aasaFor(u.hostname), u);
      if (apps.length) hit = true;
      console.log(`   ${apps.length ? '✗' : '✓'} ${h.slice(0, 130)}`);
    }
    console.log(`   → ${hit ? 'アプリ起動' : 'ブラウザ'}（最終 ${status}）`);
    if (hit) bad++;
    await sleep(1200);
  }
  process.exit(bad ? 1 : 0);
}

let unsafe = 0;
console.log(`楽天リンクの形: ${shapes.size} 種類\n`);
const sorted = [...shapes.entries()].sort((a, b) => b[1].count - a[1].count);
// エリア別 HTML は形が同じなので代表1本だけ追えば足りる（ここでは全形を追う）
for (const [shape, s] of sorted) {
  const { hops, status } = await trace(s.sample);
  const bad = [];
  for (const h of hops) {
    const u = new URL(h);
    const apps = claimingApps(await aasaFor(u.hostname), u);
    if (apps.length) bad.push({ hop: h, apps });
    if (VERBOSE) console.log(`      ${apps.length ? '✗' : '✓'} ${h.slice(0, 120)}${apps.length ? '  ← ' + [...new Set(apps)].join(',') : ''}`);
  }
  const mark = bad.length ? '✗ アプリ起動' : '✓ ブラウザ';
  if (bad.length) unsafe++;
  console.log(`${mark}  ${String(s.count).padStart(5)}件 / ${String(s.pages.size).padStart(4)}ページ  ${shape}  (最終 ${status})`);
  for (const b of bad) console.log(`        対象になる段: ${b.hop.slice(0, 110)}`);
  await sleep(1200);
}
console.log(`\n結果: アプリを起動する形 ${unsafe} / ${shapes.size}`);
process.exit(unsafe ? 1 : 0);
