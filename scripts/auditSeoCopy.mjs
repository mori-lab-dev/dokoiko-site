// 個別に書いた title / description（carFree.seo・応援割の seo・応援割まとめ・九州ふっこう割）の検査（2026-11-04）。
//  - dist の <title>・meta description が、データに書いた文と一致する
//  - 文中の数字がすべて、そのページの本文にある（本文にない数字を足さない）
//  - 禁止句・推測表現を含まない（scripts/descStyleCheck.mjs の NG_PHRASES / NG_HEDGE）
//  - title は 35字以内、description は 120字以内、description に改行を含まない
// 使い方: node scripts/auditSeoCopy.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { NG_PHRASES, NG_HEDGE } from './descStyleCheck.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const items = []; // {rel, title?, description?, label}
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
for (const d of dests) { const sc = d.seo ?? d.carFree?.seo; if (sc) items.push({ rel: `destinations/${d.id}/index.html`, ...sc, label: d.id }); }
const ts = fs.readFileSync(path.join(root, 'src/data/ouenWari.ts'), 'utf8');
for (const m of ts.matchAll(/slug:\s*'([^']+)',\s*seo:\s*\{\s*title:\s*'([^']+)',\s*description:\s*'([^']+)'/g)) items.push({ rel: `${m[1]}/index.html`, title: m[2], description: m[3], label: m[1] });
for (const rel of ['ouen-wari/index.html', 'kyushu-fukko/index.html', 'hub/tokyo/index.html']) items.push({ rel, label: rel.split('/')[0] }); // データ側に文は無い。dist から読んで形だけ検査する

const bad = { mismatch: [], digits: [], ng: [], long: [], newline: [] };
for (const it of items) {
  const f = path.join(dist, it.rel);
  if (!fs.existsSync(f)) { bad.mismatch.push(`${it.label}（dist なし）`); continue; }
  const h = fs.readFileSync(f, 'utf8');
  const title = dec(h.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
  const desc = dec(h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '').trim();
  if ((it.title && it.title !== title) || (it.description && it.description !== desc)) bad.mismatch.push(it.label);
  const body = dec(h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<meta[^>]*>|<title>[\s\S]*?<\/title>/g, '').replace(/<[^>]+>/g, ' ')).replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248));
  const nums = [...new Set((title + ' ' + desc).match(/[0-9０-９]+/g) ?? [])];
  for (const n of nums) if (!body.includes(n.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248)))) bad.digits.push(`${it.label}: ${n}`);
  for (const w of [...NG_PHRASES, ...NG_HEDGE]) if ((title + desc).includes(w)) bad.ng.push(`${it.label}: ${w}`);
  if ([...title].length > 35 || [...desc].length > 120) bad.long.push(`${it.label}（title ${[...title].length}字・desc ${[...desc].length}字）`);
  if (/\n/.test(desc)) bad.newline.push(it.label);
}
const fmt = (a) => (a.length ? ' ' + a.join(', ') : '');
console.log(`個別に書いた title/description の検査 ${items.length} ページ`);
console.log(`データと dist の不一致: ${bad.mismatch.length}件${fmt(bad.mismatch)}`);
console.log(`本文にない数字: ${bad.digits.length}件${fmt(bad.digits)}`);
console.log(`禁止句・推測表現: ${bad.ng.length}件${fmt(bad.ng)}`);
console.log(`長さ超過（title 35字・description 120字）: ${bad.long.length}件${fmt(bad.long)}`);
console.log(`description に改行: ${bad.newline.length}件${fmt(bad.newline)}`);
process.exit(Object.values(bad).some((a) => a.length) ? 1 : 0);
