#!/usr/bin/env node
/**
 * verifyQuizProd.mjs — 診断（/quiz/ と結果ページ）を公開した後、本番 https://tabidokoiko.com を実測する（2026-11-18）。読み取りのみ。
 *   (a) /quiz/ 200・canonical が自分・トップ/フッターから入れる
 *   (b) /quiz/desc.json・/quiz/ が読み込むJS（地図データ入り）が 200 で、手元の dist と同じ
 *   (c) 結果ページ（代表 N 件）: 200・noindex・canonical=/quiz/・og:image/og:description/twitter:card・og:image が PNG で 200・上限内
 *   (d) og:image の中身が手元の dist と一致
 *   (e) sitemap に結果ページが入っていない
 *   (f) about の「旅先診断の地図について」に出典
 *   (g) 既存ページ: 公開前の本番（--pre <dir>）と比べ、変わったのが「旅先診断」のナビ行と じゃらん受付の日次更新だけ
 * usage: node scripts/verifyQuizProd.mjs [--n 24] [--pre <公開前の本番を保存したフォルダ>]
 */
import fs from 'fs';
import path from 'path';
const SITE = 'https://tabidokoiko.com';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const N = Number(arg('--n', 24)); const PRE = arg('--pre', '');
const data = JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8'));
let bad = 0; let total = 0;
const ok = (name, cond, extra = '') => { total++; if (!cond) { bad++; console.log(`NG  ${name} ${extra}`); } };
const get = async (u, bin = false) => { const r = await fetch(u, { headers: { 'user-agent': 'dokoiko-verify' }, redirect: 'manual', signal: AbortSignal.timeout(60000) }); return { status: r.status, type: r.headers.get('content-type') || '', buf: Buffer.from(await r.arrayBuffer()) }; };
const text = (r) => r.buf.toString('utf8');
const meta = (h, re) => (h.match(re) || [])[1];
const unesc = (t) => t.replace(/&#38;|&#x26;|&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// (a)
const q = await get(`${SITE}/quiz/`); const qh = text(q);
ok('(a) /quiz/ が HTTP 200', q.status === 200, String(q.status));
ok('(a) /quiz/ の canonical が自分', qh.includes(`<link rel="canonical" href="${SITE}/quiz/"`));
const home = text(await get(`${SITE}/`));
ok('(a) トップのナビから /quiz/ に入れる', /<a href="\/quiz\/"[^>]*>\s*旅先診断/.test(home));
const about = text(await get(`${SITE}/about/`));
// (b)
const d = await get(`${SITE}/quiz/desc.json`); const dist = (f) => fs.readFileSync(path.join('dist', f));
ok('(b) /quiz/desc.json が 200 で dist と同じ', d.status === 200 && Buffer.compare(d.buf, dist('quiz/desc.json')) === 0, String(d.status));
const scripts = [...qh.matchAll(/(?:src|href)="(\/_astro\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
ok('(b) /quiz/ が読み込むJS・CSSがある', scripts.length > 0);
for (const s of scripts) { const r = await get(`${SITE}${s}`); ok(`(b) ${s.slice(0, 48)} が 200 で dist と同じ`, r.status === 200 && fs.existsSync(path.join('dist', s)) && Buffer.compare(r.buf, dist(s)) === 0, String(r.status)); }
const js = scripts.filter((s) => s.endsWith('.js')).map((s) => fs.readFileSync(path.join('dist', s), 'utf8')).join('');
ok('(b) 地図データ（都道府県の境）がJSに、診断の旅先（1,191件）がページに入っている', js.includes('"pref"') && js.includes('"key":"main"') && (qh.match(/"code":"[0-9a-f]{8}"/g) || []).length === data.length, String((qh.match(/"code":"[0-9a-f]{8}"/g) || []).length));
// (c)(d)
const want = ['kamakura', 'miyakojima', 'chichijima', 'sapporo', 'ama-island'].map((id) => data.find((x) => x.id === id)).concat(data.filter((x) => x.name.startsWith('丸瀬布')));
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pool = data.filter((x) => !want.includes(x)); while (want.length < N) want.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
const desc = JSON.parse(fs.readFileSync('src/data/quizDesc.json', 'utf8'));
let imgBytes = 0;
for (const x of want) {
  const u = `${SITE}/quiz/r/${x.code}/`; const r = await get(u); const h = text(r);
  const k = `(c) ${x.code}（${x.name}）`;
  ok(`${k} 200`, r.status === 200, String(r.status));
  ok(`${k} noindex,follow`, /<meta name="robots" content="noindex,follow"/.test(h));
  ok(`${k} canonical=/quiz/`, h.includes(`<link rel="canonical" href="${SITE}/quiz/"`));
  const og = meta(h, /<meta property="og:image" content="([^"]+)"/); const od = meta(h, /<meta property="og:description" content="([^"]*)"/);
  ok(`${k} og:image・og:description・twitter:card`, !!og && !!od && /<meta name="twitter:card" content="summary_large_image"/.test(h));
  ok(`${k} og:description が desc.json と同じ`, !!od && unesc(od) === desc[x.id]);
  ok(`${k} 共有ボタン3つ（X・共有メニュー・コピー）`, /id="share-x"/.test(h) && /id="share-menu"/.test(h) && /id="share-copy"/.test(h));
  if (og) {
    const im = await get(og); imgBytes += im.buf.length;
    ok(`${k} og:image が 200・PNG・60KB以内`, im.status === 200 && /image\/png/.test(im.type) && im.buf.slice(1, 4).toString() === 'PNG' && im.buf.length <= 60 * 1024, `${im.status} ${im.type} ${im.buf.length}`);
    ok(`(d) ${k} 共有画像が dist と一致`, Buffer.compare(im.buf, dist(`quiz/og/${x.code}.png`)) === 0);
  }
}
// (e)
const sm = text(await get(`${SITE}/sitemap.xml`));
ok('(e) sitemap に結果ページが無い・/quiz/ はある', !sm.includes('/quiz/r/') && sm.includes(`<loc>${SITE}/quiz/</loc>`));
// (f)
ok('(f) about に旅先診断の地図の出典', ['旅先診断の地図について', 'Natural Earth', 'ne_10m_admin_1_states_provinces', 'パブリックドメイン'].every((w) => about.includes(w)));
// (g)
if (PRE) {
  const norm = (h) => h.replace(/<a href="\/quiz\/"[^>]*>\s*旅先診断<\/a>/g, '').replace(/<p class="jw-note"[\s\S]*?<\/p>/g, '').replace(/data-fetched="[^"]*"/g, '').replace(/\s+/g, '');
  for (const [p, f] of [['/', '_'], ['/ouen-wari/', '_ouen-wari_'], ['/kagoshima-oen/', '_kagoshima-oen_'], ['/destinations/abashiri/', '_destinations_abashiri_'], ['/destinations/dazaifu-2/', '_destinations_dazaifu-2_'], ['/contact/', '_contact_'], ['/privacy/', '_privacy_'], ['/terms/', '_terms_'], ['/list/', '_list_']]) {
    const a = fs.readFileSync(path.join(PRE, f), 'utf8'); const r = await get(`${SITE}${p}`); const b = text(r);
    ok(`(g) ${p} は公開前と同じ（旅先診断のナビ行・じゃらん受付の日次更新を除く）`, r.status === 200 && norm(a) === norm(b), `${r.status}`);
  }
  const rb = await get(`${SITE}/robots.txt`); ok('(g) robots.txt は公開前と同じ', text(rb) === fs.readFileSync(path.join(PRE, '_robots.txt'), 'utf8'));
  const redir = text(await get(`${SITE}/destinations/dazaifu-2/`)); ok('(g) 転送ページ（dazaifu-2）は refresh のまま', /http-equiv="refresh"/.test(redir));
  ok('(g) お問い合わせの導線（フッターに /contact/）', /href="\/contact\/"/.test(home));
}
console.log(`確認 ${total}項目 / NG ${bad}・結果ページ ${want.length}件・og:image 合計 ${imgBytes}バイト`);
process.exit(bad ? 1 : 0);
