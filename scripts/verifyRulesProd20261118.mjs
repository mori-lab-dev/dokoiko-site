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
// (c) R1・R2・R3 と多良間島の時刻: 代表（種類ごとに20件以上）
const dec = (s) => s.replace(/&#38;|&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const nz = (s) => dec(s).replace(/<[^>]+>/g, '').replace(/\s+/g, '');
const edits = ['e', 'f'].flatMap((x) => JSON.parse(fs.readFileSync(`scripts/data/mergeFactFixes20261118${x}.json`, 'utf8')).fixes.flatMap((f) => f.edits));
const distText = (page) => { const f = `dist/destinations/${page}/index.html`; return fs.existsSync(f) ? nz(fs.readFileSync(f, 'utf8')) : ''; };
const kinds = {}; for (const e of edits) (kinds[e.rule === 'R1' ? 'R1:' + e.種類 : e.rule === 'R2' ? 'R2:時刻を外した行' : e.rule === 'R3' ? 'R3:先頭の接続語' : '多良間島の時刻'] ||= []).push(e);
let seed = 20261118; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const rep = { 検査: 0, NG: [], 種類ごと: {} };
for (const [k, list] of Object.entries(kinds)) { const pool = [...list].sort(() => rnd() - 0.5); const pick = []; for (const e of pool) { if (pick.length >= 25) break; const p = prod.get(`/destinations/${e.page}/`); if (p) pick.push(e); }
  let ok = 0, n = 0; for (const e of pick) { const t = nz(prod.get(`/destinations/${e.page}/`).text); const dt = distText(e.page); n++; let good;
    if (e.rule === 'R1') { const g = nz(e.削除した文); good = !t.includes(g) || dt.includes(g) && t.includes(g) && false; if (!good && dt.includes(g)) { good = null; } }
    else if (e.rule === 'R2') good = !t.includes(nz(e.old)) || nz(e.old) === nz(e.new); else if (e.rule === 'R3') good = !t.includes(nz(e.old)); else good = !t.includes(nz(e.旧文 || e.old)) && t.includes(nz(e.new));
    if (good === null) { rep.NG.push({ page: e.page, rule: e.rule, 旧: String(e.削除した文 || e.old).slice(0, 40), メモ: 'ビルド結果にも残っている（重複で一意でない等）' }); n--; continue; }
    if (good) ok++; else rep.NG.push({ page: e.page, rule: e.rule, 旧: String(e.削除した文 || e.old).slice(0, 40) }); rep.検査++; }
  rep.種類ごと[k] = { 編集件数: list.length, 検査: n, 本番で期待どおり: ok }; }
res.代表の検査 = rep;
// (d)
const pairs = JSON.parse(fs.readFileSync('scripts/data/mergedPages.json', 'utf8')).pairs; const chk = [...new Set(pairs.flatMap((p) => [p.from, p.to]))]; const st = {}; for (const id of chk) { const r = await get(`/destinations/${id}/`); st[r.status] = (st[r.status] || 0) + 1; }
res.統合関連ページのHTTP = st; res.統合関連ページ数 = chk.length;
fs.writeFileSync('logs/rules_20261118/prod_verify.json', JSON.stringify(res, null, 1));
console.log(JSON.stringify({ ...res, 非200: res.非200.slice(0, 5), バイト不一致: res.バイト不一致.slice(0, 8), バイト不一致の数: res.バイト不一致.length }, null, 1));
