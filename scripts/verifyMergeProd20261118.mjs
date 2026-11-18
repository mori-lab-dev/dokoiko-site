#!/usr/bin/env node
/**
 * verifyMergeProd20261118.mjs — 統合パイロットを公開した後、本番 https://tabidokoiko.com を実測する（2026-11-18）。読み取りのみ。dist が要る（公開したビルドと同じもの）。
 *   (b) 統合ページ5つ: HTTP 200・h2（見出し）の数が dist と一致・宿のカード・画像の出典・食い違いを直した箇所が本番に反映（新しい文がある・古い文が無い）・HTML が dist と一致
 *   (c) 転送ページ12件: canonical・meta refresh（アンカー付き）・アンカーの飛び先の見出し（id）が統合ページに存在
 *   (d) sitemap: 旧URLが無く、統合ページがある
 *   (e) 診断: 統合後の結果ページ（隠岐諸島・慶良間諸島・笠岡諸島・人吉を含む）が200・og:image が200のPNGで60KB以内・dist と一致／消えた12件の結果ページが統合先への転送
 *   (f) 既存ページ: 公開前の本番（--pre <dir>）と比べ、変わったのが「旅先の一覧から消えた12件」「じゃらん受付の日次更新」だけ
 * usage: node scripts/verifyMergeProd20261118.mjs --pre <公開前の本番を保存したフォルダ>
 */
import fs from 'fs';
import path from 'path';
const SITE = 'https://tabidokoiko.com';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PRE = arg('--pre', '');
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const pairs = J('scripts/data/mergedPages.json').pairs.filter((p) => p.hash);
const reps = [...new Set(pairs.map((p) => p.to))];
const fixes = J('scripts/data/mergeConflictFixes20261118.json').fixes;
const moved = J('src/data/quizMovedCodes.json');
const quiz = J('src/data/quizDestinations.json');
let bad = 0, total = 0;
const ok = (name, cond, extra = '') => { total++; if (!cond) { bad++; console.log(`NG  ${name} ${extra}`); } };
const get = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'dokoiko-verify' }, redirect: 'manual', signal: AbortSignal.timeout(60000) }); return { status: r.status, type: r.headers.get('content-type') || '', buf: Buffer.from(await r.arrayBuffer()) }; };
const txt = (r) => r.buf.toString('utf8');
const dist = (f) => fs.readFileSync(path.join('dist', f));
const dec = (s) => s.replace(/&#38;|&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const norm = (s) => dec(s).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
const count = (h, re) => (h.match(re) || []).length;
const enc = encodeURIComponent;

// (b)
const edits = fixes.flatMap((f) => f.edits);
for (const rep of reps) {
  const r = await get(`${SITE}/destinations/${rep}/`); const h = txt(r); const local = fs.readFileSync(`dist/destinations/${rep}/index.html`, 'utf8');
  ok(`(b) ${rep} HTTP 200`, r.status === 200, String(r.status));
  ok(`(b) ${rep} の h2 見出し（統合した各ページ）の数が dist と一致`, count(h, /<section class="merged-group"/g) === count(local, /<section class="merged-group"/g) && count(h, /<h2 class="merged-group-title"/g) === count(local, /<h2 class="merged-group-title"/g), `${count(h, /<section class="merged-group"/g)} / dist ${count(local, /<section class="merged-group"/g)}`);
  ok(`(b) ${rep} の画像の出典の数が dist と一致`, count(h, /class="spot-credit"/g) === count(local, /class="spot-credit"/g), `${count(h, /class="spot-credit"/g)} / dist ${count(local, /class="spot-credit"/g)}`);
  ok(`(b) ${rep} の宿のカードの数が dist と一致`, count(h, /class="fs-card"/g) === count(local, /class="fs-card"/g), `${count(h, /class="fs-card"/g)} / dist ${count(local, /class="fs-card"/g)}`);
  ok(`(b) ${rep} の本文が dist とバイト一致`, Buffer.compare(r.buf, dist(`destinations/${rep}/index.html`)) === 0);
  const t = norm(h);
  for (const e of edits.filter((x) => (x.group && x.file.includes(`articles/${rep}.json`)) || (x.spot && x.spot[0] === rep))) {
    const oldOne = e.old.replace(/\n/g, ''), newOne = e.new.replace(/\n/g, '');
    if (newOne) ok(`(b) ${rep}: 直した箇所が本番にある「${newOne.slice(0, 24)}」`, t.includes(norm(newOne)) || /spot|spots/.test(JSON.stringify(e.spot || '')) , '');   // spot の説明は構造化データ側
    if (oldOne && oldOne !== newOne) ok(`(b) ${rep}: 古い文が本番に無い「${oldOne.slice(0, 24)}」`, !t.includes(norm(oldOne)) && !norm(h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')).includes(norm(oldOne)));
  }
  // 構造化データ（spots）にも古い文が残っていない
  for (const e of edits.filter((x) => x.spot && x.spot[0] === rep)) ok(`(b) ${rep}: 見どころ「${e.spot[1]}」の構造化データに直した文がある・古い文が無い`, dec(h).includes(e.new) && !dec(h).includes(e.old));
}
// (c)
for (const p of pairs) {
  const r = await get(`${SITE}/destinations/${p.from}/`); const h = txt(r);
  ok(`(c) ${p.from} HTTP 200`, r.status === 200, String(r.status));
  ok(`(c) ${p.from} canonical が統合ページ`, h.includes(`<link rel="canonical" href="${SITE}/destinations/${p.to}/"`));
  ok(`(c) ${p.from} meta refresh が アンカー付き（#${p.hash}）`, h.includes(`http-equiv="refresh" content="0; url=/destinations/${p.to}/#${p.hash}"`));
  ok(`(c) ${p.from} に noindex が無い`, !/<meta[^>]+name="robots"[^>]*noindex/i.test(h));
  ok(`(c) ${p.from} が dist とバイト一致`, Buffer.compare(r.buf, dist(`destinations/${p.from}/index.html`)) === 0);
  const tr = await get(`${SITE}/destinations/${p.to}/`); ok(`(c) 飛び先の見出し id="${p.hash}" が統合ページに存在`, txt(tr).includes(`id="${p.hash}"`));
}
// (d)
const sm = txt(await get(`${SITE}/sitemap.xml`));
ok('(d) sitemap に旧URL（転送ページ）が無い', pairs.every((p) => !sm.includes(`/destinations/${p.from}/`)), pairs.filter((p) => sm.includes(`/destinations/${p.from}/`)).map((p) => p.from).join(','));
ok('(d) sitemap に統合ページがある', reps.every((r) => sm.includes(`<loc>${SITE}/destinations/${r}/</loc>`)));
// (e)
const q = await get(`${SITE}/quiz/`); const qh = txt(q);
ok('(e) /quiz/ HTTP 200', q.status === 200);
ok('(e) /quiz/ の診断の旅先が 1,179件（統合後）', (qh.match(/"code":"[0-9a-f]{8}"/g) || []).length === quiz.length, String((qh.match(/"code":"[0-9a-f]{8}"/g) || []).length));
const must = ['nishinoshima', 'tokashiki-jima', 'shiraishijima', 'hitoyoshi'];
let seed = 4321; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pool = quiz.filter((d) => !must.includes(d.id)); const want = must.map((id) => quiz.find((d) => d.id === id));
while (want.length < 24) want.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
let imgBytes = 0;
for (const d of want) {
  const r = await get(`${SITE}/quiz/r/${d.code}/`); const h = txt(r);
  ok(`(e) ${d.code}（${d.name}）200・noindex,follow・canonical /quiz/`, r.status === 200 && /<meta name="robots" content="noindex,follow"/.test(h) && h.includes(`<link rel="canonical" href="${SITE}/quiz/"`));
  const og = (h.match(/<meta property="og:image" content="([^"]+)"/) || [])[1]; const od = (h.match(/<meta property="og:description" content="([^"]*)"/) || [])[1];
  ok(`(e) ${d.code} og:image・og:description・twitter:card`, !!og && !!od && /<meta name="twitter:card" content="summary_large_image"/.test(h));
  ok(`(e) ${d.code} の名前が結果に出る（${d.name}）`, h.includes(`【${d.name}(${d.prefecture})】`));
  if (og) { const im = await get(og); imgBytes += im.buf.length; ok(`(e) ${d.code} og:image が200・PNG・60KB以内・dist と一致`, im.status === 200 && /image\/png/.test(im.type) && im.buf.slice(1, 4).toString() === 'PNG' && im.buf.length <= 60 * 1024 && Buffer.compare(im.buf, dist(`quiz/og/${d.code}.png`)) === 0, `${im.status} ${im.buf.length}`); }
}
for (const [old, m] of Object.entries(moved)) {
  const r = await get(`${SITE}/quiz/r/${old}/`); const h = txt(r);
  ok(`(e) 消えた旅先 ${old} → 統合先 ${m.to} への転送（noindex,follow・canonical /quiz/・meta refresh）`, r.status === 200 && h.includes(`http-equiv="refresh" content="0; url=/quiz/r/${m.to}/"`) && /<meta name="robots" content="noindex,follow"/.test(h) && h.includes(`<link rel="canonical" href="${SITE}/quiz/"`));
}
ok('(e) 消えた旅先の共有画像が本番に無い（404）', (await get(`${SITE}/quiz/og/${Object.keys(moved)[0]}.png`)).status === 404);
// (f)
if (PRE) {
  const norm2 = (h) => h.replace(/<p class="jw-note"[\s\S]*?<\/p>/g, '').replace(/data-fetched="[^"]*"/g, '').replace(/\s+/g, '');
  const ids = (h) => new Set([...h.matchAll(/href="\/destinations\/([^/"#?]+)\/"/g)].map((m) => decodeURIComponent(m[1])));
  const removed = new Set(pairs.map((p) => p.from));
  for (const [p, f] of [['/', '_'], ['/ouen-wari/', '_ouen-wari_'], ['/kagoshima-oen/', '_kagoshima-oen_'], ['/destinations/abashiri/', '_destinations_abashiri_'], ['/destinations/dazaifu-2/', '_destinations_dazaifu-2_'], ['/contact/', '_contact_'], ['/privacy/', '_privacy_'], ['/terms/', '_terms_'], ['/list/', '_list_']]) {
    const a = fs.readFileSync(path.join(PRE, f), 'utf8'); const r = await get(`${SITE}${p}`); const b = txt(r);
    const ia = ids(a), ib = ids(b); const gone = [...ia].filter((x) => !ib.has(x)), added = [...ib].filter((x) => !ia.has(x));
    const onlyRemoved = gone.every((x) => removed.has(x)) && added.length === 0;
    if (norm2(a) === norm2(b)) ok(`(f) ${p} は公開前と同じ（じゃらん受付の日次更新を除く）`, r.status === 200);
    else ok(`(f) ${p} の違いは「旅先ページへのリンクが消えた旧URL（${gone.length}件）」だけ`, r.status === 200 && gone.length > 0 && onlyRemoved && norm2(a.replace(/<a [^>]*href="\/destinations\/[^"]*"[\s\S]*?<\/a>/g, '')) === norm2(b.replace(/<a [^>]*href="\/destinations\/[^"]*"[\s\S]*?<\/a>/g, '')), `消えた ${gone.join(',')} 増えた ${added.join(',')}`);
  }
  ok('(f) robots.txt は公開前と同じ', txt(await get(`${SITE}/robots.txt`)) === fs.readFileSync(path.join(PRE, '_robots.txt'), 'utf8'));
  ok('(f) 転送ページ（dazaifu-2）は refresh のまま', /http-equiv="refresh"/.test(txt(await get(`${SITE}/destinations/dazaifu-2/`))));
  ok('(f) お問い合わせの導線（フッターに /contact/）', /href="\/contact\/"/.test(txt(await get(`${SITE}/`))));
}
console.log(`確認 ${total}項目 / NG ${bad}・og:image（${want.length}件）合計 ${imgBytes}バイト`);
process.exit(bad ? 1 : 0);
