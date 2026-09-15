#!/usr/bin/env node
/**
 * applyDescRewrite.mjs — 書き直した description を destinations.json に反映する。
 *
 * 入れる前に必ず descStyleCheck の全項目を通す。ここを素通りさせると、
 * 字数や禁止句が混ざったまま本番に出る（過去に spot の字数不足で4回やり直した）。
 * 1件でも落ちたら何も書かずに終わる。
 *
 * 元の文は logs/desc_rewrite_backup.json に退避する。
 *
 * usage: node scripts/applyDescRewrite.mjs <new.json> [...] [--apply]
 */
import fs from 'fs';
import { checkDesc } from './descStyleCheck.mjs';

const APPLY = process.argv.includes('--apply');
const files = process.argv.slice(2).filter((a) => a !== '--apply');
const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];

const incoming = {};
for (const f of files) Object.assign(incoming, JSON.parse(fs.readFileSync(f, 'utf8')));

const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
const byId = new Map(data.map((d) => [d.id, d]));

let ng = 0;
for (const [id, text] of Object.entries(incoming)) {
  const d = byId.get(id);
  if (!d) { console.log(`❌ ${id} が見つからない`); ng++; continue; }
  const r = checkDesc(text);
  if (!r.ok) { console.log(`❌ ${id} ${r.issues.join(' / ')}`); ng++; }
}
if (ng) { console.log(`\nNG ${ng}件。1件でも落ちたら反映しない`); process.exit(1); }

const backup = {};
for (const [id, text] of Object.entries(incoming)) {
  const d = byId.get(id);
  backup[id] = d.description;
  d.description = text;
}

const before = Object.values(backup);
const after = Object.values(incoming);
const avg = (a) => Math.round(a.reduce((s, t) => s + t.length, 0) / a.length);
console.log(`${after.length}件 すべて基準を満たしている`);
console.log(`  平均字数 ${avg(before)} → ${avg(after)}`);
console.log(`  「ここでしか」を含む件数 ${before.filter((t) => t.includes('ここでしか')).length} → ${after.filter((t) => t.includes('ここでしか')).length}`);

if (APPLY) {
  fs.writeFileSync('logs/desc_rewrite_backup.json', JSON.stringify(backup, null, 1));
  const json = JSON.stringify(data, null, 2) + '\n';
  for (const f of FILES) fs.writeFileSync(f, json);
  console.log('✅ destinations.json を更新 / 元の文は logs/desc_rewrite_backup.json');
} else {
  console.log('（--apply で反映）');
}
