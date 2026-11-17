#!/usr/bin/env node
/**
 * auditQuiz.mjs — 診断（/quiz/）の検査（2026-11-17）。ビルド済みの dist を読む。audit:all の quiz から呼ばれる。
 *   1. 禁止語（運命・絶対・必ず・住むべき、断定や誇張）が、診断の画面の文言・スクリプトに無い
 *   2. 実名・メール・勤務先名・位置（緯度経度）・EXIF の混入が無い（OGP画像を含む）
 *        実名・メールは git の設定から実行時に取る（ファイルに書かない）。勤務先名は ~/.config/morilab/forbidden_terms.txt（1行1語・任意）があれば使う
 *   3. 結果のJSONの項目が id/name/prefecture/tags/weight/stayAllowed/url だけで、travelTime・料金・送迎・「無料」が無い
 *   4. utm は入口URL（共有の url）だけ。診断ページ内の遷移・サイト内リンクに無い。canonical・og:url が /quiz/ の自己参照
 *   5. 結果のJSONが、audit:all を通ったページだけから作られている（転送ページ・ヒーロー画像なし・同名の重複・県名が2つが入っていない／配信されているページが実在し転送でない）
 *   6. OGP: 1200×675・100KB以下・文字だけ（パレットの色数が少ない）・メタデータなし。導線（ナビ・フッター）と sitemap に /quiz/ がある
 *   7. 分布検査（scripts/quizDistribution.mjs を小さい回数で。回数 --n 既定 1500・乱数は固定）
 * usage: node scripts/auditQuiz.mjs [--n 1500]
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

const args = process.argv.slice(2);
const N = Number(args.includes('--n') ? args[args.indexOf('--n') + 1] : 1500);
const res = {};
const add = (k, v) => { res[k] = (res[k] || []).concat(v); };
const read = (f) => fs.readFileSync(f, 'utf8');
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

// ---- 1. 禁止語
const BAN = ['運命', '絶対', '必ず', '住むべき', '間違いなく', '確実', '最高', '最強', '日本一', '世界一', '完璧', '断言', '必見', '誰でも', '100％', '100パーセント'];   // 半角の 100% は CSS（width: 100%）にも出るので数えない
res['禁止語'] = BAN.filter((w) => uiText.includes(w));

// ---- 2. 実名・メール・勤務先名・位置・EXIF
const terms = new Set();
const gitCfg = (k) => { try { return execFileSync('git', ['config', '--get', k], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const nm = gitCfg('user.name'), em = gitCfg('user.email');
if (nm.length >= 2) terms.add(nm);
if (em) { terms.add(em); const lp = em.split('@')[0]; if (lp.length >= 4) terms.add(lp); }
const extra = path.join(os.homedir(), '.config/morilab/forbidden_terms.txt');
let extraCount = 0;
if (fs.existsSync(extra)) for (const l of read(extra).split('\n').map((x) => x.trim()).filter(Boolean)) { terms.add(l); extraCount++; }
const scanTargets = { 'quiz/index.html': html, 'quiz の JS': js };
res['実名・メール・勤務先名の混入'] = [];
for (const [where, text] of Object.entries(scanTargets)) for (const t of terms) if (text.includes(t)) res['実名・メール・勤務先名の混入'].push(`${where}`);
const ogBuf = fs.readFileSync('dist/images/quiz_og.png');
for (const t of terms) if (ogBuf.includes(Buffer.from(t))) res['実名・メール・勤務先名の混入'].push('quiz_og.png');
res['位置の混入'] = [];
if (/\d{2,3}\.\d{5,}/.test(html + js)) res['位置の混入'].push('緯度経度らしい数');
if (/"(lat|lng|latitude|longitude)"|geolocation/i.test(html + js)) res['位置の混入'].push('lat/lng・geolocation');
// PNG のチャンク: eXIf・tEXt・zTXt・iTXt（メタデータ）が無い
const chunks = []; { let o = 8; while (o + 8 <= ogBuf.length) { const len = ogBuf.readUInt32BE(o); chunks.push(ogBuf.toString('ascii', o + 4, o + 8)); o += 12 + len; } }
res['EXIF・メタデータ（OGP画像）'] = chunks.filter((c) => ['eXIf', 'tEXt', 'zTXt', 'iTXt'].includes(c));
res['_png_chunks'] = chunks.join(',');

// ---- 3. JSON の項目・禁止の値
const ALLOWED = ['id', 'name', 'prefecture', 'tags', 'weight', 'stayAllowed', 'url'];
res['JSONの項目が決めた7つ以外'] = [];
res['JSONに所要時間・料金・送迎・無料'] = [];
for (const d of data) {
  const keys = Object.keys(d);
  if (keys.length !== ALLOWED.length || keys.some((k) => !ALLOWED.includes(k))) res['JSONの項目が決めた7つ以外'].push(d.id);
  if (/travelTime|料金|送迎|無料|所要|円/.test(JSON.stringify(d))) res['JSONに所要時間・料金・送迎・無料'].push(d.id);
}
if (/travelTime|料金|送迎|無料/.test(jsonText)) res['JSONに所要時間・料金・送迎・無料'].push('JSON全体');

// ---- 4. utm・canonical
const entry = 'https://tabidokoiko.com/quiz/';
res['utm が入口URL以外にある'] = [];
if (/utm_/.test(htmlNoData.replace(/<script[\s\S]*?<\/script>/g, ''))) res['utm が入口URL以外にある'].push('quiz/index.html の本文・リンク');
const jsUtm = (js.match(/utm_/g) || []).length;
if (jsUtm !== 4) res['utm が入口URL以外にある'].push(`スクリプトの utm_ が ${jsUtm}個（共有の入口URLの4つだけのはず）`);
if (!js.includes(entry)) res['utm が入口URL以外にある'].push('共有の入口URL（/quiz/）がスクリプトに無い');
// サイト内リンク（/ で始まる href・自サイトの絶対URL）に utm が付いていない（外部の提携リンクなどの utm は対象外）
let siteUtm = 0;
const INTERNAL_UTM = /href="(?:https:\/\/tabidokoiko\.com)?\/[^"]*utm_/;
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'index.html' && INTERNAL_UTM.test(read(p))) siteUtm++; } };
walk('dist'); if (siteUtm) res['utm が入口URL以外にある'].push(`dist のページ ${siteUtm}件のサイト内リンクに utm_ がある`);
res['canonical・og:url が /quiz/ の自己参照でない'] = [];
if (!html.includes(`<link rel="canonical" href="${entry}"`)) res['canonical・og:url が /quiz/ の自己参照でない'].push('canonical');
if (!html.includes(`<meta property="og:url" content="${entry}"`)) res['canonical・og:url が /quiz/ の自己参照でない'].push('og:url');
if (!html.includes('https://tabidokoiko.com/images/quiz_og.png')) res['canonical・og:url が /quiz/ の自己参照でない'].push('og:image');

// ---- 5. 結果のJSONが audit を通ったページだけから
const all = JSON.parse(read('src/data/destinations.json'));
const names = new Map(); for (const d of all) names.set(d.name, (names.get(d.name) || 0) + 1);
const hero = (d) => fs.existsSync(`public/images/${d.id}/main.jpg`) || fs.existsSync(`public/images/${d.id}.jpg`) || ((d.images || [])[0] && !String(d.images[0]).startsWith('/images/'));
const heroLog = fs.existsSync('logs/missing_images.json') ? new Set(JSON.parse(read('logs/missing_images.json')).heroBroken.map((x) => x.id)) : null;
const byId = new Map(all.map((d) => [d.id, d]));
res['結果のJSONに入ってはいけない旅先'] = [];
res['結果のJSONの旅先ページが配信されていない・転送ページ'] = [];
res['結果のJSONの値が destinations.json と違う'] = [];
for (const d of data) {
  const src = byId.get(d.id);
  if (!src) { res['結果のJSONに入ってはいけない旅先'].push(`${d.id}（destinations.json に無い）`); continue; }
  if (!hero(src) || (heroLog && heroLog.has(d.id))) res['結果のJSONに入ってはいけない旅先'].push(`${d.id}（ヒーロー画像なし）`);
  if (names.get(src.name) > 1) res['結果のJSONに入ってはいけない旅先'].push(`${d.id}（同名の重複）`);
  if (String(src.prefecture).includes('・')) res['結果のJSONに入ってはいけない旅先'].push(`${d.id}（県名が2つ）`);
  if (src.name !== d.name || src.prefecture !== d.prefecture || src.weight !== d.weight || JSON.stringify(src.tags) !== JSON.stringify(d.tags) || JSON.stringify(src.stayAllowed) !== JSON.stringify(d.stayAllowed)) res['結果のJSONの値が destinations.json と違う'].push(d.id);
  const pf = `dist/destinations/${d.id}/index.html`;
  if (!fs.existsSync(pf)) res['結果のJSONの旅先ページが配信されていない・転送ページ'].push(`${d.id}（ページなし）`);
  else { const t = read(pf); if (/http-equiv="refresh"/.test(t) || !t.includes(`<link rel="canonical" href="https://tabidokoiko.com/destinations/${encodeURIComponent(d.id)}/"`)) res['結果のJSONの旅先ページが配信されていない・転送ページ'].push(`${d.id}（転送または canonical が自分でない）`); }
  if (d.url !== `/destinations/${encodeURIComponent(d.id)}/`) res['結果のJSONの値が destinations.json と違う'].push(`${d.id}（url）`);
}
// 入れるべき旅先が抜けていない（ファイルの作り直しと同じか）
let fresh = ''; try { fresh = execFileSync('node', ['scripts/buildQuizData.mjs', '--check'], { encoding: 'utf8' }).trim(); } catch { fresh = 'エラー'; }
res['結果のJSONが現在のデータから作り直したものと違う'] = fresh === '最新' ? [] : [fresh];
const embedded = JSON.stringify(data) + '\n', file = read('src/data/quizDestinations.json');
if (embedded !== file) res['結果のJSONが現在のデータから作り直したものと違う'].push('配信されているJSONと src/data/quizDestinations.json が違う');

// ---- 6. OGP・導線・sitemap
res['OGP画像の不備'] = [];
const W = ogBuf.readUInt32BE(16), H = ogBuf.readUInt32BE(20);
if (W !== 1200 || H !== 675) res['OGP画像の不備'].push(`${W}x${H}（1200x675 のはず）`);
if (ogBuf.length > 100 * 1024) res['OGP画像の不備'].push(`${ogBuf.length}バイト（100KB以下のはず）`);
const plte = chunks.includes('PLTE') ? (() => { let o = 8; while (o < ogBuf.length) { const len = ogBuf.readUInt32BE(o); if (ogBuf.toString('ascii', o + 4, o + 8) === 'PLTE') return len / 3; o += 12 + len; } return 0; })() : 0;
if (!plte || plte > 64) res['OGP画像の不備'].push(`パレットの色数 ${plte}（文字だけの画像は64色以下のはず。写真が入ると増える）`);
res['導線・sitemap'] = [];
if (!read('dist/index.html').includes('href="/quiz/"')) res['導線・sitemap'].push('トップのナビ・フッターに /quiz/ へのリンクが無い');
if (!read('dist/about/index.html').includes('href="/quiz/"')) res['導線・sitemap'].push('固定ページのナビ・フッターに /quiz/ へのリンクが無い');
if (!read('dist/sitemap.xml').includes('<loc>https://tabidokoiko.com/quiz/</loc>')) res['導線・sitemap'].push('sitemap に /quiz/ が無い');

// ---- 7. 分布検査
let dist = null;
try { dist = JSON.parse(execFileSync('node', ['scripts/quizDistribution.mjs', '--n', String(N), '--json'], { encoding: 'utf8' })); } catch (e) { res['分布検査'] = ['実行できない: ' + String(e.message).slice(0, 80)]; }
res['分布検査の不合格'] = [];
if (dist) {
  if (dist['結果が空になる回答'] > 0) res['分布検査の不合格'].push(`結果が空になる回答 ${dist['結果が空になる回答']}`);
  if (dist['一番出る割合'] > 4) res['分布検査の不合格'].push(`一番出る旅先 ${dist['一番出る旅先']} が ${dist['一番出る割合']}%（4%以下のはず）`);
  if (dist['結果が散った旅先の数'] < 250) res['分布検査の不合格'].push(`結果が散った旅先 ${dist['結果が散った旅先の数']}件（250件以上のはず）`);
  if (dist['上位10件の合計'] > 20) res['分布検査の不合格'].push(`上位10件で ${dist['上位10件の合計']}%（20%以下のはず）`);
  if (dist['上位50件の合計'] > 55) res['分布検査の不合格'].push(`上位50件で ${dist['上位50件の合計']}%（55%以下のはず）`);
  if (dist['泊と方面ごとの偏り_最大']['最多の割合'] > 40) res['分布検査の不合格'].push(`泊×方面で最多が ${dist['泊と方面ごとの偏り_最大']['最多の割合']}%（40%以下のはず）`);
}

// ---- 出力（audit:all が「◯◯: N件」を読む）
console.log(`診断の旅先 ${data.length}件・OGP ${ogBuf.length}バイト（${W}x${H}・パレット${plte}色・チャンク ${res._png_chunks}）・検査に使った禁止の個人語 ${terms.size}個（うち任意ファイル ${extraCount}個）`);
if (dist) console.log(`分布検査（${N}回）: 散った旅先 ${dist['結果が散った旅先の数']}・最多 ${dist['一番出る旅先']} ${dist['一番出る割合']}%・上位10件 ${dist['上位10件の合計']}%・上位50件 ${dist['上位50件の合計']}%・同点 ${dist['1位が同点になる割合']}%`);
let ng = 0;
for (const [k, v] of Object.entries(res)) { if (k.startsWith('_')) continue; console.log(`${k}: ${v.length}件${v.length ? '  ' + v.slice(0, 4).join(' / ') : ''}`); ng += v.length; }
process.exit(ng ? 1 : 0);
