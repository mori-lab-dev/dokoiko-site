#!/usr/bin/env node
/**
 * verifyOuenLive.mjs — 本番（tabidokoiko.com）の応援割ページを実取得して確かめる（2026-11-04）。
 * ・HTTP 200・canonical が自分・「確認日」が最新・出典つきの枠の数
 * ・出典つきの枠の外に割引率・上限額が無い（scripts/factRules.mjs）・ローカルの dist と中身が一致
 * usage: node scripts/verifyOuenLive.mjs [--date 2026年11月4日]
 */
import fs from 'fs';
import { SCHEMES } from '../src/data/ouenWari.ts';
import { unsourcedNumbers } from './factRules.mjs';
const args = process.argv.slice(2);
const date = args.includes('--date') ? args[args.indexOf('--date') + 1] : '2026年11月4日';
const slugs = ['ouen-wari', ...SCHEMES.map((s) => s.slug)];
let ng = 0;
for (const slug of slugs) {
  const url = `https://tabidokoiko.com/${slug}/`;
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 verifyOuenLive' } });
  const html = await res.text();
  const local = fs.readFileSync(`dist/${slug}/index.html`, 'utf8');
  const problems = [];
  if (res.status !== 200) problems.push(`HTTP ${res.status}`);
  if (!html.includes(`<link rel="canonical" href="${url}"`)) problems.push('canonical が自分を指していない');
  if (!html.includes(date)) problems.push(`確認日 ${date} が無い`);
  const facts = (html.match(/data-fact/g) || []).length;
  const bad = unsourcedNumbers(html);
  if (bad.length) problems.push(`出典なしの数字 ${bad.length}件: ${bad[0]}`);
  if (html !== local) problems.push('ローカル dist と中身が違う（反映待ちか差し替わっていない）');
  if (slug !== 'ouen-wari' && !SCHEMES.find((s) => s.slug === slug).status.includes('ended') && facts === 0) problems.push('出典つきの枠が0');
  console.log(`${problems.length ? 'NG' : 'OK'}  ${slug.padEnd(16)} 枠${String(facts).padStart(2)} ${problems.join(' / ')}`);
  if (problems.length) ng++;
}
console.log(ng ? `❌ ${ng}件NG` : '✅ 本番で実測OK');
process.exit(ng ? 1 : 0);
