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

const nzh = (s) => s.replace(/&#38;|&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/<[^>]+>/g, '').replace(/\s+/g, '');
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
// (c) 画像を外した全件: 旧画像の外部URL・ローカルのファイルが、そのページに無い。ローカルのファイルは 404
const rm = J('backup/images_20261119/removed.json').外した; const retire = J('logs/identity_20261120/retire_log.json'); const retired = new Set(retire.filter((r) => r.to).map((r) => r.from));
const img = { 件数: rm.length, NG: [], ファイル404: 0, ファイル404でない: [] };
for (const r of rm) { const id = r.key.split('|')[0]; const p = prod.get(`/destinations/${id}/`); const url = r.外した画像 || r.外したファイル; if (!p || p.status !== 200) { img.NG.push(`${id} ページ ${p?.status}`); continue; }
  if (r.種類 === '見どころ' && url) { const tail2 = url.startsWith('http') ? url.split('/').slice(-2)[0] : url; if (p.text.includes(tail2)) img.NG.push(`${id} 旧画像が残る ${tail2.slice(0, 40)}`); }
  if (r.ローカル || r.外したファイル) { const f = r.外した画像 || r.外したファイル; const rr = await fetch(BASE + encodeURI(f), { headers: { 'user-agent': 'dokoiko-weekly-check' } }); if (rr.status === 404) img.ファイル404++; else img.ファイル404でない.push(`${f} ${rr.status}`); } }
res.画像を外した全件 = img;
// (d) 6ページの転送: 200・canonical が転送先（エンコード）・meta refresh が転送先・noindex なし・転送先が200
const mv = []; for (const r of retire.filter((x) => x.to)) { const p = prod.get(`/destinations/${r.from}/`); const t = p?.text || ''; const canon = t.match(/<link rel="canonical" href="([^"]*)"/)?.[1]; const ref = t.match(/<meta http-equiv="refresh" content="([^"]*)"/)?.[1]; const tp = prod.get(`/destinations/${r.to}/`);
  mv.push({ from: r.from, 200: p?.status === 200, canonical正: canon === `${BASE}/destinations/${encodeURIComponent(r.to)}/`, refresh正: ref === `0; url=/destinations/${r.to}/`, noindexなし: !/noindex/i.test(t), 転送先200: tp?.status === 200 }); }
res.転送ページ6 = mv; res.転送ページ6のNG = mv.filter((m) => Object.values(m).some((v) => v === false)).length;
// (e) 診断: 結果ページ（診断の旅先 + 転送）が全件200・転送の結果ページは noindex,follow と canonical /quiz/・共有画像は 200
const quizPages = [...prod.keys()].filter((u) => /^\/quiz\/r\/[0-9a-f]{8}\/$/.test(u)); const mvCodes = J('src/data/quizMovedCodes.json'); const qd = J('src/data/quizDestinations.json');
const qz = { 結果ページ数: quizPages.length, 診断の旅先数: qd.length, 転送コード数: Object.keys(mvCodes).length, 非200: quizPages.filter((u) => prod.get(u).status !== 200).length, 転送の形のNG: [], 共有画像_非200: [] };
for (const c of Object.keys(mvCodes)) { const p = prod.get(`/quiz/r/${c}/`); if (!p || p.status !== 200 || !/noindex,follow/.test(p.text) || !p.text.includes(`<link rel="canonical" href="${BASE}/quiz/"`)) qz.転送の形のNG.push(c); }
for (const d of qd.slice(0, qd.length)) { if (Math.random() < 0.08) { const rr = await fetch(`${BASE}/quiz/og/${d.code}.png`, { method: 'HEAD' }); if (rr.status !== 200) qz.共有画像_非200.push(d.code); } }
res.診断 = qz;
// (f) 応援割・車なし旅: 確認日が 2026年11月19日 になり、古い確認日（2026年11月4日）の項目が無い。直した4項目の旧文が無い
const ch = J('logs/ouen_carfree_20261119/changes.json').filter((c) => c.前); const ox = { 直した項目: ch.length, NG: [] };
const ouenPages = ['/ouen-wari/', '/kagoshima-fukko/', '/fukuoka-oen/', '/kumamoto-oen/', '/saga-oen/', '/nagasaki-oen/', '/oita-oen/', '/destinations/chikugogawa/', '/destinations/kurokawa-k/', '/destinations/niche_大分_3/'];
for (const u of ouenPages) { const p = prod.get(u); if (!p || p.status !== 200) { ox.NG.push(`${u} ${p?.status}`); continue; } const n19 = (p.text.match(/2026年11月19日/g) || []).length; ox[u] = { '2026年11月19日の件数': n19 }; }
for (const c of ch) { const pages = c.id.startsWith('saga-oen') ? ['/saga-oen/'] : c.id.startsWith('chikugogawa') ? ['/destinations/chikugogawa/'] : ['/destinations/kurokawa-k/']; const old = c.前; for (const u of pages) { const t = nzh(prod.get(u)?.text || ''); if (t.includes(nzh(old).slice(0, 60)) && nzh(old).slice(0, 60).length > 20) ox.NG.push(`${c.id} 旧文が残る`); } }
res.応援割と車なし旅 = ox;
// (g) 統合ページ・既存ページ: 統合関連27ページが200
const must = ['/destinations/nishinoshima/', '/destinations/tokashiki-jima/', '/destinations/shiraishijima/', '/destinations/chichijima/', '/destinations/hitoyoshi/', '/destinations/kuniga/', '/destinations/aharen/', '/quiz/', '/', '/list/', '/about/'];
res.主要ページ = must.map((u) => `${u} ${prod.get(u)?.status}`).filter((x) => !x.endsWith('200'));
res.バイト不一致の数 = res.バイト不一致.length;
fs.writeFileSync('logs/identity_20261120/prod_verify.json', JSON.stringify(res, null, 1));
console.log(JSON.stringify({ ...res, バイト不一致: res.バイト不一致.slice(0, 5), 転送ページ6: undefined }, null, 1));
