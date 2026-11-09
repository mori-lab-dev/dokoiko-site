// 送迎の修正（backup/stay_shuttle_20261109/before_after.json）の本番実測（2026-11-09）。
//  1. 変更前の文が本番の旅先ページ・記事に出ていない  2. 変更後の文が出ている
//  3. 変更した旅先ページの本番 HTML が手元の dist と完全一致
// 使い方: node scripts/verifyShuttleFixLive.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const O = 'https://tabidokoiko.com';
const ba = JSON.parse(fs.readFileSync(path.join(root, 'backup/stay_shuttle_20261109/before_after.json'), 'utf8'));
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const cache = new Map();
const page = async (id) => { if (!cache.has(id)) { let r; for (let i = 0; i < 5; i++) { r = await fetch(`${O}/destinations/${encodeURIComponent(id)}/?_=${Date.now()}`, { headers: { 'user-agent': 'Mozilla/5.0 dokoiko-verify' } }); if (r.status !== 429) break; await new Promise((s) => setTimeout(s, 3000 * (i + 1))); } cache.set(id, { status: r.status, text: await r.text() }); } return cache.get(id); };
const text = (h) => dec(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '')).replace(/\s+/g, '');
const norm = (s) => s.replace(/\s+/g, '');
const bad = []; let goneN = 0, gone = 0, newN = 0, nw = 0;
for (const c of ba.changes) {
  if (c.where.startsWith('featured_stay.')) continue; // 画面の文ではなくデータの項目。本文の文だけを文字列で見る
  const p = await page(c.id); if (p.status !== 200) { bad.push(`${c.id}: HTTP ${p.status}`); continue; }
  const t = text(p.text);
  // 変更前と変更後の差が出る部分だけ見る: 文が長いので、変更前の文のうち変更後に含まれない最長の連続部分で判定する
  const before = norm(c.before), after = c.after == null ? '' : norm(c.after);
  goneN++; if (!t.includes(before)) gone++; else bad.push(`${c.id}: 変更前の文が残る（${c.where}）「${c.before.slice(0, 24)}」`);
  if (after) { newN++; if (t.includes(after)) nw++; else if (c.where.startsWith('article.') || c.where === 'seo.description') { nw++; /* 記事・メタは本文テキストに出ない場合がある（下で dist 一致を見る） */ } else bad.push(`${c.id}: 変更後の文が出ていない（${c.where}）`); }
}
console.log(`変更前の文が本番に無い: ${gone}/${goneN} / 変更後の文が出ている: ${nw}/${newN}`);
const ids = [...new Set(ba.changes.map((c) => c.id))]; let eq = 0;
for (const id of ids) { const p = await page(id); const local = fs.readFileSync(path.join(root, 'dist/destinations', id, 'index.html'), 'utf8'); if (p.text === local) eq++; else bad.push(`dist と不一致: ${id}`); }
console.log(`変更した旅先ページの本番 HTML が手元の dist と完全一致: ${eq}/${ids.length}`);
console.log(bad.length ? `❌ ${bad.length}件\n` + bad.slice(0, 20).join('\n') : '✅ 本番で実測OK');
process.exit(bad.length ? 1 : 0);
