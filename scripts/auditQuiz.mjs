#!/usr/bin/env node
/**
 * auditQuiz.mjs — 診断（/quiz/ と結果ページ /quiz/r/<code>/）の検査（2026-11-17 / 2026-11-18 に地図・結果ページ・共有画像を足した）。ビルド済みの dist を読む。
 *   1. 禁止語（運命・絶対・必ず・住むべき、断定や誇張）が、診断の画面の文言・スクリプト・結果ページ・結果のJSONに無い
 *   2. 実名・メール・勤務先名・位置（緯度経度）・EXIF の混入が無い（OGP画像のメタデータを含む）。「@mori__lab」「x.com/mori__lab」は許可
 *        実名・メールは git の設定から実行時に取る（ファイルに書かない）。勤務先名などは ~/.config/morilab/forbidden_terms.txt（1行1語・任意）があれば使う（中身は出力しない）
 *   3. 結果のJSONの項目が決めた11個（id/name/prefecture/tags/weight/stayAllowed/url と x/y/code/win）だけ。x,y は整数で範囲内。lat/lng・travelTime・料金・送迎・「無料」が無い
 *   4. code が8桁の英数字・重複なし・id のハッシュと一致。win の合計が1万
 *   5. 結果のJSONが、audit:all を通ったページだけから作られている（転送ページ・ヒーロー画像なし・同名の重複・県名が2つが入っていない／旅先ページが配信されている）
 *   6. 全旅先に結果ページがある。noindex,follow・canonical=/quiz/・og:image（結果ごと）・twitter:card・sitemap に入っていない・utm なし・作った人のXのリンクあり
 *   7. 共有画像 /quiz/og/<code>.png: 全旅先ぶんあり・1200×675・サイズが上限内・パレット・メタデータなし・中身のハッシュが今のデータと一致（古い画像を見つける）
 *   8. utm は共有の URL（結果ページ）だけ。サイト内リンクにない。/quiz/ の canonical・og:url が自己参照
 *   8b. 説明（/quiz/desc.json）: 全文が採用の条件を満たし、既存の旅先ページの description の先頭1〜2文、または県名と tags の1文と一致する（新しい文が混ざらない）。結果ページの og:description と一致
 *   9. 分布検査（scripts/quizDistribution.mjs を小さい回数で）
 * usage: node scripts/auditQuiz.mjs [--n 1500]
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { contentHash, ACCOUNT } from './lib/quizOg.mjs';
import { checkText, splitSentences, tagsSentence } from './lib/quizDescRules.mjs';

const args = process.argv.slice(2);
const N = Number(args.includes('--n') ? args[args.indexOf('--n') + 1] : 1500);
const OG_MAX = 60 * 1024;                       // 共有画像1枚の上限（2026-11-18 の20枚の試作は平均16KB・最大23KB）
const res = {};
const add = (k, v) => { (res[k] = res[k] || []).push(v); };
const init = (...ks) => ks.forEach((k) => { res[k] = res[k] || []; });
const read = (f) => fs.readFileSync(f, 'utf8');
const unesc = (t) => t.replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#38;|&#x26;/g, '&').replace(/&amp;/g, '&');
if (!fs.existsSync('dist/quiz/index.html')) { console.log('dist/quiz/index.html が無い（先に npm run build）'); process.exit(1); }
const html = read('dist/quiz/index.html');

// ---- データ部分（JSON）と、画面の文言・スクリプトを分ける
const m = html.match(/<script id="quiz-data"[^>]*>([\s\S]*?)<\/script>/);
if (!m) { console.log('結果のJSON（quiz-data）が dist/quiz/index.html に無い'); process.exit(1); }
const jsonText = m[1];
let data; try { data = JSON.parse(jsonText); } catch { console.log('結果のJSONが読めない'); process.exit(1); }
const htmlNoData = html.replace(m[0], '');
const jsFiles = fs.readdirSync('dist/_astro').filter((f) => /^quiz\.astro.*\.js$/.test(f)).map((f) => 'dist/_astro/' + f);
const js = jsFiles.map(read).join('\n');
const uiText = htmlNoData.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ') + '\n' + js;
const ALLOW = (t) => t.replaceAll('@mori__lab', '').replaceAll('x.com/mori__lab', '');   // 作った人のXは許可

// ---- 1. 禁止語（画面の文言・スクリプト）
const BAN = ['運命', '絶対', '必ず', '住むべき', '間違いなく', '確実', '最高', '最強', '日本一', '世界一', '完璧', '断言', '必見', '誰でも', '100％', '100パーセント', '当てます', '運命の町', '20の質問', '4万人'];   // 後ろの4語は 2026-11-18 に追加（参考にしたサイトの言い回しに寄せない）   // 半角の 100% は CSS（width: 100%）にも出るので数えない
init('禁止語');
for (const w of BAN) if (uiText.includes(w)) add('禁止語', w);

// 共有画像の元データ: 画像を作るスクリプトの文言（コメントを除く）にも禁止語が無い。旅先名・県名は結果のJSON（下で検査）から来る
init('共有画像の元データに禁止語');
{ const src = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const f of ['scripts/buildQuizOgAll.mjs', 'scripts/lib/quizOg.mjs']) for (const w of BAN) if (src(f).includes(w)) add('共有画像の元データに禁止語', `${f}: ${w}`); }

// ---- 2. 実名・メール・勤務先名・位置・EXIF
const terms = new Set();
const gitCfg = (k) => { try { return execFileSync('git', ['config', '--get', k], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const nm = gitCfg('user.name'), em = gitCfg('user.email');
if (nm.length >= 2) terms.add(nm);
if (em) { terms.add(em); const lp = em.split('@')[0]; if (lp.length >= 4) terms.add(lp); }
const extra = path.join(os.homedir(), '.config/morilab/forbidden_terms.txt');
let extraCount = 0;
if (fs.existsSync(extra)) for (const l of read(extra).split('\n').map((x) => x.trim()).filter(Boolean)) { terms.add(l); extraCount++; }
init('実名・メール・勤務先名の混入', '位置の混入', 'EXIF・メタデータ（共有画像）');
const personal = (where, text) => { const t = ALLOW(text); for (const w of terms) if (t.includes(w)) add('実名・メール・勤務先名の混入', where); };
personal('quiz/index.html', html); personal('quiz の JS', js);
if (/\d{2,3}\.\d{5,}/.test(ALLOW(html + js))) add('位置の混入', '緯度経度らしい数');
if (/"(lat|lng|latitude|longitude)"|geolocation/i.test(html + js)) add('位置の混入', 'lat/lng・geolocation');

// ---- 3・4. JSON の項目・値
const ALLOWED = ['id', 'name', 'prefecture', 'tags', 'weight', 'stayAllowed', 'url', 'x', 'y', 'code', 'win'];
const MAP = JSON.parse(read('src/data/quizMap.json'));
init('JSONの項目が決めた11個以外', 'JSONに所要時間・料金・送迎・無料', 'x,y が整数・範囲内でない', 'code が不正・重複', 'win の合計が1万でない');
const codeSeen = new Map(); let winSum = 0;
for (const d of data) {
  const keys = Object.keys(d);
  if (keys.length !== ALLOWED.length || keys.some((k) => !ALLOWED.includes(k))) add('JSONの項目が決めた11個以外', d.id);
  if (/travelTime|料金|送迎|無料|所要|円/.test(JSON.stringify(d))) add('JSONに所要時間・料金・送迎・無料', d.id);
  if (!Number.isInteger(d.x) || !Number.isInteger(d.y) || d.x < 0 || d.x > MAP.width || d.y < 0 || d.y > MAP.height) add('x,y が整数・範囲内でない', d.id);
  if (!/^[0-9a-f]{8}$/.test(d.code) || codeSeen.has(d.code) || d.code !== crypto.createHash('sha1').update(d.id).digest('hex').slice(0, 8)) add('code が不正・重複', d.id);
  codeSeen.set(d.code, d.id);
  if (!Number.isInteger(d.win) || d.win < 0) add('win の合計が1万でない', `${d.id}（win が整数でない）`);
  winSum += d.win;
}
if (winSum !== 10000) add('win の合計が1万でない', `合計 ${winSum}`);
if (/travelTime|料金|送迎|無料|"lat"|"lng"/.test(jsonText)) add('JSONに所要時間・料金・送迎・無料', 'JSON全体');
const jsonWords = BAN.filter((w) => ALLOW(jsonText).includes(w));
for (const w of jsonWords) add('禁止語', `JSON内: ${w}`);

// ---- 8. utm・canonical（/quiz/）
const SITE = 'https://tabidokoiko.com';
init('utm が共有のURL以外にある', 'canonical・og:url が /quiz/ の自己参照でない');
if (/utm_/.test(htmlNoData.replace(/<script[\s\S]*?<\/script>/g, ''))) add('utm が共有のURL以外にある', 'quiz/index.html の本文・リンク');
const jsUtm = (js.match(/utm_/g) || []).length;
if (jsUtm !== 4) add('utm が共有のURL以外にある', `スクリプトの utm_ が ${jsUtm}個（共有の URL の4つだけのはず）`);
if (!js.includes('/quiz/r/') || !js.includes(SITE)) add('utm が共有のURL以外にある', '共有の URL（https://tabidokoiko.com/quiz/r/<code>/）がスクリプトに無い');
const INTERNAL_UTM = /href="(?:https:\/\/tabidokoiko\.com)?\/[^"]*utm_/;
let siteUtm = 0;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'index.html' && INTERNAL_UTM.test(read(p))) siteUtm++; } };
walk('dist'); if (siteUtm) add('utm が共有のURL以外にある', `dist のページ ${siteUtm}件のサイト内リンクに utm_ がある`);
if (!html.includes(`<link rel="canonical" href="${SITE}/quiz/"`)) add('canonical・og:url が /quiz/ の自己参照でない', 'canonical');
if (!html.includes(`<meta property="og:url" content="${SITE}/quiz/"`)) add('canonical・og:url が /quiz/ の自己参照でない', 'og:url');
init('共有ボタンの不備');
for (const id of ['qz-share', 'qz-share-menu', 'qz-share-copy']) if (!html.includes(`id="${id}"`)) add('共有ボタンの不備', `/quiz/ に ${id} が無い`);
if (!/id="qz-share-menu"[^>]*\bhidden\b/.test(html)) add('共有ボタンの不備', '共有メニューのボタンが最初から隠れていない（navigator.share が使える端末だけに出す）');
if (!/utm_source=\$\{\w+\}/.test(js) || !/\(["']x["']\)/.test(js) || !/\(["']share["']\)/.test(js) || !/\(["']copy["']\)/.test(js)) add('共有ボタンの不備', 'utm_source の3種（x / share / copy）が /quiz/ のスクリプトに揃っていない');
if (!/\.hidden\s*=\s*!navigator\.share/.test(js)) add('共有ボタンの不備', 'navigator.share があるときだけ共有メニューを出す処理が無い');
if (!/navigator\.clipboard\.writeText/.test(js) || !/\.select\(\)/.test(js)) add('共有ボタンの不備', 'コピー（クリップボード・使えないときは選択状態）の処理が無い');
if (!/https:\/\/x\.com\/intent\/post\?text=\$\{[^}]*\}&url=\$\{[^}]*\}&hashtags=/.test(js)) add('共有ボタンの不備', 'Xの投稿画面のURLの形（text・url・hashtags）が違う');
for (const k of ['x', 'share', 'copy']) if (!new RegExp(`method:\\s*["']${k}["']`).test(js)) add('共有ボタンの不備', `GA4 share_click の method: '${k}' が無い`);
if (/share_click[^;]*(latitude|longitude|answers)/.test(js)) add('共有ボタンの不備', 'share_click に余計な値を送っている');
init('作った人のXのリンクが無い');
const X = /<a [^>]*href="https:\/\/x\.com\/mori__lab"[^>]*rel="noopener"|<a [^>]*rel="noopener"[^>]*href="https:\/\/x\.com\/mori__lab"/;
if (!X.test(html)) add('作った人のXのリンクが無い', '/quiz/（結果の画面）');
if (!/author_x_click/.test(js)) add('作った人のXのリンクが無い', 'author_x_click の計測');

// ---- 5. audit を通ったページだけ
const all = JSON.parse(read('src/data/destinations.json'));
const names = new Map(); for (const d of all) names.set(d.name, (names.get(d.name) || 0) + 1);
const hero = (d) => fs.existsSync(`public/images/${d.id}/main.jpg`) || fs.existsSync(`public/images/${d.id}.jpg`) || ((d.images || [])[0] && !String(d.images[0]).startsWith('/images/'));
const heroLog = fs.existsSync('logs/missing_images.json') ? new Set(JSON.parse(read('logs/missing_images.json')).heroBroken.map((x) => x.id)) : null;
const byId = new Map(all.map((d) => [d.id, d]));
init('結果のJSONに入ってはいけない旅先', '結果のJSONの旅先ページが配信されていない・転送ページ', '結果のJSONの値が destinations.json と違う');
for (const d of data) {
  const src = byId.get(d.id);
  if (!src) { add('結果のJSONに入ってはいけない旅先', `${d.id}（destinations.json に無い）`); continue; }
  if (!hero(src) || (heroLog && heroLog.has(d.id))) add('結果のJSONに入ってはいけない旅先', `${d.id}（ヒーロー画像なし）`);
  if (names.get(src.name) > 1) add('結果のJSONに入ってはいけない旅先', `${d.id}（同名の重複）`);
  if (String(src.prefecture).includes('・')) add('結果のJSONに入ってはいけない旅先', `${d.id}（県名が2つ）`);
  if (src.name !== d.name || src.prefecture !== d.prefecture || src.weight !== d.weight || JSON.stringify(src.tags) !== JSON.stringify(d.tags) || JSON.stringify(src.stayAllowed) !== JSON.stringify(d.stayAllowed)) add('結果のJSONの値が destinations.json と違う', d.id);
  const pf = `dist/destinations/${d.id}/index.html`;
  if (!fs.existsSync(pf)) add('結果のJSONの旅先ページが配信されていない・転送ページ', `${d.id}（ページなし）`);
  else { const t = read(pf); if (/http-equiv="refresh"/.test(t) || !t.includes(`<link rel="canonical" href="${SITE}/destinations/${encodeURIComponent(d.id)}/"`)) add('結果のJSONの旅先ページが配信されていない・転送ページ', `${d.id}（転送または canonical が自分でない）`); }
  if (d.url !== `/destinations/${encodeURIComponent(d.id)}/`) add('結果のJSONの値が destinations.json と違う', `${d.id}（url）`);
}
init('結果のJSONが現在のデータから作り直したものと違う');
let fresh = ''; try { fresh = execFileSync('node', ['scripts/buildQuizData.mjs', '--check'], { encoding: 'utf8' }).trim(); } catch { fresh = 'エラー'; }
if (fresh !== '最新') add('結果のJSONが現在のデータから作り直したものと違う', fresh);
if (JSON.stringify(data) + '\n' !== read('src/data/quizDestinations.json')) add('結果のJSONが現在のデータから作り直したものと違う', '配信されているJSONと src/data/quizDestinations.json が違う');

// ---- 6. 結果ページ
init('結果ページの不備', '結果ページの文言の不備');
const sitemap = read('dist/sitemap.xml');
if (sitemap.includes('/quiz/r/')) add('結果ページの不備', 'sitemap に結果ページが入っている');
if (!sitemap.includes(`<loc>${SITE}/quiz/</loc>`)) add('結果ページの不備', 'sitemap に /quiz/ が無い');
const banRe = new RegExp([...BAN].join('|'));
for (const d of data) {
  const f = `dist/quiz/r/${d.code}/index.html`;
  if (!fs.existsSync(f)) { add('結果ページの不備', `${d.code}（ページなし）`); continue; }
  const t = read(f);
  if (!t.includes('<meta name="robots" content="noindex,follow">')) add('結果ページの不備', `${d.code}（noindex,follow なし）`);
  if (!t.includes(`<link rel="canonical" href="${SITE}/quiz/">`)) add('結果ページの不備', `${d.code}（canonical が /quiz/ でない）`);
  if (!t.includes(`<meta property="og:image" content="${SITE}/quiz/og/${d.code}.png">`) || !t.includes(`<meta name="twitter:image" content="${SITE}/quiz/og/${d.code}.png">`)) add('結果ページの不備', `${d.code}（og:image が結果ごとでない）`);
  if (!t.includes('<meta name="twitter:card" content="summary_large_image">')) add('結果ページの不備', `${d.code}（twitter:card）`);
  if (!t.includes(`<meta property="og:title" content="私に似合う旅先は【${d.name}(${d.prefecture})】`)) add('結果ページの不備', `${d.code}（og:title）`);
  if (/utm_/.test(t.replace(/<a [^>]*id="share-x"[^>]*>/, '').replace(/<script[^>]*>[^<]*shareText[^<]*<\/script>/, ''))) add('結果ページの不備', `${d.code}（共有ボタン以外に utm がある）`);
  if (!X.test(t)) add('結果ページの不備', `${d.code}（作った人のXのリンクなし）`);
  if (!/author_x_click/.test(t)) add('結果ページの不備', `${d.code}（author_x_click の計測なし）`);
  {
    const xm = t.match(/<a [^>]*id="share-x"[^>]*href="([^"]*)"/) || t.match(/<a [^>]*href="([^"]*)"[^>]*id="share-x"/);
    let okx = false;
    if (xm) { try { const u = new URL(unesc(xm[1])); const e = new URL(u.searchParams.get('url')); okx = u.origin + u.pathname === 'https://x.com/intent/post' && u.searchParams.get('text') === `私に似合う旅先は【${d.name}(${d.prefecture})】でした。あなたは？` && u.searchParams.get('hashtags') === '似合う旅先,どこ行こ' && e.origin + e.pathname === `${SITE}/quiz/r/${d.code}/` && e.searchParams.get('utm_source') === 'x' && e.searchParams.get('utm_medium') === 'social' && e.searchParams.get('utm_campaign') === 'quiz_travelmatch_2611' && e.searchParams.get('utm_content') === d.code; } catch { okx = false; } }
    if (!okx) add('共有ボタンの不備', `${d.code}（結果ページのXの投稿画面のURLの形・utm が違う）`);
    if (!/id="share-menu"[^>]*\bhidden\b/.test(t) || !/id="share-copy"/.test(t)) add('共有ボタンの不備', `${d.code}（共有メニュー（最初は非表示）・リンクをコピーのボタンが無い）`);
    if (!t.includes(`utm_source=share&`) || !t.includes(`utm_source=copy&`) || !/navigator\.share/.test(t) || !/navigator\.clipboard\.writeText/.test(t)) add('共有ボタンの不備', `${d.code}（utm_source=share・copy／共有・コピーの処理が無い）`);
  }
  if (!t.includes(`href="${d.url}"`) || !t.includes('href="/quiz/"')) add('結果ページの不備', `${d.code}（旅先ページ・/quiz/ へのリンク）`);
  const text = ALLOW(t.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' '));
  if (banRe.test(text) || /travelTime|料金|送迎|無料|所要|[0-9０-９][,，0-9０-９]*\s*円/.test(text)) add('結果ページの文言の不備', `${d.code}（禁止語・料金・送迎・無料）`);
  for (const w of terms) if (text.includes(w) || ALLOW(t).includes(w)) add('実名・メール・勤務先名の混入', `結果ページ ${d.code}`);
  if (/\d{2,3}\.\d{5,}/.test(t)) add('位置の混入', `結果ページ ${d.code}`);
}

// ---- 7. 共有画像
init('共有画像の不備');
const manifest = fs.existsSync('src/data/quizOgManifest.json') ? JSON.parse(read('src/data/quizOgManifest.json')) : null;
if (!manifest) add('共有画像の不備', 'src/data/quizOgManifest.json が無い（node scripts/buildQuizOgAll.mjs で全件を作る）');
let ogTotal = 0, ogMax = 0, ogCount = 0;
for (const d of data) {
  const f = `dist/quiz/og/${d.code}.png`;
  if (!fs.existsSync(f)) { add('共有画像の不備', `${d.code}（画像なし）`); continue; }
  const b = fs.readFileSync(f); ogCount++; ogTotal += b.length; ogMax = Math.max(ogMax, b.length);
  if (b.length < 64 || b.toString('ascii', 1, 4) !== 'PNG') { add('共有画像の不備', `${d.code}（PNG として読めない）`); continue; }
  if (b.length > OG_MAX) add('共有画像の不備', `${d.code}（${b.length}バイト＞上限 ${OG_MAX}）`);
  if (b.readUInt32BE(16) !== 1200 || b.readUInt32BE(20) !== 675) add('共有画像の不備', `${d.code}（${b.readUInt32BE(16)}x${b.readUInt32BE(20)}）`);
  const ch = []; let o = 8; while (o + 8 <= b.length) { const len = b.readUInt32BE(o); ch.push(b.toString('ascii', o + 4, o + 8)); o += 12 + len; }
  const meta = ch.filter((c) => ['eXIf', 'tEXt', 'zTXt', 'iTXt'].includes(c));
  if (meta.length) add('EXIF・メタデータ（共有画像）', `${d.code}（${meta.join(',')}）`);
  if (!ch.includes('PLTE')) add('共有画像の不備', `${d.code}（パレットでない）`);
  for (const w of terms) if (b.includes(Buffer.from(w))) add('実名・メール・勤務先名の混入', `共有画像 ${d.code}`);
  if (manifest && manifest[d.code] !== contentHash(d, MAP)) add('共有画像の不備', `${d.code}（古い画像: 旅先名・win・位置・アカウント名・地図のどれかが変わった）`);
}
if (manifest) for (const c of Object.keys(manifest)) if (!codeSeen.has(c)) add('共有画像の不備', `${c}（manifest にあるが旅先に無い）`);

// ---- 導線・OGP（/quiz/）
init('導線・sitemap');
const ogBuf = fs.readFileSync('dist/images/quiz_og.png');
init('OGP画像の不備');
{ const W = ogBuf.readUInt32BE(16), H = ogBuf.readUInt32BE(20); const ch = []; let o = 8; while (o + 8 <= ogBuf.length) { const len = ogBuf.readUInt32BE(o); ch.push(ogBuf.toString('ascii', o + 4, o + 8)); o += 12 + len; }
  if (W !== 1200 || H !== 675) add('OGP画像の不備', `/quiz/ の画像 ${W}x${H}`);
  if (ogBuf.length > 100 * 1024) add('OGP画像の不備', `/quiz/ の画像 ${ogBuf.length}バイト`);
  if (ch.some((c) => ['eXIf', 'tEXt', 'zTXt', 'iTXt'].includes(c))) add('EXIF・メタデータ（共有画像）', '/quiz/ の画像'); }
if (!read('dist/index.html').includes('href="/quiz/"')) add('導線・sitemap', 'トップのナビ・フッターに /quiz/ へのリンクが無い');
if (!read('dist/about/index.html').includes('href="/quiz/"')) add('導線・sitemap', '固定ページのナビ・フッターに /quiz/ へのリンクが無い');

// ---- 統合で診断の候補から消えた旅先の結果ページ（2026-11-18）: 統合先の結果ページへの転送ページ（noindex,follow・canonical は /quiz/・meta refresh）
init('統合で消えた旅先の結果ページの不備');
{
  const mf = 'src/data/quizMovedCodes.json'; const moved = fs.existsSync(mf) ? JSON.parse(read(mf)) : {};
  const liveCodes = new Set(JSON.parse(jsonText).map((d) => d.code));
  for (const [old, m] of Object.entries(moved)) {
    const f = `dist/quiz/r/${old}/index.html`;
    if (liveCodes.has(old)) { add('統合で消えた旅先の結果ページの不備', `${old}（診断の旅先に残っている）`); continue; }
    if (!liveCodes.has(m.to)) add('統合で消えた旅先の結果ページの不備', `${old}（転送先 ${m.to} が診断に無い）`);
    if (!fs.existsSync(f)) { add('統合で消えた旅先の結果ページの不備', `${old}（転送ページが無い）`); continue; }
    const t = read(f);
    if (!/<meta name="robots" content="noindex,follow"/.test(t) || !t.includes(`<link rel="canonical" href="${SITE}/quiz/"`)) add('統合で消えた旅先の結果ページの不備', `${old}（noindex,follow・canonical /quiz/）`);
    if (!t.includes(`http-equiv="refresh" content="0; url=/quiz/r/${m.to}/"`)) add('統合で消えた旅先の結果ページの不備', `${old}（meta refresh が /quiz/r/${m.to}/ でない）`);
    if (fs.existsSync(`public/quiz/og/${old}.png`)) add('統合で消えた旅先の結果ページの不備', `${old}（消えた旅先の共有画像が残っている）`);
  }
}

// ---- 地図の見た目: 近い点を表示のときだけ1つにまとめる（2026-11-18）。旧の描画（全点をそのまま描く）に戻っていないか
init('地図のまとめ描画の不備');
{
  const view = read('src/lib/quizMapView.js'), og = read('scripts/buildQuizOgAll.mjs'), cl = read('src/lib/quizCluster.js');
  if (!/from '\.\/quizCluster\.js'/.test(view) || !/clusterDots\(dots,\s*rad,\s*skip\)/.test(view)) add('地図のまとめ描画の不備', '結果画面の地図（quizMapView.js）が quizCluster.js でまとめていない');
  if (!/from '\.\.\/src\/lib\/quizCluster\.js'/.test(og) || !/clusterDots\(data,\s*CLUSTER_RADIUS,\s*new Set\(\[idx\]\)\)/.test(og)) add('地図のまとめ描画の不備', '共有画像の作成（buildQuizOgAll.mjs）が点をまとめていない／選ばれた旅先をまとめから外していない');
  if (!/Math\.min\(Math\.log2\(/.test(js) || !/\.17\*Math\.min/.test(js)) add('地図のまとめ描画の不備', '配信される /quiz/ のスクリプトに、まとめた点の描画（群の大きさ）が無い');
  if (!/CLUSTER_PX\s*=\s*14\b/.test(cl)) add('地図のまとめ描画の不備', 'まとめる距離（画面上 14px）の定数が変わっている');
  const ver = Number((read('scripts/lib/quizOg.mjs').match(/OG_VERSION\s*=\s*(\d+)/) || [])[1]);
  if (!(ver >= 6)) add('地図のまとめ描画の不備', `共有画像の版が v6 未満（${ver}）。旧の見た目の画像が残る`);
  const mp = JSON.parse(read('src/data/quizMap.json'));
  const pathLen = mp.frames.reduce((n, f) => n + f.path.length + f.pref.length, 0);
  if (pathLen > 20000) add('地図のまとめ描画の不備', `地図データが大きい（輪郭+県境 ${pathLen}文字）。簡略化・小さな島の省略が戻っている`);
}

// ---- 地図の出典・落款
init('地図の出典・落款の不備');
{
  const about = read('dist/about/index.html');
  for (const w of ['Natural Earth', 'ne_10m_admin_0_countries', 'ne_10m_admin_1_states_provinces', 'パブリックドメイン', 'naturalearthdata.com/about/terms-of-use', '間引き', 'メルカトル', '旅先診断の地図について']) if (!about.includes(w)) add('地図の出典・落款の不備', `about に「${w}」が無い（出典・ライセンス・加工内容）`);
  const m = JSON.parse(read('src/data/quizMap.json'));
  if (!m.frames.every((f) => typeof f.pref === 'string') || !m.frames[0].pref.length) add('地図の出典・落款の不備', 'quizMap.json に都道府県の境（frames[].pref）が無い');
  if (!/admin_1_states_provinces/.test(m.source?.dataset || '') || m.source?.license !== 'パブリックドメイン') add('地図の出典・落款の不備', 'quizMap.json の出典・ライセンスの記載が無い');
  // 落款は、結果画面・結果ページ・共有画像の元データのどれも @mori__lab だけを指す（ほかの @名前・ほかのリンク先が無い）
  const seals = [];
  const hit = (name, text, re) => { for (const mm of text.matchAll(re)) seals.push([name, mm[1].trim()]); };
  hit('結果画面', read('src/pages/quiz.astro'), /class="qz-seal"[^>]*>([^<]*)</g);
  hit('共有画像', read('scripts/buildQuizOgAll.mjs'), /<div class="seal">([^<]*)</g);
  for (const d of data.slice(0, 40)) { const f = `dist/quiz/r/${d.code}/index.html`; if (fs.existsSync(f)) hit('結果ページ', read(f), /class="seal"[^>]*>([^<]*)</g); }
  if (!seals.some((x) => x[0] === '結果画面') || !seals.some((x) => x[0] === '共有画像') || !seals.some((x) => x[0] === '結果ページ')) add('地図の出典・落款の不備', '落款が結果画面・結果ページ・共有画像のどれかに無い');
  for (const [n, t] of seals) if (t !== '@mori__lab' && t !== '${ACCOUNT}') add('地図の出典・落款の不備', `${n}の落款が @mori__lab でない（${t}）`);
  if (ACCOUNT !== '@mori__lab') add('地図の出典・落款の不備', `ACCOUNT が @mori__lab でない（${ACCOUNT}）`);
  for (const f of ['src/pages/quiz.astro', 'src/pages/quiz/r/[code].astro', 'scripts/buildQuizOgAll.mjs']) for (const mm of read(f).matchAll(/@mori[A-Za-z0-9_]*/g)) if (mm[0] !== '@mori__lab') add('地図の出典・落款の不備', `${f} に別のアカウント名（${mm[0]}）`);
  for (const mm of read('dist/quiz/index.html').matchAll(/href="(https:\/\/x\.com\/[^"]*)"/g)) if (mm[1] !== 'https://x.com/mori__lab' && !mm[1].startsWith('https://x.com/intent/post')) add('地図の出典・落款の不備', `診断ページに別のXのリンク（${mm[1]}）`);
}

// ---- 8b. 説明
init('説明（desc.json）の不備');
{
  const unesc = (t) => t.replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#38;|&#x26;/g, '&').replace(/&amp;/g, '&');
  let desc = null;
  try { desc = JSON.parse(read('dist/quiz/desc.json')); } catch { add('説明（desc.json）の不備', 'dist/quiz/desc.json が読めない'); }
  if (desc) {
    if (JSON.stringify(desc) + '\n' !== read('src/data/quizDesc.json')) add('説明（desc.json）の不備', '配信されている desc.json と src/data/quizDesc.json が違う');
    let fresh2 = ''; try { fresh2 = execFileSync('node', ['scripts/buildQuizDesc.mjs', '--check'], { encoding: 'utf8' }).trim(); } catch { fresh2 = 'エラー'; }
    if (fresh2 !== '最新') add('説明（desc.json）の不備', fresh2);
    for (const d of data) {
      const t = desc[d.id];
      if (typeof t !== 'string' || !t) { add('説明（desc.json）の不備', `${d.id}（説明なし）`); continue; }
      const bad = checkText(t); if (bad) add('説明（desc.json）の不備', `${d.id}（条件: ${bad}）`);
      for (const w of BAN) if (t.includes(w)) add('説明（desc.json）の不備', `${d.id}（禁止語 ${w}）`);
      const orig = byId.get(d.id).description || '';
      const fromDesc = orig.startsWith(t) && splitSentences(t).length >= 1 && splitSentences(orig).slice(0, splitSentences(t).length).join('') === t;
      if (!fromDesc && t !== tagsSentence(d.prefecture, d.tags)) add('説明（desc.json）の不備', `${d.id}（既存の description の先頭の文でも tags の1文でもない＝新しい文）`);
      const f = `dist/quiz/r/${d.code}/index.html`;
      if (fs.existsSync(f)) {
        const h = read(f); const og = (h.match(/<meta property="og:description" content="([^"]*)"/) || [])[1]; const md = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1];
        if (og === undefined || unesc(og) !== t || md === undefined || unesc(md) !== t) add('説明（desc.json）の不備', `${d.code}（結果ページの og:description・meta description が desc.json と違う）`);
        if (!/<p class="desc"[^>]*>/.test(h) || !unesc(h).includes(`>${t}</p>`)) add('説明（desc.json）の不備', `${d.code}（結果ページの本文に説明が無い）`);
      }
    }
    if (Object.keys(desc).length !== data.length) add('説明（desc.json）の不備', `件数 ${Object.keys(desc).length} ≠ 旅先 ${data.length}`);
  }
  if (!js.includes('/quiz/desc.json')) add('説明（desc.json）の不備', '結果で desc.json を読み込むコードが無い');
  if (/"description"/.test(jsonText)) add('説明（desc.json）の不備', '診断の最初のJSON（quiz-data）に description が入っている');
}

// ---- 「のこり」の厳密性（小さい回数）: 数がエンジンと一致し、外れと数えた旅先が1位にならない（scripts/testQuizAlive.mjs）
init('のこりの厳密性の不備');
try { execFileSync('node', ['scripts/testQuizAlive.mjs', '--paths', '400', '--fills', '10'], { encoding: 'utf8' }); }
catch (e) { add('のこりの厳密性の不備', String(e.stdout || e.message).split('\n').filter(Boolean).slice(0, 2).join(' / ').slice(0, 160)); }

// ---- 9. 分布検査
let dist = null;
try { dist = JSON.parse(execFileSync('node', ['scripts/quizDistribution.mjs', '--n', String(N), '--json'], { encoding: 'utf8' })); } catch (e) { add('分布検査の不合格', '実行できない: ' + String(e.message).slice(0, 80)); }
init('分布検査の不合格');
if (dist) {
  if (dist['結果が空になる回答'] > 0) add('分布検査の不合格', `結果が空になる回答 ${dist['結果が空になる回答']}`);
  if (dist['一番出る割合'] > 4) add('分布検査の不合格', `一番出る旅先 ${dist['一番出る旅先']} が ${dist['一番出る割合']}%（4%以下のはず）`);
  if (dist['結果が散った旅先の数'] < 250) add('分布検査の不合格', `結果が散った旅先 ${dist['結果が散った旅先の数']}件（250件以上のはず）`);
  if (dist['上位10件の合計'] > 20) add('分布検査の不合格', `上位10件で ${dist['上位10件の合計']}%（20%以下のはず）`);
  if (dist['上位50件の合計'] > 55) add('分布検査の不合格', `上位50件で ${dist['上位50件の合計']}%（55%以下のはず）`);
  if (dist['泊と方面ごとの偏り_最大']['最多の割合'] > 40) add('分布検査の不合格', `泊×方面で最多が ${dist['泊と方面ごとの偏り_最大']['最多の割合']}%（40%以下のはず）`);
}

// ---- 出力（audit:all が「◯◯: N件」を読む）
console.log(`診断の旅先 ${data.length}件・結果ページ ${data.length}・共有画像 ${ogCount}枚（合計 ${ogTotal}バイト・最大 ${ogMax}）・/quiz/ のOGP ${ogBuf.length}バイト・検査に使った禁止の個人語 ${terms.size}個（うち任意ファイル ${extraCount}個。ファイル${fs.existsSync(extra) ? 'あり' : 'なし'}）`);
if (dist) console.log(`分布検査（${N}回）: 散った旅先 ${dist['結果が散った旅先の数']}・最多 ${dist['一番出る旅先']} ${dist['一番出る割合']}%・上位10件 ${dist['上位10件の合計']}%・上位50件 ${dist['上位50件の合計']}%・同点 ${dist['1位が同点になる割合']}%`);
let ng = 0;
for (const [k, v] of Object.entries(res)) { console.log(`${k}: ${v.length}件${v.length ? '  ' + v.slice(0, 4).join(' / ') : ''}`); ng += v.length; }
process.exit(ng ? 1 : 0);
