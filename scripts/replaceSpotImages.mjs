#!/usr/bin/env node
/**
 * replaceSpotImages.mjs — スポット画像を、検証つきで取得して差し替える（2026-10-08）。
 *
 * 対象: spots の地理的な誤りを直したあとに imageUrl が空になったスポットなど。
 * 検証は replaceDestImages.mjs と同じ（所在地照合 → 2段階 Vision）。spot は表示が Commons の
 * thumb URL（500px）そのものなので、API が返した正確な幅の thumburl を imageUrl にする
 * （URL の幅を書き換えると 400 になる）。destinations.json は書き換えず、結果を --out に残す。
 * 反映は applySpotImageReplacements.mjs が行う。
 *
 * usage: node scripts/replaceSpotImages.mjs --spots logs/xxx.json --out logs/yyy.json [--shard 0/4]
 *   --spots は {id, idx} の配列
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { placeCheck } from './commonsPlaceCheck.mjs';

const env = fs.readFileSync('./.env', 'utf-8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z_]+)=(.+)$/); if (m) process.env[m[1]] = m[2].trim(); }
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const HAIKU = 'claude-haiku-4-5';
const SONNET = 'claude-sonnet-4-6';
const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const arg = (f, d = null) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const SPOTS_FILE = arg('--spots');
const OUT = arg('--out', 'logs/replace_dest_images.json');
const [SHARD_I, SHARD_N] = (arg('--shard', '0/1')).split('/').map(Number);
const LIMIT = Number(arg('--limit', Infinity));
const MAX_CAND = Number(arg('--max-cand', 9));

const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));
const wanted = JSON.parse(fs.readFileSync(SPOTS_FILE, 'utf8'));
const targets = wanted.filter((x, i) => i % SHARD_N === SHARD_I && byId.has(x.id)).slice(0, LIMIT);
const report = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { adopted: [], unresolved: [] };
const done = new Set([...report.adopted, ...report.unresolved].map((x) => `${x.id}#${x.idx}`));
const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

// ---------------------------------------------------------------- HTTP（429 は待って再試行）
async function http(url, kind = 'json', tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(40000) });
      if (r.ok) return kind === 'json' ? await r.json() : Buffer.from(await r.arrayBuffer());
      if (![429, 503, 502, 500].includes(r.status)) return null;
    } catch { /* 再試行 */ }
    await sleep(2500 * (i + 1) ** 2);
  }
  return null;
}

// ---------------------------------------------------------------- 候補集め
const BAD_TITLE = /(station|sta\.|駅|platform|ホーム|bus ?stop|バス停|map|地図|logo|emblem|flag|sign(board)?|看板|標識|bank|post ?office|郵便|hospital|病院|school|学校|city ?hall|town ?hall|役場|庁舎|airport|空港|museum|資料館|博物館|interior|exhibit|poster|ポスター|menu|メニュー|portrait)/i;
const OK_LICENSE = /^(CC BY|CC0|Public domain|PD|Attribution|GFDL|Copyrighted free use|CC-BY)/i;
const BAD_LICENSE = /(NC|ND|fair use)/i;

async function enTitle(ja) {
  if (!ja) return null;
  const j = await http('https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=langlinks&lllang=en&redirects=1&titles=' + encodeURIComponent(ja));
  const p = Object.values(j?.query?.pages || {})[0];
  return p?.langlinks?.[0]?.['*'] || null;
}

const IMG_Q = 'prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=500';
function pack(pages) {
  const out = [];
  for (const p of Object.values(pages || {})) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    out.push({ title: p.title, url: ii.thumburl || ii.url, descurl: ii.descriptionurl, w: ii.width, h: ii.height,
      mime: ii.mime, em: ii.extmetadata || {}, order: p.index ?? 99 });
  }
  return out.sort((a, b) => a.order - b.order);
}
async function catFiles(cat) {
  const j = await http(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent('Category:' + cat)}&gcmtype=file&gcmlimit=40&${IMG_Q}`);
  return pack(j?.query?.pages);
}
async function search(q) {
  const j = await http(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent('filetype:bitmap ' + q)}&gsrnamespace=6&gsrlimit=24&${IMG_Q}`);
  return pack(j?.query?.pages);
}

function acceptable(c, d, current) {
  if (!c.w || c.w < 900 || c.w <= c.h * 0.8) return false;   // spot は縦長もやや許す
  if (!/jpe?g|png/.test(c.mime || '')) return false;
  const lic = c.em.LicenseShortName?.value || '';
  if (!OK_LICENSE.test(lic) || BAD_LICENSE.test(lic)) return false;
  // 旅先名そのものに含まれる語（例: 「…美術館」）は除外語にしない
  const name = d.name + (d.mainSpot || '');
  const bad = c.title.match(BAD_TITLE);
  if (bad && !name.toLowerCase().includes(bad[1].toLowerCase())) return false;
  if (current && c.title === current) return false;
  return true;
}

async function gather(d, spot, banned) {
  const pool = new Map();
  const add = (list) => { for (const c of list) if (!pool.has(c.title)) pool.set(c.title, c); };
  const en = await enTitle(spot.name);
  await sleep(250);
  if (en) { add(await catFiles(en)); await sleep(250); add(await search(en)); await sleep(250); }
  for (const q of [spot.name, `${spot.name} ${d.name}`, `${spot.name} ${d.prefecture}`]) { add(await search(q)); await sleep(250); }
  return [...pool.values()].filter((c) => acceptable(c, { name: spot.name, mainSpot: '' }, null) && !banned.has(c.title));
}

// ---------------------------------------------------------------- 2段階 Vision
const SYSTEM = `あなたは旅行サイトの画像審査担当です。指定された「スポット」の紹介画像として使えるかを判定します。
主題がそのスポットそのものかを見ます。別の場所が主役／駅・ホーム／看板・案内板・ロゴ／屋内の展示パネルだけ／地図・図表／
人物のポートレート／文字の焼き込み／暗すぎ・ブレ／被写体が小さすぎて何か分からない は ng。
JSONのみで返答: {"verdict":"ok"|"ng","identifiable":true|false,"subject":"風景|名所|建築|施設|駅|看板|屋内|その他","reason":"40字以内"}
identifiable は「そのスポットだと断定できる手がかり（社号標・特徴的な建造物・地形・看板）が写っているか」。`;

async function judge(model, buf, ctx) {
  const b64 = (await sharp(buf).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer()).toString('base64');
  for (let i = 0; i < 4; i++) {
    try {
      const res = await client.messages.create({
        model, max_tokens: 300, system: SYSTEM,
        messages: [{ role: 'user', content: [
          { type: 'text', text: `スポット: ${ctx}\nこの画像は紹介画像として適切か判定。` },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
        ] }],
      });
      let t = res.content[0].text.trim();
      const s = t.indexOf('{'), e = t.lastIndexOf('}');
      if (s >= 0) t = t.slice(s, e + 1);
      try { return JSON.parse(t); } catch { return { verdict: 'ng', identifiable: false, reason: 'JSON解析不可' }; }
    } catch (e) {
      if (e.status === 400) throw e;                     // 残高切れ等はここで止める（成果は保全される）
      await sleep(3000 * (i + 1));
    }
  }
  return { verdict: 'ng', identifiable: false, reason: 'API失敗' };
}

const creditOf = (c) => ({
  author: (c.em.Artist?.value || '').replace(/<[^>]*>/g, '').trim() || 'unknown',
  license: c.em.LicenseShortName?.value || 'unknown',
  url: c.descurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(c.title.replace(/ /g, '_'))}`,
  attributionRequired: true,
});

// 64x36グレースケールの平均絶対差（auditDestMainImages と同じ物差し）
const fp = (buf) => sharp(buf).resize(64, 36, { fit: 'fill' }).greyscale().raw().toBuffer();
const pdiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return +(s / a.length).toFixed(1); };

// ---------------------------------------------------------------- 本体
let stopped = false;
for (const { id, idx } of targets) {
  if (stopped) break;
  if (done.has(`${id}#${idx}`)) continue;
  const d = byId.get(id);
  const spot = d.spots?.[idx];
  if (!spot || typeof spot !== 'object') continue;
  const ctx = `${spot.name}（${d.name}・${d.prefecture}）`;
  const words = [spot.name, d.name];
  // 同じ写真の二重掲載を避ける: この destination の main と他スポットの出典は使わない
  const banned = new Set();
  const titleOf = (c) => (c?.url ? decodeURIComponent((c.url.split('/wiki/')[1] || '').replace(/_/g, ' ')) : null);
  banned.add(titleOf(d.imageCredit));
  for (const s of d.spots || []) if (s && typeof s === 'object') banned.add(titleOf(s.imageCredit));
  banned.delete(null);

  const cands = await gather(d, spot, banned);
  const checked = [];
  for (const c of cands) {
    let pc = null;
    try { pc = await placeCheck(c.title, d.prefecture, words); } catch { /* weak 扱い */ }
    await sleep(200);
    if (pc?.verdict === 'ng') continue;
    checked.push({ c, place: pc?.verdict ?? 'weak', pc });
  }
  checked.sort((a, b) => (a.place === 'ok' ? 0 : 1) - (b.place === 'ok' ? 0 : 1) || b.c.w - a.c.w);

  let picked = null; const tried = [];
  for (const { c, place } of checked.slice(0, MAX_CAND)) {
    const buf = await http(c.url, 'buf');
    await sleep(1000);
    if (!buf) { tried.push({ title: c.title, stage: 'download' }); continue; }
    let h;
    try { h = await judge(HAIKU, buf, ctx); }
    catch (e) { console.log(`⛔ API停止（${e.status}）: ここまでの成果を保存して終了`); stopped = true; break; }
    if (h.verdict !== 'ok') { tried.push({ title: c.title, place, stage: 'haiku', ...h }); continue; }
    if (h.identifiable === false || place !== 'ok') {
      await sleep(600);
      let s;
      try { s = await judge(SONNET, buf, ctx); }
      catch (e) { console.log(`⛔ API停止（${e.status}）`); stopped = true; break; }
      tried.push({ title: c.title, place, stage: 'sonnet', haiku: h, sonnet: s });
      if (s.verdict !== 'ok') continue;
      if (place !== 'ok' && s.identifiable !== true) continue;
      picked = { c, place, verdict: { haiku: h, sonnet: s } };
    } else {
      tried.push({ title: c.title, place, stage: 'haiku', ...h });
      picked = { c, place, verdict: { haiku: h } };
    }
    break;
  }
  if (stopped) break;
  if (!picked) {
    report.unresolved.push({ id, idx, name: spot.name, candidates: checked.length, tried: tried.slice(0, 10) });
    console.log(`  ❌ ${id}#${idx} ${spot.name}: 合格なし（候補${checked.length}）`);
  } else {
    report.adopted.push({ id, idx, name: spot.name, file: picked.c.title, imageUrl: picked.c.url,
      imageCredit: creditOf(picked.c), place: picked.place, verdict: picked.verdict });
    console.log(`  ✅ ${id}#${idx} ${spot.name}: ${picked.c.title.replace('File:', '').slice(0, 40)} [${picked.verdict.sonnet ? 'Haiku→Sonnet' : 'Haiku'}・所在${picked.place}]`);
  }
  save();
  await sleep(600);
}
save();
console.log(`\n採用 ${report.adopted.length} / 未解決 ${report.unresolved.length}${stopped ? '（API停止で中断。再実行で続きから）' : ''}`);
