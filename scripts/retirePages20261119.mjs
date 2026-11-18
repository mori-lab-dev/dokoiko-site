#!/usr/bin/env node
/**
 * retirePages20261119.mjs — ページ全体が別の場所の内容だった6ページを、旅先データから外して転送ページにする（2026-11-19）。
 *   金花湯→黒松内温泉 / 弁天台場→五稜郭 / オソウシ温泉→然別湖畔温泉 / 平田内温泉→見市温泉 / 樹海温泉→沙流川温泉 / 鹿の湯→菅野温泉
 *   11/9・統合パイロットと同じ手順: destinations.json と記事から外す・元のURLは MovedPage（canonical + meta refresh・noindex なし）・
 *   mergedPages.json に組を足す・診断の結果ページは転送先の結果ページへの転送（quizMovedCodes.json）・共有画像を外す（backup に退避）。
 *   変更前: backup/retire_20261119/（データ・記事・画像・共有画像・縦横表・lastmod）。診断の旅先データ・desc・manifest は build の前処理と buildQuizOgAll.mjs が作り直す。
 * usage: node scripts/retirePages20261119.mjs [--dry]
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
// 診断の結果ページの転送先（転送先の旅先ページがヒーロー画像なしで診断に入っていないもの）: 金花湯→奥美利河温泉、平田内温泉→太田山神社（診断に入っている最も近い旅先）。2026-11-19 に quizMovedCodes.json へ直接反映した。
const DRY = process.argv.includes('--dry');
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const W = (p, o) => { if (!DRY) fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); };
const code = (id) => crypto.createHash('sha1').update(id).digest('hex').slice(0, 8);
const TODAY = '2026-11-19'; const B = 'backup/retire_20261119';
const MOVES = [
  { from: 'gen_北海_金花湯', to: 'gen_北海_黒松内温泉', reason: '指定（金花湯→黒松内温泉）。表示12のある近隣のページ' },
  { from: 'gen_北海_弁天台場', to: 'gen_北海_五稜郭', reason: '五稜郭のページは箱館戦争の舞台として記述があり、弁天台場（函館市）と話題が続く。5km' },
  { from: 'gen_北海_オソウシ温泉', to: 'gen_北海_然別湖畔温泉', reason: '最も近い旅先（12.5km）。表示・内部リンクはどの近隣も0で差がないため、距離で選んだ' },
  { from: 'gen_北海_平田内温泉', to: 'gen_北海_見市温泉', reason: '最も近い旅先（4km・同じ熊石地区）。表示・内部リンクはどれも0で差がない' },
  { from: 'gen_北海_樹海温泉', to: 'gen_北海_沙流川温泉', reason: '最も近い旅先（23km）。占冠（表示14・内部リンク24）は40kmと遠く、別の地域のため選ばなかった' },
  { from: 'gen_北海_鹿の湯', to: 'gen_北海_菅野温泉', reason: '最も近い旅先（0.5km・同じ然別峡）。表示・内部リンクは差がない' } ];
const dests = J('src/data/destinations.json'); const byId = new Map(dests.map((d) => [d.id, d]));
const drop = new Set(MOVES.map((m) => m.from));
for (const m of MOVES) { if (!byId.has(m.from)) throw new Error('from なし ' + m.from); if (!byId.has(m.to) || drop.has(m.to)) throw new Error('to が不正 ' + m.to); if (fs.existsSync(`src/pages/destinations/${m.to}.astro`)) throw new Error('to が転送ページ ' + m.to); }
const log = [];
fs.mkdirSync(B, { recursive: true });
const bk = { destinations: MOVES.map((m) => byId.get(m.from)), lastmod: {}, imageDims: {}, quiz: {} };
const dims = J('src/data/imageDims.json'); const lm = J('src/data/lastmod.json');
for (const { from, to, reason } of MOVES) {
  const d = byId.get(from);
  // 記事
  const af = `src/data/articles/${from}.json`; if (fs.existsSync(af)) { if (!DRY) { fs.mkdirSync(`${B}/articles`, { recursive: true }); fs.copyFileSync(af, `${B}/articles/${from}.json`); fs.unlinkSync(af); } }
  // 画像（public/images/<id>/ と public/images/spots/<id>/）
  for (const dir of [`public/images/${from}`, `public/images/spots/${from}`]) if (fs.existsSync(dir)) { if (!DRY) { const dest = `${B}/${dir}`; fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.cpSync(dir, dest, { recursive: true }); fs.rmSync(dir, { recursive: true }); } }
  for (const k of Object.keys(dims)) if (k.startsWith(`/images/${from}/`) || k.startsWith(`/images/spots/${from}/`)) { bk.imageDims[k] = dims[k]; delete dims[k]; }
  if (lm.destinations[from] !== undefined) { bk.lastmod[from] = lm.destinations[from]; delete lm.destinations[from]; }
  // 共有画像
  const c = code(from); const og = `public/quiz/og/${c}.png`; if (fs.existsSync(og) && !DRY) { fs.mkdirSync(`${B}/og`, { recursive: true }); fs.copyFileSync(og, `${B}/og/${c}.png`); fs.unlinkSync(og); }
  // 転送ページ
  const toName = byId.get(to).name;
  if (!DRY) fs.writeFileSync(`src/pages/destinations/${from}.astro`, `---\n// /destinations/${from}/ の転送ページ。内容が場所と合わなかった「${d.name}」のページを外し、近くの「${toName}」（${to}）へ移した（${TODAY}）。作りは src/layouts/MovedPage.astro（moved）を参照。\nimport MovedPage from '../../layouts/MovedPage.astro';\n---\n<MovedPage fromName="${d.name}" toId="${to}" toName="${toName}" moved />\n`);
  log.push({ from, name: d.name, to, toName, 理由: reason, code: c, toCode: code(to) });
}
W('src/data/destinations.json', dests.filter((d) => !drop.has(d.id))); W('src/data/imageDims.json', dims); W('src/data/lastmod.json', lm);
{ const mp = J('scripts/data/mergedPages.json'); const have = new Set(mp.pairs.map((p) => p.from)); for (const m of log) if (!have.has(m.from)) mp.pairs.push({ from: m.from, to: m.to, date: TODAY }); W('scripts/data/mergedPages.json', mp); }
{ const f = 'src/data/quizMovedCodes.json'; const cur = J(f); for (const m of log) cur[m.code] = { from: m.from, to: m.toCode }; W(f, cur); }
if (!DRY) { fs.writeFileSync(`${B}/backup_data.json`, JSON.stringify(bk, null, 1)); fs.mkdirSync('logs/identity_20261120', { recursive: true }); fs.writeFileSync('logs/identity_20261120/retire_log.json', JSON.stringify(log, null, 1)); }
console.log(DRY ? 'dry' : '完了', log.length, 'destinations', dests.length, '→', dests.length - drop.size);
