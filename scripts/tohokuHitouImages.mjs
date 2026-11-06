// 東北の秘湯 追加分のメイン画像（2026-11-06）。Commons → 場所の機械照合(commonsPlaceCheck) → Haiku → Sonnet(厳しい基準) の順に通す。
// 合格が無ければ画像なしで掲載する（採らない）。使い方: node scripts/tohokuHitouImages.mjs
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { placeCheck } from './commonsPlaceCheck.mjs';

const env = fs.readFileSync('./.env', 'utf-8');
for (const line of env.split('\n')) { const m = line.match(/^([A-Z_]+)=(.+)$/); if (m) process.env[m[1]] = m[2].trim(); }
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const HAIKU = 'claude-haiku-4-5', SONNET = 'claude-sonnet-4-6';
const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TARGETS = [
  { id: 'hinoemata-onsen', name: '檜枝岐温泉', prefecture: '福島県', queries: ['檜枝岐温泉', '檜枝岐村 温泉 旅館', 'Hinoemata Onsen', '檜枝岐村'], locality: ['檜枝岐', 'Hinoemata', '尾瀬'] },
  { id: 'nakanosawa-onsen', name: '中ノ沢温泉', prefecture: '福島県', queries: ['中ノ沢温泉', 'Nakanosawa Onsen', '中ノ沢温泉 猪苗代', '沼尻温泉 猪苗代'], locality: ['中ノ沢', 'Nakanosawa', '猪苗代', 'Inawashiro', '沼尻'] },
];
const SYS1 = `あなたは旅行サイトの画像審査担当です。指定された旅先の紹介画像として使えるかを判定します。
不可の例: 別の場所の写真、屋内の資料展示だけ、人物のポートレート、文字やロゴの焼き込み、地図・図表・イラスト、極端に暗い/ブレている、被写体が小さすぎて何か分からない。
JSONのみで返答: {"verdict":"ok"|"ng","identifiable":true|false,"reason":"40字以内"}
identifiable は「その場所だと断定できる手がかり（地名看板・特徴的建造物・地形）が写っているか」。`;
const SYS2 = `あなたは旅行サイトの写真編集者です。ある旅先のトップに大きく出す1枚として使えるかを判定します。
使えないもの（場所が特定できても不可）: 駅舎・ホーム・駅名標・バス停・空港ターミナル、市役所・学校・一般建物、駐車場・道路・案内看板・標識が主役のもの、災害の記録写真・工事現場・航空写真の記録カット、屋内の資料展示・物のクローズアップ・人物のポートレート、地図・図表・イラスト・ロゴ、極端に暗い・白飛び・ブレている・被写体が小さすぎる。
使えるもの: その土地の自然、街並み、湯屋、社寺、山の景観など、見て行きたくなる風景。
JSONのみで返答: {"verdict":"ok"|"ng","subject":"写っているものを20字で","reason":"30字以内の理由"}`;
async function judge(model, sys, buf, text) {
  const b64 = (await sharp(buf).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer()).toString('base64');
  const res = await client.messages.create({ model, max_tokens: 300, system: sys, messages: [{ role: 'user', content: [{ type: 'text', text }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }] }] });
  let t = res.content[0].text.trim(); const s = t.indexOf('{'), e = t.lastIndexOf('}'); if (s >= 0) t = t.slice(s, e + 1);
  try { return JSON.parse(t); } catch { return { verdict: 'ng', identifiable: false, reason: 'JSON解析不可' }; }
}
async function candidates(query, limit = 8) {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent('filetype:bitmap ' + query)}&gsrnamespace=6&gsrlimit=${limit * 2}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600`;
  const j = await (await fetch(api, { headers: UA })).json();
  const out = [];
  for (const p of Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index)) {
    const ii = p.imageinfo?.[0]; if (!ii || ii.width < 1200 || ii.width <= ii.height) continue;
    out.push({ title: p.title, url: ii.thumburl || ii.url, descurl: ii.descriptionurl, em: ii.extmetadata || {} }); if (out.length >= limit) break;
  }
  return out;
}
const credit = (c) => ({ author: (c.em.Artist?.value || '').replace(/<[^>]*>/g, '').trim() || 'unknown', license: c.em.LicenseShortName?.value || 'unknown', url: c.descurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(c.title)}`, attributionRequired: true });
const report = { adopted: [], rejected: [], visionUnavailable: false };
const NOV = process.argv.includes('--candidates-only');   // Vision を使えないとき: 場所の機械照合まで通った候補を記録するだけ（採用しない）
for (const t of TARGETS) {
  const seen = new Set(); const tried = []; let picked = null;
  for (const q of t.queries) {
    for (const c of await candidates(q)) {
      if (seen.has(c.title) || picked) continue; seen.add(c.title); await sleep(900);
      const pc = await placeCheck(c.title, t.prefecture, t.locality);
      if (pc.verdict === 'ng') { tried.push({ title: c.title, stage: 'place', verdict: 'ng', others: pc.others }); continue; }
      if (NOV) { tried.push({ title: c.title, stage: 'place-only', place: pc.verdict, hitsLocal: pc.hitsLocal, hitsSelf: pc.hitsSelf, url: c.descurl }); continue; }
      let buf; try { const dl = await fetch(c.url, { headers: UA }); if (!dl.ok) { tried.push({ title: c.title, stage: 'download', reason: dl.status }); continue; } buf = Buffer.from(await dl.arrayBuffer()); } catch { continue; }
      const h = await judge(HAIKU, SYS1, buf, `旅先: ${t.name}（${t.prefecture}）\nこの画像は紹介画像として適切か判定。`);
      if (h.verdict !== 'ok') { tried.push({ title: c.title, stage: 'haiku', place: pc.verdict, ...h }); continue; }
      const s = await judge(SONNET, SYS2, buf, `旅先: ${t.name}\nこの写真をトップの1枚に使えるか判定。`);
      tried.push({ title: c.title, stage: 'sonnet', place: pc.verdict, haiku: h, sonnet: s });
      if (s.verdict !== 'ok') continue;
      if (pc.verdict === 'weak' && h.identifiable === false) { tried[tried.length - 1].note = '場所の根拠が弱く外す'; continue; }
      picked = { c, buf, pc, h, s };
    }
    if (picked) break;
  }
  if (!picked) { report.rejected.push({ id: t.id, name: t.name, tried, note: NOV ? 'Vision(Haiku/Sonnet)を使えないため採用せず、画像なしで掲載' : undefined }); console.log('❌', t.name, `合格なし(${tried.length}枚試行)`); continue; }
  fs.mkdirSync(path.join('public/images', t.id), { recursive: true });
  await sharp(picked.buf).jpeg({ quality: 88 }).toFile(path.join('public/images', t.id, 'main.jpg'));
  report.adopted.push({ id: t.id, name: t.name, title: picked.c.title, credit: credit(picked.c), place: picked.pc.verdict, subject: picked.s.subject, tried });
  console.log('✅', t.name, picked.c.title, '|', picked.s.subject, '| place=' + picked.pc.verdict);
}
fs.writeFileSync('logs/tohoku_hitou_images.json', JSON.stringify(report, null, 1) + '\n');
