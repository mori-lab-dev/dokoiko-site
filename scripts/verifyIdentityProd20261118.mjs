#!/usr/bin/env node
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
// (c) 今回の編集（g・h）の全件: 旧文（置換・句の削除は元の文、文の削除は削除した文、時刻は old）が本番に無く、置換は新しい値が本番にある
const dec = (s) => s.replace(/&#38;|&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const nz = (s) => dec(s).replace(/<[^>]+>/g, '').replace(/\s+/g, '');
const edits = ['l'].flatMap((x) => JSON.parse(fs.readFileSync(`scripts/data/mergeFactFixes20261118${x}.json`, 'utf8')).fixes.flatMap((f) => f.edits));
const rep = { 編集の件数: edits.length, 全件: [], NG: [], 種類ごと: {} };
for (const e of edits) { const p = prod.get(`/destinations/${e.page}/`); const t = p ? nz(p.text) : ''; const gone = e.old; const shortOld = String(gone).length < 6; let good = !!p && p.status === 200 && (shortOld || !t.includes(nz(gone)));
  if (good && e.new !== '' && e.rule !== 'P3') good = t.includes(nz(e.new)); if (good && e.rule === 'P3') good = t.includes(nz(e.new));
  const k = e.種類; rep.種類ごと[k] ||= { 件数: 0, 旧文なし: 0 }; rep.種類ごと[k].件数++; if (good) rep.種類ごと[k].旧文なし++; else rep.NG.push({ page: e.page, rule: e.rule, 旧: String(gone).slice(0, 40) }); rep.全件.push({ page: e.page, rule: e.rule, 旧: String(gone).slice(0, 30), 本番で期待どおり: good }); }
res.全件の検査 = rep;

// (c2) メタ: 変わった6ページで、meta description・og:description・twitter:description・構造化データの description が互いに同じで、旧値が無いこと
const chg = []; const mrep = [];
for (const c of chg) { const p = prod.get(`/destinations/${c.id}/`); const h = p ? p.text : ''; const m = (re) => { const x = h.match(re); return x ? dec(x[1]) : ''; }; const d1 = m(/<meta name="description" content="([^"]*)"/), d2 = m(/<meta property="og:description" content="([^"]*)"/), d3 = m(/<meta name="twitter:description" content="([^"]*)"/);
  const lds = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => { try { return JSON.parse(x[1]); } catch { return null; } }).filter(Boolean); const ds = []; const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'description' && typeof v === 'string') ds.push(v); else walk(v); } }; walk(lds);
  const same = d1 === d2 && d2 === d3 && d1 === c.変更後.description && ds.includes(d1); const oldGone = !d1.includes(c.変更前.description) && c.変更前.description !== d1; mrep.push({ id: c.id, 三つが同じで変更後と一致: same, 旧メタなし: oldGone }); }
res.メタの検査 = mrep;
// (d)
const pairs = JSON.parse(fs.readFileSync('scripts/data/mergedPages.json', 'utf8')).pairs; const chk = [...new Set(pairs.flatMap((p) => [p.from, p.to]))]; const st = {}; for (const id of chk) { const r = await get(`/destinations/${id}/`); st[r.status] = (st[r.status] || 0) + 1; }
res.統合関連ページのHTTP = st; res.統合関連ページ数 = chk.length;
fs.writeFileSync('logs/identity_20261118/prod_verify.json', JSON.stringify(res, null, 1));
console.log(JSON.stringify({ ...res, 非200: res.非200.slice(0, 5), バイト不一致: res.バイト不一致.slice(0, 8), バイト不一致の数: res.バイト不一致.length }, null, 1));
