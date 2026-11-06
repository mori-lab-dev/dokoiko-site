// 東北の秘湯 2件の本番実測（2026-11-06）: ページが200、title・meta description・canonical・車なしの項目数・sitemap掲載。
//   node scripts/verifyTohokuHitouLive.mjs [--wait]
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const ids = ['hinoemata-onsen', 'nakanosawa-onsen'];
const wait = process.argv.includes('--wait');
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const get = async (u) => { const r = await fetch(u + (u.includes('?') ? '&' : '?') + '_=' + Date.now()); return { status: r.status, text: r.status === 200 ? await r.text() : '' }; };
async function run() {
  const res = []; const sm = (await get('https://tabidokoiko.com/sitemap.xml')).text;
  for (const id of ids) {
    const d = dests.find((x) => x.id === id); const url = `https://tabidokoiko.com/destinations/${encodeURIComponent(id)}/`;
    const p = await get(url); const h = p.text; const ng = [];
    if (p.status !== 200) ng.push(`HTTP ${p.status}`);
    else {
      if (dec(h.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim() !== d.seo.title) ng.push('title不一致');
      if (dec(h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '').trim() !== d.seo.description) ng.push('meta description不一致');
      if (h.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/)?.[1] !== url) ng.push('canonical不一致');
      if ((h.match(/data-carfree-item/g) || []).length !== d.carFree.items.length) ng.push('車なし項目数不一致');
      if (!h.includes(dec(d.description).slice(0, 20))) ng.push('本文なし');
    }
    if (!sm.includes(`<loc>${url}</loc>`)) ng.push('sitemapに無い');
    res.push([id, ng]);
  }
  // ハブの時間帯別の一覧は各8件までの表示なので、ハブに載るかは実測の対象にしない
  return res;
}
let res;
for (let i = 0; i < (wait ? 24 : 1); i++) { res = await run(); if (res.every(([, n]) => !n.length)) break; if (wait) await new Promise((s) => setTimeout(s, 30000)); }
for (const [id, ng] of res) console.log(`${ng.length ? 'NG' : 'OK'} ${id} ${ng.join(' / ')}`);
process.exit(res.some(([, n]) => n.length) ? 1 : 0);
