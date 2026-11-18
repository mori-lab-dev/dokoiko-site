// 旅先ページ全件の、メタ（title・description・og:title・og:description・twitter）と構造化データ（description 類）を、dist から抜き出す（2026-11-18・読み取りのみ）。
// usage: node scripts/extractMeta20261118.mjs <出力のjson> [dist]
import fs from 'fs'; import path from 'path';
const out = process.argv[2]; const DIST = process.argv[3] || 'dist';
const dec = (s) => s.replace(/&#38;|&amp;/g, '&').replace(/&quot;|&#34;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const res = {}; for (const id of fs.readdirSync(path.join(DIST, 'destinations'))) { const f = path.join(DIST, 'destinations', id, 'index.html'); if (!fs.existsSync(f)) continue; const h = fs.readFileSync(f, 'utf8'); if (/http-equiv=["']refresh["']/i.test(h)) continue;
  const m = (re) => { const x = h.match(re); return x ? dec(x[1]) : ''; };
  const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => { try { return JSON.parse(x[1]); } catch { return null; } }).filter(Boolean);
  const descs = []; const walk = (o) => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) { if (k === 'description' && typeof v === 'string') descs.push(v); else walk(v); } } }; walk(ld);
  res[id] = { title: m(/<title>([^<]*)<\/title>/), description: m(/<meta name="description" content="([^"]*)"/), ogTitle: m(/<meta property="og:title" content="([^"]*)"/), ogDescription: m(/<meta property="og:description" content="([^"]*)"/), twDescription: m(/<meta name="twitter:description" content="([^"]*)"/), ldDescriptions: descs }; }
fs.writeFileSync(out, JSON.stringify(res)); console.log('pages', Object.keys(res).length);
