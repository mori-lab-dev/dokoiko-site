#!/usr/bin/env node
/**
 * auditFactNotice20261118.mjs — 旅先ページ全部に、共通の注意書きが「1つだけ」あるかの検査（2026-11-18）。
 *   対象: dist/destinations/<id>/index.html。転送ページ（meta refresh）は対象外。診断（/quiz/）・応援割・hub・一覧は、注意書きが「無い」ことを確かめる。
 *   旅先ページごとに: ① data-fact-notice の要素がちょうど1つ ② 文言が決めたとおり ③ 「◯◯のおすすめスポット」の見出しの直後にある
 *   出力の最終行: `注意書きの違反: N`（auditAll が読む）。終了コード: 違反があれば 1
 * usage: node scripts/auditFactNotice20261118.mjs [distDir]   試験用に dist を差し替えられる
 */
import fs from 'fs'; import path from 'path';
const DIST = process.argv[2] || 'dist';
const TEXT = '料金・営業時間・休館日などは変わることがあります。お出かけ前に、各施設の公式サイトでご確認ください。';
const bad = []; let pages = 0, stubs = 0;
const dir = path.join(DIST, 'destinations');
for (const id of fs.readdirSync(dir)) {
  const f = path.join(dir, id, 'index.html'); if (!fs.existsSync(f)) continue;
  const h = fs.readFileSync(f, 'utf8');
  if (/<meta[^>]+http-equiv=["']refresh["']/i.test(h)) { stubs++; if (h.includes('data-fact-notice')) bad.push(`${id}: 転送ページに注意書きがある`); continue; }
  pages++;
  const n = (h.match(/data-fact-notice/g) || []).length;
  if (n !== 1) { bad.push(`${id}: 注意書きが${n}個`); continue; }
  const m = h.match(/<p[^>]*data-fact-notice[^>]*>([^<]*)<\/p>/);
  if (!m || m[1].trim() !== TEXT) bad.push(`${id}: 文言が違う`);
  if (!/<h2[^>]*class="[^"]*spots-heading[^"]*"[^>]*>[^<]*のおすすめスポット<\/h2>\s*<p[^>]*data-fact-notice/.test(h)) bad.push(`${id}: 「おすすめスポット」の見出しの直下にない`);
}
// 置いてはいけないページ
const must0 = ['quiz', 'ouen-wari', 'kagoshima-oen', 'miyazaki-oen', 'index.html', 'hub', 'list'];
for (const p of must0) { const f = path.join(DIST, p); const files = !fs.existsSync(f) ? [] : fs.statSync(f).isDirectory() ? walk(f) : [f]; for (const x of files) if (/data-fact-notice/.test(fs.readFileSync(x, 'utf8'))) bad.push(`${p}: ${path.relative(DIST, x)} に注意書きがある`); }
function walk(d) { return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []); }
console.log(`旅先ページ ${pages}・転送ページ ${stubs}（対象外）`);
for (const b of bad.slice(0, 20)) console.log('NG', b);
console.log(`注意書きの違反: ${bad.length}`); process.exit(bad.length ? 1 : 0);
