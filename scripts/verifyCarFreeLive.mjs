// 「車なしで行く」ガイドを載せた旅先ページの本番実測（2026-11-04 試作）。
// 各ページ: HTTP 200 / noindex でない / canonical が自分自身 / JSON-LD が読める / #carfree と項目数がデータと一致 /
//          sitemap.xml に載っている / ローカル dist と本番の車なし部分が一致 / 応援割・割引率の記述なし
// 使い方: node scripts/verifyCarFreeLive.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://tabidokoiko.com';
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8')).filter((d) => d.carFree);

const get = async (url) => {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, { headers: { 'user-agent': 'Mozilla/5.0 dokoiko-verify' } });
    if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
    return { status: r.status, text: await r.text() };
  }
  return { status: 429, text: '' };
};
const section = (html) => html.match(/<div class="carfree-section"[\s\S]*?<\/ul>[\s\S]*?(?=<!-- 宿泊|<div class="hotel-section|<div class="fs-card)/)?.[0] ?? '';

const sm = await get(`${ORIGIN}/sitemap.xml`);
let bad = 0;
for (const d of dests) {
  const url = `${ORIGIN}/destinations/${encodeURIComponent(d.id)}/`;
  const problems = [];
  const { status, text: html } = await get(url);
  if (status !== 200) problems.push(`HTTP ${status}`);
  if (/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) problems.push('noindex');
  const canon = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (decodeURI(canon ?? '') !== decodeURI(url)) problems.push(`canonical が違う: ${canon}`);
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let ldTypes = [];
  for (const m of ld) { try { const j = JSON.parse(m[1]); for (const n of Array.isArray(j) ? j : (j['@graph'] ?? [j])) ldTypes.push(n['@type']); } catch { problems.push('JSON-LD が壊れている'); } }
  if (!ldTypes.length) problems.push('JSON-LD なし');
  const n = (html.match(/data-carfree-item/g) || []).length;
  if (!/id="carfree"/.test(html) || n !== d.carFree.items.length) problems.push(`車なし欄の項目数 ${n} / データ ${d.carFree.items.length}`);
  if (!sm.text.includes(`/destinations/${d.id}/`) && !sm.text.includes(`/destinations/${encodeURIComponent(d.id)}/`)) problems.push('sitemap に無い');
  const local = path.join(root, 'dist', 'destinations', d.id, 'index.html');
  if (fs.existsSync(local)) {
    const lh = fs.readFileSync(local, 'utf8');
    const a = lh.match(/<div class="carfree-section"[\s\S]*?id="carfree"[\s\S]*?<\/ul>/)?.[0];
    const b = html.match(/<div class="carfree-section"[\s\S]*?id="carfree"[\s\S]*?<\/ul>/)?.[0];
    if (!a || a !== b) problems.push('ローカル dist と本番の車なし欄が違う');
  }
  const txt = (html.match(/<div class="carfree-section"[\s\S]*?<\/ul>/)?.[0] ?? '').replace(/<[^>]+>/g, ' ');
  if (/応援割|ふっこう|[0-9０-９]\s*[%％]/.test(txt)) problems.push('応援割・割引率の記述あり');
  if (problems.length) bad++;
  console.log(`${problems.length ? 'NG' : 'OK'}  ${d.id}  canonical=${canon ? 'あり' : 'なし'} JSON-LD=${[...new Set(ldTypes)].join('/')} 車なし項目=${n} ${problems.join(' / ')}`);
}
console.log(bad ? `❌ ${bad} ページに不備` : '✅ 本番で実測OK');
process.exit(bad ? 1 : 0);
