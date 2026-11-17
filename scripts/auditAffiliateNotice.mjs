#!/usr/bin/env node
/**
 * auditAffiliateNotice.mjs — アフィリエイトの PR 表記と rel の検査（dist を読むだけ）。
 *   npm run build && npm run audit:affiliate
 * 検査:
 *   1. アフィリエイトのリンク（hb.afl.rakuten.co.jp / ck.jp.ap.valuecommerce.com）を持つページには PR 表記がある
 *   2. そのリンクの rel に sponsored がある
 *   3. アフィリエイトのリンクが無いページ（応援割・クーポン関連など）には PR 表記を出さない
 * 2026-11-04（運用基準・VC の規約に合わせた表記の導入時に追加）。audit:all には入れていない（件数16を変えないため）。
 */
import fs from 'fs';
import path from 'path';

const DIST = path.resolve('dist');
const NOTICE = 'このページの宿・レンタカーなどのリンクは広告（アフィリエイト）を含みます';
const AFF = /(hb\.afl\.rakuten\.co\.jp|ck\.jp\.ap\.valuecommerce\.com)/;

function* pages(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* pages(p);
    else if (e.name === 'index.html') yield p;
  }
}

let affPages = 0, noNotice = [], noSponsored = [], noticeOnly = [];
for (const f of pages(DIST)) {
  const h = fs.readFileSync(f, 'utf8');
  const anchors = h.match(/<a\b[^>]*>/g) || [];
  const aff = anchors.filter((a) => AFF.test(a));
  const hasNotice = h.includes(NOTICE);
  const rel = path.relative(DIST, path.dirname(f)) || '/';
  if (aff.length) {
    affPages++;
    if (!hasNotice) noNotice.push(rel);
    if (aff.some((a) => !/rel="[^"]*\bsponsored\b/.test(a))) noSponsored.push(rel);
  } else if (hasNotice) {
    noticeOnly.push(rel);
  }
}
console.log(`アフィリエイトのリンクがあるページ: ${affPages}`);
console.log(`PR 表記なし: ${noNotice.length} ${noNotice.slice(0, 3).join(', ')}`);
console.log(`sponsored の無いリンクを含むページ: ${noSponsored.length} ${noSponsored.slice(0, 3).join(', ')}`);
console.log(`リンクが無いのに PR 表記があるページ: ${noticeOnly.length} ${noticeOnly.slice(0, 3).join(', ')}`);
const ok = noNotice.length === 0 && noSponsored.length === 0 && noticeOnly.length === 0;
console.log(ok ? '✅ 合格' : '❌ 不合格');
process.exit(ok ? 0 : 1);
