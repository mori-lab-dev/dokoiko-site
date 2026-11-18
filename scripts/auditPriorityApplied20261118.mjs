#!/usr/bin/env node
/**
 * auditPriorityApplied20261118.mjs — 優先ページの修正の「適用確認」（2026-11-18）。audit:all の dist の監査。
 *   ① 判定の記録（logs/priority_fix_20261118/results）と突き合わせ、判定の区分（食い違い・確認できず＝記載なし／特定不可）が対象の文が、データにも dist にも残っていないこと
 *      （判定の理由の文言では決めない。体験談・行程案・検索失敗・モデルコースの文は対象外）
 *   ② 置換した値（mergeFactFixes20261118d/e/g の P1）の旧値が、同じページの別の欄に残っていないこと
 *   例外は logs/priority_gap_20261118/allowlist.json（人が読んで、問題でないと判断した理由つきのもの）だけ
 *   最終行: `適用確認の違反: N`
 * usage: node scripts/auditPriorityApplied20261118.mjs [--root <作業ツリーの代わりの場所>]
 */
import fs from 'fs'; import path from 'path';
import { findA, findB } from './lib/priorityGap20261118.mjs';
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const rootArg = process.argv.indexOf('--root'); const R = rootArg > 0 ? process.argv[rootArg + 1] : '.'; const P = (p) => path.join(R, p);
const D = P('logs/priority_fix_20261118'); const dl = J(P('src/data/destinations.json')); const dests = new Map(dl.map((d) => [d.id, d])); const arts = new Map();
for (const d of dl) { const f = P(`src/data/articles/${d.id}.json`); if (fs.existsSync(f)) arts.set(d.id, J(f)); }
const results = fs.readdirSync(`${D}/results`).filter((f) => !f.startsWith('_') && f.endsWith('.json')).map((f) => { const id = f.replace('.json', ''); return { id, res: J(`${D}/results/${f}`), inp: J(`${D}/inputs/page_${id}.json`) }; });
const edits = fs.readdirSync(P('scripts/data')).filter((f) => /^mergeFactFixes20261118[deghij]\.json$/.test(f)).flatMap((f) => J(P(`scripts/data/${f}`)).fixes.flatMap((x) => x.edits));
const allow = fs.existsSync(P('logs/priority_gap_20261118/allowlist.json')) ? J(P('logs/priority_gap_20261118/allowlist.json')) : { a: [], b: [] };
const bad = [];
const { remaining } = findA({ dests, arts, results });
for (const g of remaining) { if (allow.a.some((x) => x.page === g.page && x.n === g.n)) continue; bad.push(`①残っている文 ${g.page} #${g.n}（${g.判定}${g.理由 ? '・' + g.理由 : ''}）「${g.文.slice(0, 30)}」@${g.残っている場所.map((h) => h.where).join('/')}`); }
// dist 側: 文末が「。」の対象文が、dist の旅先ページの本文に残っていないこと
const nz = (s) => String(s).normalize('NFKC').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
if (fs.existsSync(P('dist/destinations'))) for (const { id, res, inp } of results) { const f = P(`dist/destinations/${id}/index.html`); if (!fs.existsSync(f)) continue; const t = nz(fs.readFileSync(f, 'utf8')); const so = new Map(inp.文.map((x) => [x.番号, x]));
  for (const j of res.判定) { const u = so.get(j.n); if (!u || !(j.判定 === '食い違い' || (j.判定 === '確認できず' && !/体験談|行程案|検索失敗/.test(j.理由 || ''))) || String(u.場所).includes('モデルコース')) continue; const s = u.文.trim(); if (!s.endsWith('。') || s.length < 12) continue; if (nz(dests.get(id).description || '').includes(nz(s))) continue;   // description（メタに出る欄）にある文は、この検査の対象外（別に一覧にして判断する）
     if (allow.a.some((x) => x.page === id && x.n === j.n)) continue; if (t.includes(nz(s))) bad.push(`①dist に残っている文 ${id} #${j.n}「${s.slice(0, 30)}」`); } }
for (const g of findB({ dests, arts, edits })) { if (allow.b.some((x) => x.page === g.page && x.置換 === g.置換 && x.残っている文 === g.残っている文)) continue; bad.push(`②旧値が残っている ${g.page}（${g.置換}）@${g.残っている場所}「${g.残っている文.slice(0, 36)}」`); }
// メタ（dist）: P1 の旧値が、dist の meta（description・og・twitter）と構造化データに残っていないこと
if (fs.existsSync(P('dist/destinations'))) { const seen = new Set(); for (const e of edits.filter((x) => x.rule === 'P1' && x.old && String(x.old).length >= 3)) { const f = P(`dist/destinations/${e.page}/index.html`); if (!fs.existsSync(f)) continue; const key = `${e.page}|${e.old}`; if (seen.has(key)) continue; seen.add(key); const h = fs.readFileSync(f, 'utf8'); const metas = [...(h.match(/<meta[^>]+content="[^"]*"/g) || []), ...[...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => x[1])].join('\n'); const dm = metas.replace(/&#38;|&amp;/g, '&'); if (dm.includes(e.old) && !allow.b.some((x) => x.page === e.page && e.old && x.置換 === `${e.old} → ${e.new}` && x.残っている文 === 'メタ・構造化データ')) bad.push(`②メタ・構造化データ（dist）に旧値が残っている ${e.page}（${e.old} → ${e.new}）`); } }
console.log(`優先ページ ${results.length}・判定の対象の文を調べた。例外（allowlist）a:${allow.a.length} b:${allow.b.length}`); for (const b of bad.slice(0, 80)) console.log('NG', b); console.log(`適用確認の違反: ${bad.length}`); process.exit(bad.length ? 1 : 0);
