// 同名ページの統合・嵐山・支笏湖の変更の本番実測（2026-11-09）。
//  1. 旧4ページ: 本番で転送ページ（canonical と meta refresh が残す側）
//  2. 残す側に移した内容が出ている
//  3. 変更したページ（本番の HTML）が、手元の dist と中身まで一致する
//  4. sitemap.xml が手元の dist と一致し、旧URLが載っていない
// 使い方: node scripts/verifyMergedLive.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const O = 'https://tabidokoiko.com';
const pairs = JSON.parse(fs.readFileSync(path.join(root, 'scripts/data/mergedPages.json'), 'utf8')).pairs.filter((p) => p.date === '2026-11-09');
const get = async (u) => { for (let i = 0; i < 5; i++) { const r = await fetch(`${u}${u.includes('?') ? '&' : '?'}_=${Date.now()}`, { headers: { 'user-agent': 'Mozilla/5.0 dokoiko-verify' } }); if (r.status === 429) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; } return { status: r.status, text: await r.text() }; } return { status: 429, text: '' }; };
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const bad = [];
let stubOk = 0;
for (const { from, to } of pairs) {
  const r = await get(`${O}/destinations/${encodeURIComponent(from)}/`);
  const canon = r.text.match(/<link rel="canonical" href="([^"]*)"/)?.[1], ref = r.text.match(/<meta http-equiv="refresh" content="([^"]*)"/)?.[1];
  if (r.status === 200 && canon === `${O}/destinations/${to}/` && ref === `0; url=/destinations/${to}/`) stubOk++; else bad.push(`転送ページでない: ${from}（HTTP ${r.status} canonical=${canon} refresh=${ref}）`);
}
console.log(`旧ページが本番で転送ページ: ${stubOk}/${pairs.length}`);
const moved = [['osorezan', '入山料は大人900円'], ['osorezan', '薬師の湯・冷えの湯・古滝の湯'], ['furano', 'ニングルテラス'], ['furano', '15棟のログハウス'], ['dazaifu', '樹齢1,500年を越え'], ['gen_北海_支笏湖いとう温泉', '宿の営業状況は公式で確認できません'], ['arashiyama', '嵐山駅周辺'], ['arashiyama-2', '片道約7km']];
let mv = 0;
for (const [id, t] of moved) { const r = await get(`${O}/destinations/${encodeURIComponent(id)}/`); if (dec(r.text.replace(/<[^>]+>/g, '')).includes(t)) mv++; else bad.push(`出ていない: ${id}「${t}」`); }
console.log(`移した内容・書き分けが本番に出ている: ${mv}/${moved.length}`);
const oldTexts = [['osorezan', '入山料は500円'], ['gen_北海_支笏湖いとう温泉', '日帰り入浴は大人800円'], ['gen_北海_支笏湖いとう温泉', '露天風呂の正面に湖面を望む一軒宿'], ['arashiyama', '室町時代につくられた']];
let gone = 0;
for (const [id, t] of oldTexts) { const r = await get(`${O}/destinations/${encodeURIComponent(id)}/`); if (!dec(r.text.replace(/<[^>]+>/g, '')).includes(t)) gone++; else bad.push(`旧文が残る: ${id}「${t}」`); }
console.log(`直した旧文が本番に無い: ${gone}/${oldTexts.length}`);
const same = ['osorezan', 'furano', 'dazaifu', 'ohara', 'arashiyama', 'arashiyama-2', 'gen_北海_支笏湖いとう温泉', ...pairs.map((p) => p.from)];
let eq = 0;
for (const id of same) {
  const r = await get(`${O}/destinations/${encodeURIComponent(id)}/`);
  const local = fs.readFileSync(path.join(root, 'dist/destinations', id, 'index.html'), 'utf8');
  if (r.status === 200 && r.text === local) eq++; else bad.push(`dist と不一致: ${id}（HTTP ${r.status}・長さ 本番${r.text.length}/手元${local.length}）`);
}
console.log(`本番の HTML が手元の dist と完全一致: ${eq}/${same.length}`);
const sm = await get(`${O}/sitemap.xml`);
const smLocal = fs.readFileSync(path.join(root, 'dist/sitemap.xml'), 'utf8');
const smOld = pairs.filter((p) => sm.text.includes(`/destinations/${encodeURIComponent(p.from)}/`)).length;
console.log(`sitemap.xml: 手元の dist と${sm.text === smLocal ? '一致' : '不一致'} / 旧URLが載っている ${smOld}件`);
if (sm.text !== smLocal) bad.push('sitemap.xml が dist と不一致'); if (smOld) bad.push('sitemap に旧URL');
console.log(bad.length ? `❌ ${bad.length}件\n` + bad.join('\n') : '✅ 本番で実測OK');
process.exit(bad.length ? 1 : 0);
