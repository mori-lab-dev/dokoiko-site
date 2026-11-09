// seo_changes_<日付>.json の各ページについて、本番の <title> と meta description を取得し、手元の dist と一致するか確かめる（2026-11-09）。
// 使い方: node scripts/verifySeoCopyLive.mjs [seo_changes のファイル名]
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const f = process.argv[2] ?? 'seo_changes_2026-11-09.json';
const ch = JSON.parse(fs.readFileSync(path.join(root, 'logs', f), 'utf8'));
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const pick = (h) => ({ title: dec(h.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim(), description: dec(h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '').trim() });
let ok = 0; const bad = [];
for (const it of ch.items) {
  const local = pick(fs.readFileSync(path.join(root, 'dist/destinations', it.id, 'index.html'), 'utf8'));
  let live = null;
  for (let i = 0; i < 5 && !live; i++) {
    const r = await fetch(`${it.url}?_=${Date.now()}`, { headers: { 'user-agent': 'Mozilla/5.0 dokoiko-verify' } });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
    if (r.status !== 200) { bad.push(`${it.id}: HTTP ${r.status}`); break; }
    live = pick(await r.text());
  }
  if (!live) continue;
  const okT = live.title === local.title && live.title === it.after.title, okD = live.description === local.description && live.description === it.after.description;
  if (okT && okD) ok++; else bad.push(`${it.id}: ${okT ? '' : 'title違い '}${okD ? '' : 'description違い'}`);
}
console.log(`本番と手元の dist が一致（title・description とも）: ${ok}/${ch.items.length}`);
console.log(bad.length ? `❌ ${bad.length}件\n` + bad.join('\n') : '✅ 本番で実測OK');
process.exit(bad.length ? 1 : 0);
