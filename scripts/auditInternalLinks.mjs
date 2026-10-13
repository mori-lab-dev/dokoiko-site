#!/usr/bin/env node
/**
 * auditInternalLinks.mjs — 旅先ページどうしの内部リンクを、ビルド済みHTML（dist）で数える（2026-10-13）。
 *
 *   ・各旅先ページから、ほかの旅先ページへのリンク（重複を除く）が何本あるか。少ないページ（既定は10本未満）を数える
 *   ・どの旅先ページからも1本もリンクされていない孤立ページ（orphan）
 *   ・リンクのアンカーが空（画像だけ・文字なし）のものは「文字リンク」に数えない
 * 検出のみ。usage: node scripts/auditInternalLinks.mjs [--min 10] [--verbose]
 */
import fs from 'fs';
import path from 'path';
const args = process.argv.slice(2);
const MIN = args.includes('--min') ? Number(args[args.indexOf('--min') + 1]) : 10;
const VERBOSE = args.includes('--verbose');
const DIST = args.includes('--dist') ? args[args.indexOf('--dist') + 1] : 'dist';   // 比較用: 配信リポ（../dokoiko）を指せる
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const ids = new Set(dests.map((d) => d.id));
const inbound = new Map(dests.map((d) => [d.id, 0]));
const out = new Map();
let textLinks = 0;
for (const d of dests) {
  const f = path.join(DIST, 'destinations', d.id, 'index.html');
  if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, 'utf8');
  const targets = new Set();
  for (const m of html.matchAll(/<a\s[^>]*href="\/destinations\/([^\/"]+)\/"[^>]*>([\s\S]*?)<\/a>/g)) {
    const id = decodeURIComponent(m[1]);
    if (id === d.id || !ids.has(id)) continue;
    if (!targets.has(id)) { targets.add(id); inbound.set(id, inbound.get(id) + 1); }
    if (m[2].replace(/<[^>]*>/g, '').trim()) textLinks++;
  }
  out.set(d.id, targets.size);
}
const counts = [...out.values()];
const few = [...out].filter(([, c]) => c < MIN).map(([id]) => id);
const orphan = [...inbound].filter(([, c]) => c === 0).map(([id]) => id);
const avg = (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1);
console.log(`旅先ページ ${counts.length} 件 / 他の旅先へのリンク 平均 ${avg}本・最少 ${Math.min(...counts)}本`);
console.log(`リンクが${MIN}本未満のページ: ${few.length}件${VERBOSE && few.length ? ' ' + few.slice(0, 12).join(', ') : ''}`);
console.log(`どの旅先ページからもリンクされていない（孤立）: ${orphan.length}件${VERBOSE && orphan.length ? ' ' + orphan.slice(0, 12).join(', ') : ''}`);
console.log(`リンクの総数（重複を除く）: ${[...out.values()].reduce((a, b) => a + b, 0)} / 文字つきリンクの数: ${textLinks}`);
