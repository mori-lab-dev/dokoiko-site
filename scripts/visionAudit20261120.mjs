#!/usr/bin/env node
/**
 * visionAudit20261120.mjs — 全旅先ページのヒーロー画像と見どころ画像を、Vision（Haiku）で「旅先・見どころと合うか」判定する（読むだけ。画像・データは変えない）（2026-11-19）。
 *   usage: node scripts/visionAudit20261120.mjs count            枚数を数える
 *          node scripts/visionAudit20261120.mjs probe            1画像で残高確認（クレジット不足なら止まる）
 *          node scripts/visionAudit20261120.mjs haiku [--limit N] [--conc N]  1回目（Haiku）。結果を logs/vision_20261120/haiku.jsonl に追記（再開できる）
 *          node scripts/visionAudit20261120.mjs sonnet            2回目（Sonnet）。1回目で「別の場所」「無関係」と判定されたものだけ
 *   費用: 応答の usage から実測して合算。上限 $10 の 1.3 倍（$13）に届きそうなら止まる。単価は Haiku 4.5 入力$1/出力$5・Sonnet 4.6 入力$3/出力$15（百万トークンあたり）。
 */
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
const env = fs.readFileSync('./.env', 'utf-8');
for (const l of env.split('\n')) { const m = l.match(/^([A-Z_]+)=(.+)$/); if (m) process.env[m[1]] = m[2].trim(); }
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 4 });
const OUT = 'logs/vision_20261120'; fs.mkdirSync(OUT, { recursive: true });
const PRICE = { 'claude-haiku-4-5': [1, 5], 'claude-sonnet-4-6': [3, 15] }; const CAP = 13;
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const items = [];
for (const d of dests) {
  const main = `public/images/${d.id}/main.jpg`; const h0 = d.images?.[0];
  const base = { id: d.id, 旅先: d.name, 県: d.prefecture, 種類: 'ヒーロー', 見どころ: d.mainSpot || '' };
  if (fs.existsSync(main)) items.push({ key: `${d.id}|hero`, ...base, local: main });
  else if (h0 && h0.startsWith('http')) items.push({ key: `${d.id}|hero`, ...base, url: h0 });
  else if (h0 && fs.existsSync('public' + h0)) items.push({ key: `${d.id}|hero`, ...base, local: 'public' + h0 });
  for (const s of d.spots || []) {
    if (!s.imageUrl) continue;
    const it = { key: `${d.id}|spot|${s.name}`, id: d.id, 旅先: d.name, 県: d.prefecture, 種類: '見どころ', 見どころ: s.name };
    if (s.imageUrl.startsWith('http')) it.url = s.imageUrl; else if (fs.existsSync('public' + s.imageUrl)) it.local = 'public' + s.imageUrl; else continue;
    items.push(it);
  }
}
const mode = process.argv[2]; const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
if (mode === 'count') {
  const c = { ヒーロー: 0, 見どころ: 0, ローカル: 0, 外部URL: 0 };
  for (const i of items) { c[i.種類]++; if (i.local) c.ローカル++; else c.外部URL++; }
  console.log(JSON.stringify({ 合計: items.length, ...c })); process.exit(0);
}
const UA = 'Mozilla/5.0 (compatible; dokoiko-image-audit/1.0; site maintenance)';
const shrink = async (buf) => (await sharp(buf).rotate().resize({ width: 512, height: 512, fit: 'inside' }).jpeg({ quality: 70 }).toBuffer()).toString('base64');
const CACHE = '/private/tmp/claude-501/scr/wm'; fs.mkdirSync(CACHE, { recursive: true });
const cpath = (u) => `${CACHE}/${crypto.createHash('md5').update(u).digest('hex')}.img`;
async function loadImage(it) {
  if (it.local) return shrink(it.local);
  if (fs.existsSync(cpath(it.url))) return shrink(fs.readFileSync(cpath(it.url)));
  if (mode === 'haiku' || mode === 'sonnet') throw new Error('未取得（fetch が先）');
  for (let t = 0; t < 4; t++) {
    const r = await fetch(it.url, { headers: { 'user-agent': UA } });
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 3000 * (t + 1))); continue; }
    if (!r.ok) throw new Error('取得 ' + r.status);
    return shrink(Buffer.from(await r.arrayBuffer()));
  }
  throw new Error('取得失敗');
}
const PROMPT = (it) => `旅行サイトの旅先ページに載せた画像です。旅先: ${it.旅先}（${it.県}）。${it.種類 === 'ヒーロー' ? 'ページ冒頭の代表画像' : `見どころ「${it.見どころ}」の画像`}。
次を JSON だけで答えてください（説明文なし）: {"主題":"何が写っているか（25字以内）","判定":"合う|別の場所|無関係|特定不能","理由":"30字以内"}
基準: 合う=旅先・見どころとして自然（その地域の風景・施設・食べ物・温泉など）。別の場所=写っているのが明らかに別の場所・別の施設（例: 別の県の城・寺・有名な建築、別の観光地として有名な景観）と分かる。無関係=旅先と関係ない写真（人物のポートレート・室内・汎用アイコン・日本地図・ロゴなど）。特定不能=場所が分からない一般的な風景。確信が持てないときは「特定不能」か「合う」にする。`;
let spent = 0; const tally = { in: 0, out: 0 };
async function judge(it, model) {
  const b64 = await loadImage(it);
  const r = await client.messages.create({ model, max_tokens: 160, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }, { type: 'text', text: PROMPT(it) }] }] });
  const u = r.usage; const cost = (u.input_tokens * PRICE[model][0] + u.output_tokens * PRICE[model][1]) / 1e6; spent += cost; tally.in += u.input_tokens; tally.out += u.output_tokens;
  const txt = r.content[0]?.text || ''; const m = txt.match(/\{[\s\S]*\}/); let j = {};
  try { j = JSON.parse(m[0]); } catch { j = { 判定: '解析失敗', 理由: txt.slice(0, 60) }; }
  return { key: it.key, id: it.id, 旅先: it.旅先, 県: it.県, 種類: it.種類, 見どころ: it.見どころ, 画像: it.local || it.url, ...j, model, usd: +cost.toFixed(6), in: u.input_tokens, out: u.output_tokens };
}
if (mode === 'fetch') {   // Wikimedia は 429（Retry-After 120秒）を返すので、優先順に1枚ずつ、Retry-After を守って取得してキャッシュする。--minutes で時間を区切る
  console.log(`PID ${process.pid}`); fs.writeFileSync(`${OUT}/fetch.pid`, String(process.pid));
  const limitMs = +(arg('--minutes') || 60) * 60000; const t0 = Date.now();
  const KNOWN = new Set(['tsumago', 'yamadera', 'yakake', 'ono-fukui', 'hachimantai-onsen', 'magome', 'eiheiji', 'unzen2', 'hiji']);
  const cnt = new Map(); for (const it of items) if (it.url) cnt.set(it.url, (cnt.get(it.url) || 0) + 1);
  const urls = items.filter((x) => x.url); // 優先: 既知の取り違えページ → 同じ画像が複数ページに使われている → 残り
  const pri = (it) => (KNOWN.has(it.id) ? 0 : cnt.get(it.url) > 1 ? 1 : 2);
  const order = [...urls].sort((a, b) => pri(a) - pri(b));
  let n = 0; const seen = new Set();
  for (const it of order) {
    if (Date.now() - t0 > limitMs) break; if (seen.has(it.url) || fs.existsSync(cpath(it.url))) continue; seen.add(it.url); let got = false;
    for (let t = 0; t < 4 && !got && Date.now() - t0 < limitMs; t++) {
      const r = await fetch(it.url, { headers: { 'user-agent': 'dokoiko-audit/1.0 (site maintenance)' } });
      if (r.status === 429) { await new Promise((s) => setTimeout(s, (+r.headers.get('retry-after') || 120) * 1000 + 1000)); continue; }
      if (!r.ok) break;
      fs.writeFileSync(cpath(it.url), Buffer.from(await r.arrayBuffer())); got = true; n++;
    }
    if (n % 20 === 0 && n) console.log(`取得 ${n}（${Math.round((Date.now() - t0) / 60000)}分）`);
    await new Promise((s) => setTimeout(s, 3000));
  }
  console.log(`取得終了 ${n} 枚（${Math.round((Date.now() - t0) / 60000)}分）。キャッシュ合計 ${fs.readdirSync(CACHE).length}`); process.exit(0);
}
if (mode === 'name') {   // 外部URL（Wikimedia）の画像は取得が 429 で止まり、画像そのものを見られない。代わりに「ファイル名」だけで Haiku に判定させる（画像は見ていない。参考）
  const file = `${OUT}/name.jsonl`; const readJl2 = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
  const done2 = new Set(readJl2(file).map((x) => x.key)); const fname = (u) => { const p = new URL(u).pathname.split('/'); const i = p.indexOf('thumb'); return decodeURIComponent(i >= 0 ? p[p.length - 2] : p[p.length - 1]); };
  const todo = items.filter((i) => i.url && !done2.has(i.key)); let idx = 0, ok = 0, ng = 0; console.log(`name 対象 ${todo.length}`);
  const NP = (it) => `旅行サイトの旅先ページに載せた画像の「ファイル名」だけから判断します（画像は見えません）。旅先: ${it.旅先}（${it.県}）。${it.種類 === 'ヒーロー' ? 'ページ冒頭の代表画像' : `見どころ「${it.見どころ}」の画像`}。ファイル名: ${fname(it.url)}
JSON だけで答えてください: {"ファイル名が示す場所":"（地名・施設名。分からなければ空）","判定":"合う|別の場所|特定不能","理由":"30字以内"}。別の場所=ファイル名が、旅先・見どころとは明らかに別の場所・施設の名前（例: 別の県の城・寺・観光地）を示している。日付や連番だけ・一般語だけのファイル名は「特定不能」。確信が持てなければ「特定不能」。`;
  async function w2() { while (true) { const i = idx++; if (i >= todo.length || spent > CAP) return; const it = todo[i];
    try { const r = await client.messages.create({ model: 'claude-haiku-4-5', max_tokens: 120, messages: [{ role: 'user', content: NP(it) }] }); const u = r.usage; const cost = (u.input_tokens + u.output_tokens * 5) / 1e6; spent += cost; const m = (r.content[0]?.text || '').match(/\{[\s\S]*\}/); let j = {}; try { j = JSON.parse(m[0]); } catch { j = { 判定: '解析失敗' }; }
      fs.appendFileSync(file, JSON.stringify({ key: it.key, id: it.id, 旅先: it.旅先, 種類: it.種類, 見どころ: it.見どころ, ファイル名: fname(it.url), ...j, usd: +cost.toFixed(6) }) + '\n'); ok++; } catch (e) { ng++; } if ((ok + ng) % 500 === 0) console.log(`${ok + ng}/${todo.length} $${spent.toFixed(2)}`); } }
  await Promise.all(Array.from({ length: 8 }, w2)); console.log(`name 完了 成功${ok} 失敗${ng} 今回 $${spent.toFixed(3)}`); process.exit(0);
}
if (mode === 'known') {   // 既知の画像の取り違え（画像を外す前の7枚）を、同じ手順（Haiku→疑いはSonnet）で判定して検出率を測る
  const T = JSON.parse(fs.readFileSync('logs/identity_20261120/img_targets.json', 'utf8')); const res = [];
  for (const [id, name, url] of T) {
    const d = dests.find((x) => x.id === id); const it = { key: `${id}|spot|${name}`, id, 旅先: d.name, 県: d.prefecture, 種類: '見どころ', 見どころ: name, url };
    const h = await judge(it, 'claude-haiku-4-5'); let sn = null; if (h.判定 === '別の場所' || h.判定 === '無関係') sn = await judge(it, 'claude-sonnet-4-6');
    res.push({ 画像: `${d.name}/${name}`, haiku: { 判定: h.判定, 主題: h.主題 }, sonnet: sn ? { 判定: sn.判定, 主題: sn.主題 } : null });
  }
  fs.writeFileSync(`${OUT}/known.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); console.log(`使用額 $${spent.toFixed(4)}`); process.exit(0);
}
if (mode === 'probe') {
  try {
    const it = items.find((x) => x.local); const r = await judge(it, 'claude-haiku-4-5'); console.log('✅ 残高あり', JSON.stringify(r));
    const u = items.find((x) => x.url);
    try { const r2 = await judge(u, 'claude-haiku-4-5'); console.log('外部URL(Wikimedia)取得 ✅', JSON.stringify(r2)); } catch (e) { console.log('外部URL ❌', e.message); }
  } catch (e) { console.log('❌', e.status ?? '', e.error?.error?.message ?? e.message); process.exit(1); }
  process.exit(0);
}
const file = mode === 'haiku' ? `${OUT}/haiku.jsonl` : `${OUT}/sonnet.jsonl`; const model = mode === 'haiku' ? 'claude-haiku-4-5' : 'claude-sonnet-4-6';
const readJl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const prior = readJl(file); const done = new Set(prior.map((x) => x.key)); const spentBefore = prior.reduce((s, x) => s + (x.usd || 0), 0);
let todo = items.filter((i) => !done.has(i.key));
if (mode === 'sonnet') { const flag = new Set(readJl(`${OUT}/haiku.jsonl`).filter((x) => x.判定 === '別の場所' || x.判定 === '無関係').map((x) => x.key)); todo = todo.filter((i) => flag.has(i.key)); }
if (arg('--limit')) todo = todo.slice(0, +arg('--limit'));
console.log(`${mode} 対象 ${todo.length} 枚（済み ${done.size}）PID ${process.pid}`); fs.writeFileSync(`${OUT}/${mode}.pid`, String(process.pid));
let idx = 0, ok = 0, ng = 0, stop = false; const errs = [];
async function worker() {
  while (!stop) {
    const i = idx++; if (i >= todo.length) return;
    if (spent + spentBefore > CAP) { stop = true; console.log('上限（$13）に届くので停止'); return; }
    try { const r = await judge(todo[i], model); fs.appendFileSync(file, JSON.stringify(r) + '\n'); ok++; }
    catch (e) { ng++; const msg = e.error?.error?.message ?? e.message; errs.push({ key: todo[i].key, msg: String(msg).slice(0, 100) }); if (/credit balance|authentication|permission/i.test(msg)) { stop = true; console.log('❌ 止まる:', msg); } }
    if ((ok + ng) % 200 === 0) console.log(`${ok + ng}/${todo.length} 成功${ok} 失敗${ng} 使用額 $${(spent + spentBefore).toFixed(2)}`);
  }
}
await Promise.all(Array.from({ length: +(arg('--conc') || 8) }, worker));
fs.writeFileSync(`${OUT}/${mode}_errors.json`, JSON.stringify(errs, null, 1));
console.log(`完了 成功${ok} 失敗${ng} 今回の使用額 $${spent.toFixed(3)}（累計 $${(spent + spentBefore).toFixed(3)}）入力${tally.in}トークン 出力${tally.out}トークン`);
