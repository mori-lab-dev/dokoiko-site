#!/usr/bin/env node
/**
 * heroFillVision20261117.mjs — ヒーロー画像が出ないページ（audit の missing-images・heroBroken）に、
 * 既存の replaceDestImages.mjs と同じ手順（Commons の候補集め → 機械フィルタ → commonsPlaceCheck → Haiku → Sonnet）で
 * 画像の候補を探す。2026-11-17。
 *
 * replaceDestImages.mjs との違い（既存のスクリプトは変えない）:
 *   - public/images にも destinations.json にも書かない。採用候補は logs/hero_fill_20261117/staged/<id>.jpg に仮置きするだけ
 *     （反映は人が一覧を見てから applyHeroFill20261117.mjs で行う）
 *   - ライセンスは CC0・Public domain・CC BY（SA なし）だけ。CC BY-SA・GFDL・NC・ND・不明は採らない（新しい種類を入れない）
 *   - 場所の根拠を厳しくする: commonsPlaceCheck が ok、かつ「撮影座標が旅先から15km以内」か「題名・カテゴリに旅先名の語がある」
 *   - Vision は identifiable:true のときだけ通す（Haiku が断定できなければ Sonnet。どちらも断定できなければ保留）
 *   - API の使用量を usage から数え、--budget の 1.3 倍を超えそうなら止める（ここまでの結果は保存。再実行で続きから）
 *
 * usage:
 *   node scripts/heroFillVision20261117.mjs --gather            候補集めと場所の照合だけ（無料。Vision を呼ばない）
 *   node scripts/heroFillVision20261117.mjs --vision [--budget 10] [--limit N]
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { placeCheck } from './commonsPlaceCheck.mjs';

const args = process.argv.slice(2);
const arg = (f, d = null) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const DIR = 'logs/hero_fill_20261117';
const STAGE = path.join(DIR, 'staged');
fs.mkdirSync(STAGE, { recursive: true });
const CANDS = path.join(DIR, 'candidates.json');
const OUT = path.join(DIR, 'vision_result.json');
const BUDGET = Number(arg('--budget', 10));
const HARD = BUDGET * 1.3;
const LIMIT = Number(arg('--limit', Infinity));
const MAX_CAND = Number(arg('--max-cand', 9));
const GEO_NEAR_KM = 15;
const GEO_MAX_KM = 60;
const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));
const heroBroken = JSON.parse(fs.readFileSync('logs/missing_images.json', 'utf8')).heroBroken.map((x) => x.id);
const titleOfUrl = (u) => (u ? decodeURIComponent((u.split('/wiki/')[1] || '').replace(/_/g, ' ')) : null);
const USED = new Set();
try { for (const k of Object.keys(JSON.parse(fs.readFileSync('logs/image_rejected_titles.json', 'utf8')))) USED.add(k); } catch { /* 無ければ空 */ }
for (const d of dests) {
  const m = titleOfUrl(d.imageCredit?.url); if (m) USED.add(m);
  for (const s of d.spots || []) { const k = titleOfUrl(s?.imageCredit?.url); if (k) USED.add(k); }
}

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

// ---- 候補集め（replaceDestImages.mjs と同じ。ライセンスだけ狭める）
const BAD_TITLE = /(station|sta\.|駅|platform|ホーム|bus ?stop|バス停|map|地図|logo|emblem|flag|sign(board)?|看板|標識|bank|post ?office|郵便|hospital|病院|school|学校|city ?hall|town ?hall|役場|庁舎|airport|空港|museum|資料館|博物館|interior|exhibit|poster|ポスター|menu|メニュー|portrait)/i;
const OK_LICENSE = /^(CC0|CC BY(?!-SA)( \d|$)|CC-BY(?!-SA)|Public domain|PD)/i;
const BAD_LICENSE = /(SA|NC|ND|GFDL|fair use)/i;
const IMG_Q = 'prop=imageinfo|coordinates|categories&cllimit=30&colimit=1&iiprop=url|size|mime|extmetadata&iiurlwidth=1600';
function pack(pages) {
  const out = [];
  for (const p of Object.values(pages || {})) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    out.push({ title: p.title, url: ii.thumburl || ii.url, descurl: ii.descriptionurl, w: ii.width, h: ii.height, mime: ii.mime,
      license: ii.extmetadata?.LicenseShortName?.value || '', artist: (ii.extmetadata?.Artist?.value || '').replace(/<[^>]*>/g, '').trim(),
      cats: (p.categories || []).map((c) => c.title.replace(/^Category:/, '')),
      order: p.index ?? 99, geo: p.coordinates?.[0] ? { lat: p.coordinates[0].lat, lng: p.coordinates[0].lon } : null });
  }
  return out.sort((a, b) => a.order - b.order);
}
async function enTitle(ja) {
  const j = await http('https://ja.wikipedia.org/w/api.php?action=query&format=json&prop=langlinks&lllang=en&redirects=1&titles=' + encodeURIComponent(ja));
  return Object.values(j?.query?.pages || {})[0]?.langlinks?.[0]?.['*'] || null;
}
async function catFiles(cat) {
  const j = await http(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=categorymembers&gcmtitle=${encodeURIComponent('Category:' + cat)}&gcmtype=file&gcmlimit=40&${IMG_Q}`);
  return pack(j?.query?.pages);
}
async function search(q) {
  const j = await http(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent('filetype:bitmap ' + q)}&gsrnamespace=6&gsrlimit=24&${IMG_Q}`);
  return pack(j?.query?.pages);
}
async function pageImages(title) {
  const out = [];
  for (const lang of ['ja', 'en']) {
    const j = await http(`https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=name&redirects=1&titles=${encodeURIComponent(title)}`);
    const name = Object.values(j?.query?.pages || {})[0]?.pageimage; await sleep(250);
    if (!name) continue;
    const k = await http(`https://commons.wikimedia.org/w/api.php?action=query&format=json&${IMG_Q}&titles=${encodeURIComponent('File:' + name)}`);
    out.push(...pack(k?.query?.pages)); await sleep(250);
  }
  return out;
}
function geoKm(a, b) {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
function acceptable(c, d) {
  if (!c.w || c.w < 1200 || c.w <= c.h) return 'size';
  if (!/jpe?g|png/.test(c.mime || '')) return 'mime';
  if (!OK_LICENSE.test(c.license) || BAD_LICENSE.test(c.license)) return 'license';
  const name = d.name + (d.mainSpot || '');
  const bad = c.title.match(BAD_TITLE);
  if (bad && !name.toLowerCase().includes(bad[1].toLowerCase())) return 'title';
  if (USED.has(c.title)) return 'used';
  if (c.geo && d.lat != null && geoKm(c.geo, d) > GEO_MAX_KM) return 'geo';
  return null;
}
// 旅先名の芯（「温泉」「島」などの普通名詞を外した語）。題名・カテゴリに出てくるかで「その場所の写真」と言えるかを見る
const coreWords = (d) => [...new Set([d.name, d.mainSpot, d.name.replace(/(温泉郷|温泉|高原|渓谷|峡|島|湖|山|岬|公園|の滝|滝)$/, '')]
  .filter((w) => w && w.length >= 2))];

async function gather(d) {
  const spotNames = (d.spots || []).filter((s) => s && typeof s === 'object').map((s) => s.name).filter(Boolean);
  const jaTitles = [...new Set([d.mainSpot, d.name, spotNames[0]].filter(Boolean))].slice(0, 3);
  const pool = new Map(); const enNames = [];
  const add = (list) => { for (const c of list) if (!pool.has(c.title)) pool.set(c.title, c); };
  for (const ja of jaTitles) add(await pageImages(ja));
  for (const ja of jaTitles) {
    const en = await enTitle(ja); await sleep(250);
    if (en) { enNames.push(en); add(await catFiles(en)); await sleep(250); add(await search(en)); await sleep(250); }
  }
  for (const q of [d.mainSpot, `${d.name} ${d.prefecture}`, d.name].filter(Boolean)) { add(await search(q)); await sleep(250); }
  const reasons = {}; const ok = [];
  for (const c of pool.values()) { const r = acceptable(c, d); if (r) reasons[r] = (reasons[r] || 0) + 1; else ok.push(c); }
  return { pool: pool.size, reasons, ok, enNames };
}

// ---- 2段階 Vision（replaceDestImages.mjs と同じ問い）
const SYSTEM = `あなたは旅行サイトの画像審査担当です。指定された旅先の「紹介ページのヒーロー画像」として使えるかを判定します。
使える: その旅先（または主な見どころ）の風景・景観・名所・建築の外観が、明るく見映えよく写っている写真。
使えない: 別の場所の写真／駅・ホーム・駅名標／港の設備だけ／看板・案内板・ロゴ／屋内の展示や資料／人物が主役／地図・図表・イラスト／
文字の焼き込み／極端に暗い・ブレている／被写体が小さすぎて何か分からない。
JSONのみで返答: {"verdict":"ok"|"ng","identifiable":true|false,"subject":"風景|名所|建築|施設|駅|看板|屋内|その他","reason":"40字以内"}
identifiable は「その場所だと断定できる手がかり（社号標・特徴的な建造物・地形・看板）が写っているか」。`;
const PRICE = { 'claude-haiku-4-5': [1, 5], 'claude-sonnet-4-6': [3, 15] };   // $/100万トークン（入力・出力）
const HAIKU = 'claude-haiku-4-5', SONNET = 'claude-sonnet-4-6';
let client = null;
const usage = { calls: 0, haiku: 0, sonnet: 0, inTok: 0, outTok: 0, usd: 0, perCall: [] };
class BudgetStop extends Error {}
async function judge(model, buf, ctx) {
  if (usage.usd + 0.01 > HARD) throw new BudgetStop('budget');
  const b64 = (await sharp(buf).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer()).toString('base64');
  for (let i = 0; i < 4; i++) {
    try {
      const res = await client.messages.create({ model, max_tokens: 300, system: SYSTEM,
        messages: [{ role: 'user', content: [{ type: 'text', text: `旅先: ${ctx}\nこの画像は紹介画像として適切か判定。` },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }] }] });
      const [pi, po] = PRICE[model];
      const cost = (res.usage.input_tokens * pi + res.usage.output_tokens * po) / 1e6;
      usage.calls++; usage[model === HAIKU ? 'haiku' : 'sonnet']++; usage.inTok += res.usage.input_tokens; usage.outTok += res.usage.output_tokens; usage.usd += cost;
      usage.perCall.push({ model, in: res.usage.input_tokens, out: res.usage.output_tokens });
      let t = res.content[0].text.trim(); const s = t.indexOf('{'), e = t.lastIndexOf('}'); if (s >= 0) t = t.slice(s, e + 1);
      try { return JSON.parse(t); } catch { return { verdict: 'ng', identifiable: false, reason: 'JSON解析不可' }; }
    } catch (e) {
      if (e instanceof Anthropic.BadRequestError || e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw e;
      await sleep(3000 * (i + 1));
    }
  }
  return { verdict: 'ng', identifiable: false, reason: 'API失敗' };
}
const fp = (buf) => sharp(buf).resize(64, 36, { fit: 'fill' }).greyscale().raw().toBuffer();
const pdiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return +(s / a.length).toFixed(1); };

// ---- 本体
const targets = heroBroken.filter((id) => byId.has(id)).slice(0, LIMIT);
if (args.includes('--gather')) {
  const store = fs.existsSync(CANDS) ? JSON.parse(fs.readFileSync(CANDS, 'utf8')) : {};
  for (const id of targets) {
    if (store[id]) continue;
    const d = byId.get(id);
    const g = await gather(d);
    const words = [...coreWords(d), ...(d.spots || []).filter((s) => s && typeof s === 'object').map((s) => s.name).filter(Boolean)];
    const checked = [];
    for (const c of g.ok) {
      let pc = null; try { pc = await placeCheck(c.title, d.prefecture, words); } catch { /* weak */ } await sleep(200);
      const place = pc?.verdict ?? 'weak';
      const km = c.geo && d.lat != null ? +geoKm(c.geo, d).toFixed(1) : null;
      const hay = (c.title + ' ' + c.cats.join(' ')).toLowerCase();
      const nameHit = [...coreWords(d), ...g.enNames.map((e) => e.replace(/ \(.*\)$/, ''))].some((w) => hay.includes(w.toLowerCase()));
      checked.push({ ...c, place, km, nameHit, strong: place === 'ok' && ((km != null && km <= GEO_NEAR_KM) || nameHit) });
    }
    checked.sort((a, b) => (b.strong - a.strong) || (a.km ?? 99) - (b.km ?? 99) || b.w - a.w);
    store[id] = { name: d.name, pref: d.prefecture, tags: d.tags, pool: g.pool, filtered: g.reasons, checked };
    fs.writeFileSync(CANDS, JSON.stringify(store, null, 1));
    console.log(`${id} 集めた${g.pool} 条件内${g.ok.length} 場所の根拠あり${checked.filter((c) => c.strong).length}`);
  }
  process.exit(0);
}

if (args.includes('--vision')) {
  const env = fs.readFileSync('./.env', 'utf-8');
  let key; for (const l of env.split('\n')) { const m = l.match(/^ANTHROPIC_API_KEY=(.+)$/); if (m) key = m[1].trim(); }
  client = new Anthropic({ apiKey: key });
  const store = JSON.parse(fs.readFileSync(CANDS, 'utf8'));
  const report = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { staged: [], hold: [], noCandidate: [], failed: [], usageRuns: [] };
  const done = new Set([...report.staged, ...report.hold, ...report.noCandidate].map((x) => x.id));
  report.failed = report.failed.filter((x) => !done.has(x.id));
  const save = () => fs.writeFileSync(OUT, JSON.stringify(report, null, 1));
  let stop = null;
  for (const id of targets) {
    if (done.has(id) || stop) continue;
    const d = byId.get(id); const s = store[id];
    if (!s) { report.failed.push({ id, reason: '候補集め未実行' }); continue; }
    const strong = s.checked.filter((c) => c.strong);
    if (!strong.length) { report.noCandidate.push({ id, name: d.name, pref: d.prefecture, pool: s.pool, checked: s.checked.length }); save(); continue; }
    const ctx = `${d.name}（${d.prefecture}）${d.mainSpot ? ' 主な見どころ: ' + d.mainSpot : ''}`;
    const tried = []; let picked = null;
    try {
      for (const c of strong.slice(0, MAX_CAND)) {
        const buf = await http(c.url, 'buf'); await sleep(1000);
        if (!buf) { tried.push({ title: c.title, stage: 'download' }); continue; }
        const h = await judge(HAIKU, buf, ctx);
        if (h.verdict !== 'ok') { tried.push({ title: c.title, stage: 'haiku', ...h }); continue; }
        if (h.identifiable === true) { tried.push({ title: c.title, stage: 'haiku', ...h }); picked = { c, buf, v: { haiku: h } }; break; }
        await sleep(500);
        const so = await judge(SONNET, buf, ctx);
        tried.push({ title: c.title, stage: 'sonnet', haiku: h, sonnet: so });
        if (so.verdict === 'ok' && so.identifiable === true) { picked = { c, buf, v: { haiku: h, sonnet: so } }; break; }
      }
    } catch (e) {
      stop = e instanceof BudgetStop ? `使用額が上限の1.3倍（$${HARD}）に近づいたため停止` : `API停止（${e.status ?? ''} ${String(e.message).slice(0, 120)}）`;
      report.failed.push({ id, reason: stop, tried }); save(); break;
    }
    if (!picked) { report.hold.push({ id, name: d.name, pref: d.prefecture, tags: d.tags, reason: 'Vision で合格なし', tried }); }
    else {
      const out = path.join(STAGE, `${id}.jpg`);
      await sharp(picked.buf).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true, progressive: true }).toFile(out);
      const again = await http(picked.c.url, 'buf');
      const diff = again ? pdiff(await fp(fs.readFileSync(out)), await fp(again)) : null;
      report.staged.push({ id, name: d.name, pref: d.prefecture, tags: d.tags, file: picked.c.title, km: picked.c.km, nameHit: picked.c.nameHit, cats: picked.c.cats.slice(0, 8),
        credit: { author: picked.c.artist || 'unknown', license: picked.c.license, url: picked.c.descurl, attributionRequired: true },
        verdict: picked.v, pixelDiffAfter: diff, bytes: fs.statSync(out).size, tried });
    }
    console.log(`${picked ? '仮置き' : '保留'} ${id} 累計 $${usage.usd.toFixed(3)}（${usage.calls}回）`);
    save();
  }
  report.usageRuns.push({ at: new Date().toISOString(), calls: usage.calls, haiku: usage.haiku, sonnet: usage.sonnet, inTok: usage.inTok, outTok: usage.outTok, usd: +usage.usd.toFixed(4), stop });
  save();
  console.log(`仮置き ${report.staged.length} / 保留 ${report.hold.length} / 候補なし ${report.noCandidate.length} / 失敗 ${report.failed.length} / 今回 $${usage.usd.toFixed(4)}（${usage.calls}回）${stop ? ' ⛔ ' + stop : ''}`);
}
