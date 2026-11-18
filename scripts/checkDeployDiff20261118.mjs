// 公開前の確認: 配信リポの作業ツリー（これから公開するもの）と、直前の公開（HEAD）の差が、想定した変更だけかを調べる（2026-11-18）。
//   想定: 旅先ページの注意書き1行（全ページ）・ビルドの識別子（CSS・スクリプトの名前・build-info）・編集（優先ページ以外の R1・R2・R3・多良間島の時刻）・じゃらん受付の日次更新（miyazaki-oen・ouen-wari）
//   優先ページ以外の旅先ページは、CSSのハッシュを除くと HEAD と同一であること。転送ページ・診断・トップなどは変わっていないこと。
import fs from 'fs'; import { execFileSync } from 'child_process';
const R = '../dokoiko'; const g = (...a) => execFileSync('git', ['-C', R, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const edits = (process.argv[2] || 'e,f').split(',').flatMap((x) => JSON.parse(fs.readFileSync(`scripts/data/mergeFactFixes20261118${x}.json`, 'utf8')).fixes.flatMap((f) => f.edits)); const touched = new Set(edits.map((e) => e.page));
const changed = g('-c', 'core.quotepath=off', 'status', '--porcelain').split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''));
const dirs = new Set(), tops = {};
for (const f of changed) { const top = f.split('/')[0]; tops[top] = (tops[top] || 0) + 1; }
const strip = (h) => h.replace(/<p class="fact-notice[^>]*data-fact-notice[^>]*>[^<]*<\/p>\s*/g, '').replace(/astro-[a-z0-9]{8}/g, 'astro-X').replace(/_astro\/[^"' )]+/g, '_astro/X').replace(/<style[\s\S]*?<\/style>/g, '<style/>').replace(/\.fact-notice\{[^}]*\}/g, '');
const dests = changed.filter((f) => f.startsWith('destinations/') && f.endsWith('index.html'));
const fixedParts = {}; let same = 0, diffIds = [], editedPages = 0, unexpected = [];
for (const f of dests) { const id = f.split('/')[1]; let old = ''; try { old = g('show', `HEAD:${f}`); } catch { unexpected.push(`${id}: 新規`); continue; } const now = fs.readFileSync(`${R}/${f}`, 'utf8');
  if (touched.has(id)) { editedPages++;
    // 変えてはいけない部分（canonical・meta・PR表記・お問い合わせの導線・注意書き・構造化データの種類）が HEAD と同じか
    const ex = (h) => ({ canonical: (h.match(/<link[^>]+rel="canonical"[^>]*>/g) || []).join('|'), meta: (h.match(/<meta[^>]+>/g) || []).join('|'), pr: (h.match(/PR/g) || []).length, contact: (h.match(/href="\/contact\/?"/g) || []).length, notice: (h.match(/data-fact-notice[^>]*>[^<]*/g) || []).join('|'), ldTypes: (h.match(/"@type":"[A-Za-z]+"/g) || []).join(',') });
    const a = ex(old), b = ex(now); for (const k of Object.keys(a)) if (a[k] !== b[k]) (fixedParts[k] ||= []).push(id); continue; } if (strip(old) === strip(now)) same++; else { diffIds.push(id); } }
const others = changed.filter((f) => !f.startsWith('destinations/') && !f.startsWith('_astro') && !f.startsWith('data/'));
const out = { 変わったファイル数: changed.length, 最上位ごと: tops, 旅先ページの変更: dests.length, うち編集したページ: editedPages, うちCSS名だけの変更: same, 想定外の変更のある旅先ページ: diffIds, 新規ページ: unexpected, 変えてはいけない部分が変わったページ: Object.fromEntries(Object.entries(fixedParts).map(([k, v]) => [k, v.length])), 旅先以外で変わったもの: others };
fs.writeFileSync('logs/priority_fix_20261118/deploy_diff.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
