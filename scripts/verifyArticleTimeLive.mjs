// 記事側の所要時間の文の修正・削除と、作り直したメタ description の本番実測（2026-11-06）。
//  - 削除・修正した文（article_official_notes.json の decision が delete / fix）の元の文が、本番の旅先ページに出ていない
//  - 直した文（articleTimeVerified.json の corrected）が、本番に出ている
//  - 作り直したメタ description（metaDescriptions.json）が、本番の meta description と一致する
// 使い方: node scripts/verifyArticleTimeLive.mjs
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';

const ORIGIN = 'https://tabidokoiko.com';
const B = path.join(root, 'backup/travelTime_20261106');
const notes = JSON.parse(fs.readFileSync(path.join(B, 'article_official_notes.json'), 'utf8'));
const metas = JSON.parse(fs.readFileSync(path.join(B, 'metaDescriptions.json'), 'utf8'));
const ver = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/articleTimeVerified.json'), 'utf8')).items;
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const get = async (id) => {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`${ORIGIN}/destinations/${encodeURIComponent(id)}/?_=${Date.now()}`, { headers: { 'user-agent': 'Mozilla/5.0 dokoiko-verify' } });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
    return { status: r.status, text: await r.text() };
  }
  return { status: 429, text: '' };
};
const cache = new Map();
const page = async (id) => { if (!cache.has(id)) cache.set(id, await get(id)); return cache.get(id); };
const bad = [];
const bodyOf = (t) => dec(t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ''));

let gone = 0, goneN = 0;
for (const n of notes.filter((x) => x.decision !== 'keep')) {
  goneN++;
  const p = await page(n.id);
  if (p.status !== 200) { bad.push(`${n.id}: HTTP ${p.status}`); continue; }
  if (bodyOf(p.text).includes(n.sentence)) bad.push(`${n.id}: 元の文が残る「${n.sentence.slice(0, 20)}」`); else gone++;
}
console.log(`削除・修正した文の元の文が消えている: ${gone}/${goneN}`);
let fixed = 0, fixedN = 0;
for (const v of ver.filter((x) => x.corrected)) {
  fixedN++;
  const p = await page(v.id);
  if (bodyOf(p.text).includes(v.line.replace(/。$/, ''))) fixed++; else bad.push(`${v.id}: 直した文が出ていない「${v.line.slice(0, 20)}」`);
}
console.log(`直した文が出ている: ${fixed}/${fixedN}`);
let metaOk = 0;
for (const m of metas) {
  const p = await page(m.id);
  const d = dec(p.text.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '').trim();
  if (d === m.now) metaOk++; else bad.push(`${m.id}: meta が違う`);
}
console.log(`メタ description が本番に反映: ${metaOk}/${metas.length}`);
console.log(bad.length ? `❌ ${bad.length}件\n` + bad.slice(0, 20).join('\n') : '✅ 本番で実測OK');
process.exit(bad.length ? 1 : 0);
