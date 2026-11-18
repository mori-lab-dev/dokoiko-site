#!/usr/bin/env node
/**
 * applyMergeConflictFixes20261118.mjs — 統合した5ページの「数字の食い違い」の修正を適用する（2026-11-18）。
 *   入力: scripts/data/mergeConflictFixes20261118.json（修正の一覧・出典・確認日）。各 edit は「old が対象の文字列にちょうど1回ある」ときだけ適用する（無い・複数あれば止まる）。
 *   出力: logs/conflicts_20261118/changes.json・changes.md（変更の前後）。変更前の写し: backup/conflicts_20261118/。
 * usage: node scripts/applyMergeConflictFixes20261118.mjs [--dry]
 */
import fs from 'fs';
import path from 'path';
const DRY = process.argv.includes('--dry');
const CFG = process.argv.find((a, i) => i > 1 && a.endsWith('.json')) || 'scripts/data/mergeConflictFixes20261118.json';
const SUF = (CFG.match(/Fixes20261118([a-z]*)\.json$/) || [])[1] || '';
const OUTN = SUF ? `changes_${SUF}` : 'changes';
const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
const cache = new Map(); const load = (f) => { if (!cache.has(f)) cache.set(f, JSON.parse(fs.readFileSync(f, 'utf8'))); return cache.get(f); };
const B = SUF === 'c' ? 'backup/facts_20261118c' : SUF ? 'backup/facts_20261118' : 'backup/conflicts_20261118';
if (!DRY) { fs.mkdirSync(B, { recursive: true }); for (const f of new Set(cfg.fixes.flatMap((x) => x.edits.map((e) => e.file)))) { const t = path.join(B, f.replace(/\//g, '__')); if (!fs.existsSync(t)) fs.copyFileSync(f, t); } }
const getPath = (o, p) => p.split('.').reduce((a, k) => a[k], o);
const log = [];
for (const fx of cfg.fixes) for (const e of fx.edits) {
  const data = load(e.file); let holder, key;
  if (e.spot) { const d = data.find((x) => x.id === e.spot[0]); const sp = d.spots.find((s) => s.name === e.spot[1]); if (!sp) throw new Error(`spot なし ${e.spot}`); holder = sp; key = 'description'; }
  else { const g = e.group ? data.groups.find((x) => x.id === e.group) : data; if (!g) throw new Error(`group なし ${e.group}`); const ks = e.field.split('.'); key = ks.pop(); holder = ks.length ? ks.reduce((a, k) => a[k], g) : g; }   // group が無い記事（article.sections が直下）にも使える（2026-11-18）
  const cur = holder[key]; if (typeof cur !== 'string') throw new Error(`文字列でない ${e.file} ${e.group || e.spot} ${e.field || ''}`);
  const n = cur.split(e.old).length - 1; if (n !== 1) throw new Error(`${fx.id}: old が ${n} 回（1回であるべき）: ${e.old.slice(0, 40)} @ ${e.file} ${e.group || e.spot}`);
  const next = cur.replace(e.old, e.new); holder[key] = next;
  log.push({ 修正: fx.id, ファイル: e.file, 対象: e.spot ? `spot ${e.spot.join('/')}` : `${e.group} ${e.field}`, 前: e.old, 後: e.new, 備考: e.memo || '' });
}
if (!DRY) for (const [f, d] of cache) fs.writeFileSync(f, JSON.stringify(d, null, 2) + '\n');
if (!DRY) {
  fs.mkdirSync('logs/conflicts_20261118', { recursive: true });
  fs.writeFileSync(`logs/conflicts_20261118/${OUTN}.json`, JSON.stringify({ 確認日: cfg.date, 修正: cfg.fixes.map((f) => ({ id: f.id, 題: f.topic, 結果: f.result, 出典: f.sources })), 食い違いではなかった: cfg.notDiscrepancy, 変更の前後: log }, null, 1));
}
console.log(DRY ? 'dry' : '適用', log.length, '件');
