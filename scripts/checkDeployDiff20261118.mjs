// 公開前の確認: 配信リポの作業ツリー（これから公開するもの）と、直前の公開（HEAD）の差が、想定した変更だけかを調べる（2026-11-18）。
//   想定: 旅先ページの注意書き1行（全ページ）・ビルドの識別子（CSS・スクリプトの名前・build-info）・優先ページの修正・削除・じゃらん受付の日次更新（miyazaki-oen・ouen-wari）
//   優先ページ以外の旅先ページは、注意書きとCSSのハッシュを除くと HEAD と同一であること。転送ページ・診断・トップなどは変わっていないこと。
import fs from 'fs'; import { execFileSync } from 'child_process';
const R = '../dokoiko'; const g = (...a) => execFileSync('git', ['-C', R, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const edits = JSON.parse(fs.readFileSync('scripts/data/mergeFactFixes20261118d.json', 'utf8')).fixes[0].edits; const touched = new Set(edits.map((e) => e.page));
const changed = g('-c', 'core.quotepath=off', 'status', '--porcelain').split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''));
const dirs = new Set(), tops = {};
for (const f of changed) { const top = f.split('/')[0]; tops[top] = (tops[top] || 0) + 1; }
const strip = (h) => h.replace(/<p class="fact-notice[^>]*data-fact-notice[^>]*>[^<]*<\/p>\s*/g, '').replace(/astro-[a-z0-9]{8}/g, 'astro-X').replace(/_astro\/[^"' )]+/g, '_astro/X').replace(/<style[\s\S]*?<\/style>/g, '<style/>').replace(/\.fact-notice\{[^}]*\}/g, '');
const dests = changed.filter((f) => f.startsWith('destinations/') && f.endsWith('index.html'));
let same = 0, diffIds = [], editedPages = 0, unexpected = [];
for (const f of dests) { const id = f.split('/')[1]; let old = ''; try { old = g('show', `HEAD:${f}`); } catch { unexpected.push(`${id}: 新規`); continue; } const now = fs.readFileSync(`${R}/${f}`, 'utf8');
  if (touched.has(id)) { editedPages++; continue; } if (strip(old) === strip(now)) same++; else { diffIds.push(id); } }
const others = changed.filter((f) => !f.startsWith('destinations/') && !f.startsWith('_astro') && !f.startsWith('data/'));
const out = { 変わったファイル数: changed.length, 最上位ごと: tops, 旅先ページの変更: dests.length, うち優先ページの修正: editedPages, うち注意書き・CSS名だけの変更: same, 想定外の変更のある旅先ページ: diffIds, 新規ページ: unexpected, 旅先以外で変わったもの: others };
fs.writeFileSync('logs/priority_fix_20261118/deploy_diff.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
