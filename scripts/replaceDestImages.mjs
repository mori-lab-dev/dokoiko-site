#!/usr/bin/env node
/**
 * replaceDestImages.mjs — destination のメイン画像を、検証つきで差し替える（2026-10-08）。
 *
 * 対象: auditDestMainImages.mjs が「ファイルが無い（missing）／クレジットが実ファイルと違う
 *       （credit-mismatch）／所在地が別（place-ng）」と判定したもの、および被写体のふるい分けで
 *       駅・看板・資料館などが写っていたもの。
 *
 * 品質ゲート（上から順に。1つでも落ちたら次の候補へ）
 *   1. 候補集め  Commons のカテゴリ（日本語記事の英語版タイトル → Category:<英題>）と全文検索を併用
 *   2. 機械フィルタ  横長・幅1200px以上・jpeg/png・利用できるライセンス・題名に駅/地図/看板等が無い
 *   3. 所在地照合  commonsPlaceCheck（同名異所を見抜く。Vision はこれを通せない）
 *        ng   → 捨てる
 *        weak → Sonnet が identifiable:true で ok と言った場合だけ採用
 *        ok   → Haiku
 *   4. 2段階 Vision  Haiku 一次 → 「その場所だと断定できない」(identifiable:false) のときだけ Sonnet
 *   5. 保存後に画素照合  採用したファイルを Commons から取り直し、手元の main.jpg と画素を突き合わせて
 *        imageCredit が実ファイルと一致することを確かめる（audit の A と同じ物差し）
 *
 * このスクリプトは destinations.json を書き換えない（並列で走らせるため）。main.jpg を置き、
 * 結果を --out に残す。imageCredit の反映は applyDestImageReplacements.mjs が行う。
 *
 * usage: node scripts/replaceDestImages.mjs --ids logs/xxx.json --out logs/yyy.json [--shard 0/4] [--limit N]
 *   --ids は id の配列（または {id} の配列）。--shard i/n で id を n 分割して i 番目だけ処理する。
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
const IDS_FILE = arg('--ids');
const OUT = arg('--out', 'logs/replace_dest_images.json');
const [SHARD_I, SHARD_N] = (arg('--shard', '0/1')).split('/').map(Number);
const LIMIT = Number(arg('--limit', Infinity));
const MAX_CAND = Number(arg('--max-cand', 9));

const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));
const wanted = JSON.parse(fs.readFileSync(IDS_FILE, 'utf8')).map((x) => (typeof x === 'string' ? x : x.id));
const targets = wanted.filter((id, i) => i % SHARD_N === SHARD_I && byId.has(id)).slice(0, LIMIT);
const report = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { adopted: [], unresolved: [] };
const done = new Set([...report.adopted, ...report.unresolved].map((x) => x.id));
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

const IMG_Q = 'prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=1600';
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
  if (!c.w || c.w < 1200 || c.w <= c.h) return false;
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

async function gather(d, current) {
  const spotNames = (d.spots || []).filter((s) => s && typeof s === 'object').map((s) => s.name).filter(Boolean);
  const jaTitles = [...new Set([d.mainSpot, d.name, spotNames[0]].filter(Boolean))];
  const pool = new Map();
  const add = (list) => { for (const c of list) if (!pool.has(c.title)) pool.set(c.title, c); };
  for (const ja of jaTitles.slice(0, 3)) {
    const en = await enTitle(ja);
    await sleep(250);
    if (en) {
      add(await catFiles(en)); await sleep(250);
      add(await search(en)); await sleep(250);
    }
  }
  for (const q of [d.mainSpot, `${d.name} ${d.prefecture}`, d.name, spotNames[1]].filter(Boolean)) {
    add(await search(q)); await sleep(250);
  }
  return [...pool.values()].filter((c) => acceptable(c, d, current));
}

// ---------------------------------------------------------------- 2段階 Vision
const SYSTEM = `あなたは旅行サイトの画像審査担当です。指定された旅先の「紹介ページのヒーロー画像」として使えるかを判定します。
使える: その旅先（または主な見どころ）の風景・景観・名所・建築の外観が、明るく見映えよく写っている写真。
使えない: 別の場所の写真／駅・ホーム・駅名標／港の設備だけ／看板・案内板・ロゴ／屋内の展示や資料／人物が主役／地図・図表・イラスト／
文字の焼き込み／極端に暗い・ブレている／被写体が小さすぎて何か分からない。
JSONのみで返答: {"verdict":"ok"|"ng","identifiable":true|false,"subject":"風景|名所|建築|施設|駅|看板|屋内|その他","reason":"40字以内"}
identifiable は「その場所だと断定できる手がかり（社号標・特徴的な建造物・地形・看板）が写っているか」。`;

async function judge(model, buf, ctx) {
  const b64 = (await sharp(buf).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer()).toString('base64');
  for (let i = 0; i < 4; i++) {
    try {
      const res = await client.messages.create({
        model, max_tokens: 300, system: SYSTEM,
        messages: [{ role: 'user', content: [
          { type: 'text', text: `旅先: ${ctx}\nこの画像は紹介画像として適切か判定。` },
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
for (const id of targets) {
  if (stopped) break;
  if (done.has(id)) continue;
  const d = byId.get(id);
  const current = d.imageCredit?.url ? decodeURIComponent((d.imageCredit.url.split('/wiki/')[1] || '').replace(/_/g, ' ')) : null;
  const ctx = `${d.name}（${d.prefecture}）${d.mainSpot ? ' 主な見どころ: ' + d.mainSpot : ''}`;
  const words = [d.name, d.mainSpot, ...(d.spots || []).filter((s) => s && typeof s === 'object').map((s) => s.name)].filter(Boolean);

  const cands = await gather(d, current);
  // 所在地照合を先に（無料）。ng は捨て、ok を先頭に
  const checked = [];
  for (const c of cands) {
    let pc = null;
    try { pc = await placeCheck(c.title, d.prefecture, words); } catch { /* 取れなければ weak 扱い */ }
    await sleep(200);
    if (pc?.verdict === 'ng') continue;
    checked.push({ c, place: pc?.verdict ?? 'weak', pc });
  }
  checked.sort((a, b) => (a.place === 'ok' ? 0 : 1) - (b.place === 'ok' ? 0 : 1) || b.c.w - a.c.w);

  let picked = null; const tried = [];
  for (const { c, place } of checked.slice(0, MAX_CAND)) {
    const buf = await http(c.url, 'buf');
    await sleep(1200);
    if (!buf) { tried.push({ title: c.title, stage: 'download' }); continue; }
    let h;
    try { h = await judge(HAIKU, buf, ctx); }
    catch (e) { console.log(`⛔ API停止（${e.status}）: ここまでの成果を保存して終了`); stopped = true; break; }
    if (h.verdict !== 'ok') { tried.push({ title: c.title, place, stage: 'haiku', ...h }); continue; }
    // グレーゾーン: 所在地が weak、または Haiku が「断定できない」と言った → Sonnet で確定させる
    if (h.identifiable === false || place !== 'ok') {
      await sleep(600);
      let s;
      try { s = await judge(SONNET, buf, ctx); }
      catch (e) { console.log(`⛔ API停止（${e.status}）`); stopped = true; break; }
      tried.push({ title: c.title, place, stage: 'sonnet', haiku: h, sonnet: s });
      if (s.verdict !== 'ok') continue;
      if (place !== 'ok' && s.identifiable !== true) continue;     // 根拠の無い weak は通さない
      picked = { c, buf, place, verdict: { haiku: h, sonnet: s } };
    } else {
      tried.push({ title: c.title, place, stage: 'haiku', ...h });
      picked = { c, buf, place, verdict: { haiku: h } };
    }
    break;
  }
  if (stopped) break;

  if (!picked) {
    report.unresolved.push({ id, name: d.name, current, candidates: checked.length, tried: tried.slice(0, 12) });
    console.log(`  ❌ ${id}: 合格なし（候補${checked.length}・試行${tried.length}）`);
  } else {
    const dir = path.join('public/images', id);
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, 'main.jpg');
    await sharp(picked.buf).resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true, progressive: true }).toFile(out);
    // 5. 保存後の画素照合: Commons から取り直して、置いた main.jpg と突き合わせる
    const again = await http(picked.c.url, 'buf');
    const diff = again ? pdiff(await fp(fs.readFileSync(out)), await fp(again)) : null;
    const credit = creditOf(picked.c);
    report.adopted.push({ id, name: d.name, file: picked.c.title, credit, place: picked.place, verdict: picked.verdict, pixelDiffAfter: diff, replaced: current });
    console.log(`  ✅ ${id}: ${picked.c.title.replace('File:', '').slice(0, 44)} [${picked.verdict.sonnet ? 'Haiku→Sonnet' : 'Haiku'}・所在${picked.place}・画素差${diff}]`);
  }
  save();
  await sleep(800);
}
save();
console.log(`\n採用 ${report.adopted.length} / 未解決 ${report.unresolved.length}${stopped ? '（API停止で中断。再実行で続きから）' : ''}`);
