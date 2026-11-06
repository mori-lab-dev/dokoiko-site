// 本番の sitemap.xml の検査（2026-11-06）: 日本語URLが%エンコードになっていること、全URLが各ページの canonical タグと完全一致すること。
//   node scripts/verifySitemapLive.mjs [--wait]   （--wait: 反映されるまで最大10分、30秒おきに取り直す）
const SITE = 'https://tabidokoiko.com';
const wait = process.argv.includes('--wait');
const get = async (u) => (await fetch(u + (u.includes('?') ? '&' : '?') + 'cb=' + Date.now(), { headers: { 'cache-control': 'no-cache' } })).text();
let xml, raw = -1;
for (let i = 0; i < (wait ? 20 : 1); i++) {
  xml = await get(`${SITE}/sitemap.xml`);
  raw = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].filter((m) => /[^\x00-\x7f]/.test(m[1])).length;
  if (raw === 0 || !wait) break;
  await new Promise((r) => setTimeout(r, 30000));
}
const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
const enc = locs.filter((u) => /%[0-9A-F]{2}/.test(u)).length;
console.log(`本番 sitemap.xml: ${locs.length}件 / 日本語のまま ${raw}件 / %エンコード(大文字16進) ${enc}件 / 小文字16進 ${locs.filter((u) => /%[0-9a-f]{2}/.test(u.replace(/%[0-9A-F]{2}/g, ''))).length}件`);
let same = 0, diff = 0, fail = 0; const ex = [];
const q = [...locs];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (q.length) {
    const u = q.shift();
    for (let t = 0; t < 4; t++) {
      try {
        const r = await fetch(u, { redirect: 'manual' });
        if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 1500 * (t + 1))); continue; }
        const m = r.status === 200 && (await r.text()).match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/);
        if (!m) { fail++; ex.length < 3 && ex.push(`${u} status=${r.status} canonicalなし`); }
        else if (m[1] === u) same++; else { diff++; ex.length < 3 && ex.push(`${u} ≠ ${m[1]}`); }
        break;
      } catch { if (t === 3) fail++; }
    }
  }
}));
console.log(`本番の各ページの canonical タグと sitemap の loc: 完全一致 ${same} / 不一致 ${diff} / 取得できず ${fail}`);
for (const e of ex) console.log('  例: ' + e);
process.exit(raw === 0 && same === locs.length ? 0 : 1);
