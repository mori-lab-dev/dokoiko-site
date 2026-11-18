#!/usr/bin/env node
/**
 * verifyPriorityProd20261118.mjs — 本番（tabidokoiko.com）の実測（2026-11-18・読み取りのみ）。
 *   (a) dist の全HTML（約2,500）を本番から取り、本番の中身が dist とバイト一致か（一致しないものは一覧）
 *   (b) 旅先ページ全件で、注意書き（data-fact-notice）がちょうど1つ・転送ページ/診断/応援割/一覧/hub/トップには無いこと（全件の件数）
 *   (c) 修正・削除の代表（種類ごとに20件以上）: 本番のページに、旧文（置換は旧文・削除は削除した文）が無く、置換は新しい値が入っていること
 *   (d) 統合ページ・転送ページが HTTP 200 であること
 * usage: node scripts/verifyPriorityProd20261118.mjs
 */
import fs from 'fs'; import path from 'path';
const BASE = 'https://tabidokoiko.com';
const files = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) files.push(p); } }; walk('dist');
const urlOf = (f) => '/' + path.relative('dist', f).replace(/index\.html$/, '').replace(/\\/g, '/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(u, n = 0) { try { const r = await fetch(BASE + encodeURI(decodeURI(u)), { headers: { 'user-agent': 'dokoiko-weekly-check' }, signal: AbortSignal.timeout(40000) }); if ((r.status === 429 || r.status >= 500) && n < 6) { await sleep(1500 * (n + 1)); return get(u, n + 1); } return { status: r.status, text: await r.text() }; } catch (e) { if (n < 6) { await sleep(1500 * (n + 1)); return get(u, n + 1); } return { status: 0, text: '', err: String(e) }; } }
const prod = new Map(); let i = 0; const q = [...files];
await Promise.all(Array.from({ length: 8 }, async () => { while (q.length) { const f = q.shift(); const u = urlOf(f); prod.set(u, await get(u)); i++; } }));
const res = { 取得: files.length, 非200: [], バイト不一致: [], 旅先ページ: 0, 転送ページ: 0, 注意書きの件数が1でない旅先: [], 注意書きがあってはいけないページ: [] };
for (const f of files) { const u = urlOf(f); const p = prod.get(u); const d = fs.readFileSync(f, 'utf8'); if (p.status !== 200) { res.非200.push(`${u} ${p.status}`); continue; } if (p.text !== d) res.バイト不一致.push(u);
  const n = (p.text.match(/data-fact-notice/g) || []).length; const isDest = /^\/destinations\/[^/]+\/$/.test(u); const stub = /http-equiv=["']refresh["']/i.test(d);
  if (isDest && !stub) { res.旅先ページ++; if (n !== 1) res.注意書きの件数が1でない旅先.push(`${u} ${n}`); } else { if (isDest && stub) res.転送ページ++; if (n) res.注意書きがあってはいけないページ.push(`${u} ${n}`); } }
// (c)
const dec = (s) => s.replace(/&#38;|&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
const nz = (s) => dec(s).replace(/<[^>]+>/g, '').replace(/\s+/g, '');
const edits = JSON.parse(fs.readFileSync('scripts/data/mergeFactFixes20261118d.json', 'utf8')).fixes[0].edits;
const kinds = {}; for (const e of edits) (kinds[e.種類] ||= []).push(e);
let seed = 20261118; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const rep = { 検査: 0, NG: [], 種類ごと: {} };
for (const [k, list] of Object.entries(kinds)) { const pick = [...list].sort(() => rnd() - 0.5).slice(0, Math.max(20, 0)); let ok = 0;
  for (const e of pick) { const u = `/destinations/${e.page}/`; const p = prod.get(u); const t = p ? nz(p.text) : ''; const gone = e.rule === 'P3' ? e.old : (e.rule === 'P1' ? e.旧文 : e.削除した文); const g = nz(gone || '');
    let good = !!p && p.status === 200 && g && !t.includes(g); if (e.rule === 'P1' && good) good = t.includes(nz(e.new)); if (e.rule === 'P3') good = !!p && (t.includes(nz(e.new)) && !t.includes(nz(e.old)));
    // 旧文が空（旅先ページに旧文が元々表示されない欄＝見どころの説明は JSON-LD にある）でも dist と一致していれば良い
    rep.検査++; if (good) ok++; else rep.NG.push({ page: e.page, rule: e.rule, 種類: k, 旧: String(gone).slice(0, 40) }); }
  rep.種類ごと[k] = { 件数: list.length, 検査: pick.length, 本番で旧文なし: ok }; }
res.修正の代表 = rep;
// (d)
const pairs = JSON.parse(fs.readFileSync('scripts/data/mergedPages.json', 'utf8')).pairs; const chk = [...new Set(pairs.flatMap((p) => [p.from, p.to]))]; const st = {}; for (const id of chk) { const r = await get(`/destinations/${id}/`); st[r.status] = (st[r.status] || 0) + 1; }
res.統合関連ページのHTTP = st; res.統合関連ページ数 = chk.length;
fs.writeFileSync('logs/priority_fix_20261118/prod_verify.json', JSON.stringify(res, null, 1));
console.log(JSON.stringify({ ...res, 非200: res.非200.slice(0, 5), バイト不一致: res.バイト不一致.slice(0, 8), バイト不一致の数: res.バイト不一致.length }, null, 1));
