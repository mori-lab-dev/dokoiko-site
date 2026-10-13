#!/usr/bin/env node
/**
 * auditStayLinksFull.mjs — 宿の検索リンクを全件検査する（2026-10-13）。サンプリングはしない。
 *
 * きっかけ: じゃらんの宿名検索は Shift_JIS の keyword が必須で、UTF-8 のままだと「鎌倉」が「骼悟??」に化けて 0 件になる
 * （scripts/jalanUrl.js）。同じ型の問題が楽天（kw.travel.rakuten.co.jp の f_query）にもあり、本番の楽天リンクは全件 0 件だった。
 * 再発を防ぐために、dist の全 HTML から宿リンクを全部拾って検査する。
 *
 * 静的（既定。ネットワーク不要・数秒）— dist/**.html の全リンク
 *   S1 アフィリのラッパーが正しいか（楽天 hb.afl.rakuten.co.jp/hgc/<ID>/・じゃらん ValueCommerce sid/pid）。ラッパー無しの素リンクが無いか
 *   S2 アプリ起動の恐れが無い形か（楽天は kw.travel.rakuten.co.jp のみ・じゃらんは許可リスト形式のみ）
 *   S3 検索語の文字コード: 宿検索 keyword/f_query を Shift_JIS として復号し、(a) 復号できる (b) 再エンコードで元と一致 (c) UTF-8 のバイト列ではない
 *      (d) 復号した語が、データにある名称（旅先名・hotelSearch・拠点・県庁所在地・注目の宿名）のどれかと一致する
 *   S4 注目の宿(featured_stay)のあるページに、宿名そのもので検索するリンクが楽天・じゃらん両方にあるか
 *   S5 レンタカー: じゃらんレンタカーだけ（楽天レンタカー無し）・旅先ページ全部に有る
 *
 * 実取得（--live）— 一意な検索リンク（サイト×検索語）を 1 本ずつ取得する。アフィリのラッパーは叩かない
 *   （クリックの水増しになるため。ラッパーの動作は probeDistLinkInBrowser.mjs で代表を実際に踏んで確認する）
 *   L1 HTTP 200 で、リダイレクトが輪にならず 8 回以内に着地する
 *   L2 全ホップがアプリ起動の対象外（じゃらん: 許可リスト・楽天: kw.travel.rakuten.co.jp）。宿の個別ページへ飛ばされていない
 *   L3 検索結果ページが「検索語を正しく読んでいる」: ページのタイトルに出る検索語 = こちらが渡した語
 *   L4 検索結果が 1 件以上（0 件は「文字化け」ではなく「その名の宿が掲載なし」と分けて出す）
 *
 *   node scripts/auditStayLinksFull.mjs                 静的のみ
 *   node scripts/auditStayLinksFull.mjs --live          静的＋実取得（キャッシュ logs/stay_links_live_cache.json から再開できる）
 *   オプション: --conc 3  --delay 700（ms）  --limit N（実取得の件数を絞る・試験用）  --retry-blocked  --fresh（キャッシュを使わず全件取り直す）
 * 終了コード: 失敗（S1〜S5 の不備・L1〜L3 の不備）があれば 1。0 件は情報として出し、失敗には数えない。
 */
import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import { fileURLToPath } from 'url';
import { isJalanSafeUrl, isJalanAppLink } from './auditJalanAppLinks.mjs';
import { toSjisSafe } from './jalanUrl.js';
import { fallbackTable, resolveStayKeyword } from './stayKeywordFallback.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const val = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const LIVE = flag('--live');
const CONC = Number(val('--conc', 3));
const DELAY = Number(val('--delay', 700));
const LIMIT = Number(val('--limit', 0));
const DIST = path.join(root, 'dist');
const CACHE = path.join(root, 'logs/stay_links_live_cache.json');
const OUT = path.join(root, val('--out', 'logs/stay_links_full.json'));

const RAKUTEN_AFF_ID = '5113ee4b.8662cfc5.5113ee4c.119de89a';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── データから「検索語として出てよい名称」を集める ─────────────────────────
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const hubs = JSON.parse(fs.readFileSync(path.join(root, 'src/data/hubCities.json'), 'utf8'));
const PREF_CAPITALS = ['札幌', '青森', '盛岡', '仙台', '秋田', '山形', '福島', '水戸', '宇都宮', '前橋', 'さいたま', '千葉', '東京', '横浜', '新潟', '富山', '金沢', '福井', '甲府', '長野', '岐阜', '静岡', '名古屋', '津', '大津', '京都', '大阪', '神戸', '奈良', '和歌山', '鳥取', '松江', '岡山', '広島', '山口', '徳島', '高松', '松山', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '宮崎', '鹿児島', '那覇'];
const allowed = new Set(PREF_CAPITALS);
for (const d of dests) {
  for (const k of [d.name, d.hotelSearch, d.hubCity, d.hubName, d.featured_stay?.name]) if (k) allowed.add(k);
}
for (const h of hubs) { if (h.name) allowed.add(h.name); }
for (const k of [...allowed]) allowed.add(toSjisSafe(k));
for (const site of ['rakuten', 'jalan']) for (const v of Object.values(fallbackTable[site] || {})) allowed.add(v); // 0件の語の代替（buildStayKeywordFallback.mjs） // Shift_JIS で表せない文字（ô 等）は基本の文字に直して渡す
const byId = new Map(dests.map((d) => [d.id, d]));

// ── dist の全 HTML から宿リンクを拾う ─────────────────────────────────────
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const unent = (s) => s.replace(/&amp;|&#38;/g, '&').replace(/&quot;|&#34;/g, '"');
const safeDec = (s) => { try { return decodeURIComponent(s); } catch { return null; } };

/** URL の key=値 を、パーセントを外した「生のバイト列」で返す（文字コードを検査するため、文字列に直さない） */
function rawParamBytes(url, key) {
  const m = url.match(new RegExp(`[?&]${key}=([^&#]*)`));
  if (!m) return null;
  const bytes = [];
  const s = m[1];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '%' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else if (s[i] === '+') bytes.push(0x20);
    else for (const b of Buffer.from(s[i], 'utf8')) bytes.push(b);
  }
  return Buffer.from(bytes);
}
function checkKeywordBytes(buf) {
  const issues = [];
  const text = iconv.decode(buf, 'Shift_JIS');
  if (!text) issues.push('空');
  if (/�/.test(text)) issues.push('復号不能の文字');
  if (!iconv.encode(text, 'Shift_JIS').equals(buf)) issues.push('再エンコードが元と不一致');
  let utf8 = false;
  try { const u = new TextDecoder('utf-8', { fatal: true }).decode(buf); utf8 = /[^\x00-\x7f]/.test(u); } catch { /* UTF-8 ではない */ }
  if (utf8) issues.push('UTF-8 のバイト列（Shift_JIS ではない）');
  return { text, issues };
}

const pages = [];
const P = {
  pages: 0, rakutenStay: 0, jalanStay: 0, rentacarJalan: 0, rentacarRakuten: 0, activity: 0,
  badWrapper: [], rawLinks: [], appRisk: [], badEncoding: [], unexpectedKeyword: [], fsMissing: [], rentacarMissing: [], rentacarBad: [], otherAff: [],
};
const targets = new Map(); // `${site}|${K}` -> { site, keyword, url, pages:Set }

for (const file of walk(DIST)) {
  const rel = path.relative(DIST, file);
  const html = fs.readFileSync(file, 'utf8');
  const hrefs = [...new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => unent(m[1])))];
  const dm = rel.match(/^destinations\/([^/]+)\/index\.html$/);
  const hm = rel.match(/^hub\/([^/]+)\/index\.html$/);
  const id = dm?.[1] || hm?.[1] || null;
  const dest = dm ? byId.get(id) : null;
  // 統合済みの旧URL（meta refresh のスタブ）は検査の対象外
  const isStub = /<meta http-equiv="refresh"/i.test(html);
  P.pages++; if (isStub) P.stubs = (P.stubs || 0) + 1;
  const seen = { rakutenKw: new Set(), jalanKw: new Set(), rentacarJalan: 0 };

  for (const h of hrefs) {
    const isRakWrap = /^https:\/\/hb\.afl\.rakuten\.co\.jp\//.test(h);
    const isVcWrap = /^https:\/\/ck\.jp\.ap\.valuecommerce\.com\//.test(h);
    let site = null, inner = null;
    if (isRakWrap) {
      site = 'rakuten';
      inner = safeDec((h.match(/[?&]pc=([^&]+)/) || [])[1] || '');
      if (!h.includes(`/hgc/${RAKUTEN_AFF_ID}/`)) P.badWrapper.push({ rel, site, href: h.slice(0, 110) });
    } else if (isVcWrap) {
      site = 'jalan';
      inner = safeDec((h.match(/[?&]vc_url=([^&]+)/) || [])[1] || '');
      if (!(h.includes('sid=3764408') && h.includes('pid=892559858'))) P.badWrapper.push({ rel, site, href: h.slice(0, 110) });
    } else if (/^https?:\/\/([a-z0-9.-]+\.)?(rakuten\.co\.jp)\//.test(h) && /travel/.test(h)) {
      P.rawLinks.push({ rel, href: h.slice(0, 110) }); continue;
    } else if (/^https?:\/\/(www\.)?jalan\.net\//.test(h)) {
      P.rawLinks.push({ rel, href: h.slice(0, 110) }); continue;
    } else continue; // 宿以外（JR予約・地図・公式サイト等）
    if (!inner) { P.badWrapper.push({ rel, site, href: h.slice(0, 110), why: '宛先を復号できない' }); continue; }

    let u; try { u = new URL(inner); } catch { P.badWrapper.push({ rel, site, href: h.slice(0, 110), why: '宛先がURLでない' }); continue; }
    // 楽天トラベル以外の楽天（市場・広告等）はこの検査の対象外
    if (site === 'rakuten' && !/travel\.rakuten\.co\.jp$/.test(u.hostname)) { P.otherAff.push({ rel, inner: inner.slice(0, 90) }); continue; }

    if (site === 'rakuten') {
      if (/\/cars\b|rentacar/i.test(u.pathname)) { P.rentacarRakuten++; P.rentacarBad.push({ rel, why: '楽天レンタカーのリンクがある', inner: inner.slice(0, 90) }); continue; }
      if (u.hostname !== 'kw.travel.rakuten.co.jp' || u.pathname !== '/keyword/Search.do') { P.appRisk.push({ rel, site, inner: inner.slice(0, 100) }); continue; }
    } else {
      if (!isJalanSafeUrl(inner)) { P.appRisk.push({ rel, site, inner: inner.slice(0, 100) }); continue; }
      if (u.pathname.startsWith('/rentacar')) { P.rentacarJalan++; seen.rentacarJalan++; continue; }
      if (u.pathname === '/activity/') { P.activity++; continue; }
    }

    // 宿の検索リンク: 検索語のバイト列を検査する
    const key = site === 'rakuten' ? 'f_query' : 'keyword';
    const bytes = rawParamBytes(inner, key);
    if (!bytes) { P.badEncoding.push({ rel, site, why: `${key} が無い`, inner: inner.slice(0, 100) }); continue; }
    site === 'rakuten' ? P.rakutenStay++ : P.jalanStay++;
    const { text, issues } = checkKeywordBytes(bytes);
    if (issues.length) P.badEncoding.push({ rel, site, keyword: text, why: issues.join('・'), inner: inner.slice(0, 100) });
    else if (!allowed.has(text)) P.unexpectedKeyword.push({ rel, site, keyword: text });
    (site === 'rakuten' ? seen.rakutenKw : seen.jalanKw).add(text);
    const tk = `${site}|${text}`;
    if (!targets.has(tk)) targets.set(tk, { site, keyword: text, url: inner, pages: new Set() });
    targets.get(tk).pages.add(rel);
  }

  if (dm && dest && !isStub) {
    const fs0 = dest?.featured_stay;
    // 大手OTAに掲載が無い宿（otaListed:false）は公式サイトへ案内する設計なので、OTAの宿名検索は出さない
    if (fs0?.name && fs0.otaListed !== false) {
      // 0件の宿名は代替の語に置き換わる（resolveStayKeyword）。置き換え後の語で検索するリンクがあればよい
      if (!seen.rakutenKw.has(toSjisSafe(resolveStayKeyword('rakuten', fs0.name)))) P.fsMissing.push({ id, site: 'rakuten', name: fs0.name });
      if (!seen.jalanKw.has(toSjisSafe(resolveStayKeyword('jalan', fs0.name)))) P.fsMissing.push({ id, site: 'jalan', name: fs0.name });
    }
    if (seen.rentacarJalan === 0) P.rentacarMissing.push({ id });
  }
}

// ── 静的の結果 ─────────────────────────────────────────────────────────
const staticFail = {
  'S1 ラッパー不備・素リンク': P.badWrapper.length + P.rawLinks.length,
  'S2 アプリ起動の恐れ': P.appRisk.length,
  'S3 文字コード不備': P.badEncoding.length,
  'S4 注目の宿の宿名検索が無い': P.fsMissing.length,
  'S5 レンタカー不備': P.rentacarBad.length + P.rentacarMissing.length,
};
const nFs = dests.filter((d) => d.featured_stay?.name).length;
const nFsNoOta = dests.filter((d) => d.featured_stay?.otaListed === false).length;
console.log('═'.repeat(72));
console.log(`宿リンク全件検査（静的）  対象 HTML ${P.pages} ページ  一意な検索リンク ${targets.size} 本`);
console.log('═'.repeat(72));
console.log(`楽天の宿検索リンク ${P.rakutenStay} 本 / じゃらんの宿検索リンク ${P.jalanStay} 本 / じゃらんレンタカー ${P.rentacarJalan} 本 / 楽天レンタカー ${P.rentacarRakuten} 本 / じゃらん遊び・体験 ${P.activity} 本`);
console.log(`注目の宿 ${nFs} 件（うち大手OTA掲載なし=公式案内のみ ${nFsNoOta} 件）`);
for (const [k, n] of Object.entries(staticFail)) console.log(`  ${n ? '❌' : '✅'} ${k}: ${n} 件`);
console.log(`  ℹ 想定外の検索語（データに無い名称・文字化けとは限らない）: ${P.unexpectedKeyword.length} 件`);
const show = (title, arr, f) => { if (arr.length) { console.log(`\n${title}（${arr.length}件・先頭12）`); for (const x of arr.slice(0, 12)) console.log('  ' + f(x)); } };
show('S1', [...P.badWrapper, ...P.rawLinks], (x) => `${x.rel} ${x.site || ''} ${x.href}`);
show('S2', P.appRisk, (x) => `${x.rel} ${x.site} ${x.inner}`);
show('S3', P.badEncoding, (x) => `${x.rel} ${x.site} 「${x.keyword ?? ''}」 ${x.why}`);
show('S4', P.fsMissing, (x) => `${x.id} ${x.site} ${x.name}`);
show('S5', [...P.rentacarBad, ...P.rentacarMissing], (x) => `${x.id || x.rel} ${x.why || 'じゃらんレンタカーのリンクが無い'}`);
show('想定外の検索語', P.unexpectedKeyword, (x) => `${x.rel} ${x.site} 「${x.keyword}」`);

const result = { date: new Date().toISOString(), static: { pages: P.pages, uniqueTargets: targets.size, counts: { rakutenStay: P.rakutenStay, jalanStay: P.jalanStay, rentacarJalan: P.rentacarJalan, rentacarRakuten: P.rentacarRakuten, activity: P.activity }, fail: staticFail, details: { ...P } } };
let liveFail = 0;

// ── 実取得 ─────────────────────────────────────────────────────────────
if (LIVE) {
  const cache = !flag('--fresh') && fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
  const RE_BLOCK = /アクセスしにくい|混雑しています|しばらくしてから/;

  async function fetchChain(url) {
    const hops = [];
    let cur = url;
    for (let i = 0; i < 9; i++) {
      const r = await fetch(cur, { headers: { 'User-Agent': IPHONE_UA, 'Accept-Language': 'ja' }, redirect: 'manual', signal: AbortSignal.timeout(25000) });
      hops.push({ url: cur, status: r.status });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        const next = new URL(r.headers.get('location'), cur).toString();
        if (hops.some((h) => h.url === next)) return { hops, loop: true };
        cur = next; continue;
      }
      return { hops, buf: Buffer.from(await r.arrayBuffer()), status: r.status };
    }
    return { hops, tooMany: true };
  }

  async function probe(t) {
    for (let a = 0; a < 3; a++) {
      try {
        const r = await fetchChain(t.url);
        if (r.loop || r.tooMany) return { verdict: 'redirect-loop', hops: r.hops.map((h) => `${h.status} ${h.url.slice(0, 90)}`) };
        const html = iconv.decode(r.buf, 'Shift_JIS');
        const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() || '';
        if (r.status === 429 || r.status === 503 || RE_BLOCK.test(title) || RE_BLOCK.test(html.slice(0, 4000))) { await sleep(6000 * (a + 1)); continue; }
        const last = r.hops[r.hops.length - 1];
        const res = { status: r.status, final: last.url.slice(0, 160), hops: r.hops.map((h) => `${h.status} ${h.url.slice(0, 90)}`), title: title.slice(0, 80) };
        if (r.status !== 200) return { ...res, verdict: 'http-error' };
        // L2: 全ホップがアプリ起動の対象外か
        // じゃらんは途中に文字コード補正の中継（/us/usp0001/usw0001.do）が挟まる。中継は AASA（アプリ対象のパス）と照合し、
        // 着地は検索結果（uww2011init.do）でなければならない（宿の個別ページ等へ飛ぶとアプリが起動する）。楽天は検索ホストのみ。
        const risky = r.hops.filter((h) => { const u = new URL(h.url); return t.site === 'jalan' ? isJalanAppLink(h.url) || (h === last && u.pathname !== '/uw/uwp2011/uww2011init.do') : u.hostname !== 'kw.travel.rakuten.co.jp'; });
        if (risky.length) return { ...res, verdict: 'app-risk', risky: risky.map((h) => h.url.slice(0, 110)) };
        // L3: 検索語の読まれ方
        const echo = t.site === 'jalan'
          ? (title.match(/^「(.*?)」に該当する/) || [])[1]
          : (title.match(/^「(.*?)」の\s*検索結果/) || [])[1];
        if (echo === undefined) return { ...res, verdict: 'no-echo' };
        res.echo = echo;
        // HTML実体参照（&amp;amp; 等）と全角/半角の差（＆と&）は文字化けではない
        const norm = (x) => { let y = x; for (let i = 0; i < 3; i++) y = y.replace(/&amp;/g, '&').replace(/&#38;/g, '&'); return y.normalize('NFKC').replace(/\s+/g, ''); };
        if (norm(echo) !== norm(t.keyword)) return { ...res, verdict: 'garbled' };
        // L4: 件数
        const zero = /見つかりませんでした/.test(html);
        const count = t.site === 'rakuten' ? Number((html.match(/<em>([0-9,]+)<\/em>\s*件中/) || [])[1]?.replace(/,/g, '')) : Number((html.match(/([0-9,]+)\s*件/) || [])[1]?.replace(/,/g, ''));
        return { ...res, verdict: zero ? 'zero-hits' : 'ok', count: Number.isFinite(count) ? count : null };
      } catch (e) { await sleep(2500 * (a + 1)); }
    }
    return { verdict: 'blocked' };
  }

  // 判定ロジックを直したときのため、キャッシュ済みの garbled はエコーから再判定する
  for (const c of Object.values(cache)) if (c.verdict === 'garbled' && c.echo !== undefined) {
    const norm = (x) => { let y = x; for (let i = 0; i < 3; i++) y = y.replace(/&amp;/g, '&').replace(/&#38;/g, '&'); return y.normalize('NFKC').replace(/\s+/g, ''); };
    if (norm(c.echo) === norm(c.keyword)) c.verdict = 'ok';
  }
  let list = [...targets.values()].filter((t) => !cache[`${t.site}|${t.keyword}`] || (flag('--retry-blocked') && cache[`${t.site}|${t.keyword}`].verdict === 'blocked'));
  if (LIMIT) list = list.slice(0, LIMIT);
  console.log(`\n実取得: 一意な検索リンク ${targets.size} 本のうち未取得 ${list.length} 本（並列 ${CONC}・間隔 ${DELAY}ms）`);
  let next = 0, done = 0;
  const t0 = Date.now();
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (next < list.length) {
      const t = list[next++];
      cache[`${t.site}|${t.keyword}`] = { ...(await probe(t)), keyword: t.keyword, site: t.site, url: t.url };
      done++;
      if (done % 100 === 0) {
        fs.writeFileSync(CACHE, JSON.stringify(cache));
        const el = (Date.now() - t0) / 1000;
        process.stderr.write(`  ${done}/${list.length}（経過 ${Math.round(el)}秒・残り約 ${Math.round((el / done) * (list.length - done))}秒）\n`);
      }
      await sleep(DELAY);
    }
  }));
  fs.writeFileSync(CACHE, JSON.stringify(cache));

  const rows = [...targets.values()].map((t) => ({ ...t, pages: [...t.pages], r: cache[`${t.site}|${t.keyword}`] })).filter((x) => x.r);
  const by = (v, site) => rows.filter((x) => x.r.verdict === v && (!site || x.site === site));
  const tally = {};
  for (const site of ['rakuten', 'jalan']) {
    tally[site] = { 対象: [...targets.values()].filter((t) => t.site === site).length };
    for (const v of ['ok', 'zero-hits', 'garbled', 'no-echo', 'http-error', 'redirect-loop', 'app-risk', 'blocked']) tally[site][v] = by(v, site).length;
    tally[site].未取得 = tally[site].対象 - rows.filter((x) => x.site === site).length;
  }
  console.log('\n' + '═'.repeat(72));
  console.log('宿リンク全件検査（実取得）');
  console.log('═'.repeat(72));
  for (const site of ['rakuten', 'jalan']) {
    const t = tally[site];
    console.log(`${site === 'rakuten' ? '楽天  ' : 'じゃらん'}  一意 ${t.対象}本  正常 ${t.ok} / 0件 ${t['zero-hits']} / 文字化け ${t.garbled} / 検索語が読めない ${t['no-echo']} / HTTP異常 ${t['http-error']} / 輪 ${t['redirect-loop']} / アプリ起動の恐れ ${t['app-risk']} / 判定不可 ${t.blocked} / 未取得 ${t.未取得}`);
  }
  liveFail = rows.filter((x) => ['garbled', 'no-echo', 'http-error', 'redirect-loop', 'app-risk'].includes(x.r.verdict)).length;
  const showL = (v, title) => { const a = by(v); if (a.length) { console.log(`\n${title}（${a.length}件・先頭15）`); for (const x of a.slice(0, 15)) console.log(`  [${x.site}] 「${x.keyword}」 ${x.r.echo !== undefined ? `読まれた語=「${x.r.echo}」` : ''} ${x.r.status || ''} ${x.r.final || ''} ← ${x.pages[0]}${x.pages.length > 1 ? ` ほか${x.pages.length - 1}` : ''}`); } };
  showL('garbled', '❌ 文字化け');
  showL('no-echo', '❌ 検索語が読み取れない（ページの形が想定と違う）');
  showL('http-error', '❌ HTTP 異常');
  showL('redirect-loop', '❌ リダイレクトの輪');
  showL('app-risk', '❌ アプリ起動の恐れ');
  showL('zero-hits', 'ℹ 検索語は正しく読まれたが該当なし（0件）');
  showL('blocked', '△ 判定不可（サイト側のブロック・--retry-blocked で再試行）');
  result.live = { tally, rows: rows.filter((x) => x.r.verdict !== 'ok').map((x) => ({ site: x.site, keyword: x.keyword, verdict: x.r.verdict, echo: x.r.echo, final: x.r.final, pages: x.pages })) };
}

result.fail = Object.values(staticFail).reduce((a, b) => a + b, 0) + liveFail;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, (k, v) => (v instanceof Set ? [...v] : v), 1));
console.log(`\n結果: ${result.fail === 0 ? '✅ 失敗なし' : `❌ 失敗 ${result.fail} 件`}  （詳細 ${path.relative(root, OUT)}）`);
process.exit(result.fail === 0 ? 0 : 1);
