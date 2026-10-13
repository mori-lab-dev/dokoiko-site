#!/usr/bin/env node
/**
 * verifyReplacedStrict.mjs — 差し替えた画像のうち、「場所の語でも撮影座標でも裏が取れていない」ものを、Sonnet に厳しく問い直す（2026-10-13）。
 *
 * 県名の一致だけで通った画像には、同じ県の別の場所が混ざる（益田の滝に松江の庭園・天塩温泉に岩内の旭温泉・西米良に十勝の温泉）。
 * 材料: 画像そのもの＋ Commons のファイル名・カテゴリ・説明文＋ 旅先の名前・県・主な見どころ・説明文。
 * 問い: 「この写真は、この旅先（またはその主な見どころ）を写したものか」。yes のとき以外は不合格（unsure も落とす）。
 * 判定の対象は、auditLocalityOfReplaced が hitsLocal=false とした画像のうち、auditGeoOfReplaced で座標が取れないもの。
 *
 * usage: node scripts/verifyReplacedStrict.mjs logs/replace_*.json [--out logs/replaced_strict_verdict.json] [--drop]
 *   --drop … no/unsure の画像と出典を外す（dropWrongPlaceImages と同じ処理）
 */
import fs from 'fs';
import sharp from 'sharp';
import Anthropic from '@anthropic-ai/sdk';
import { placeCheck } from './commonsPlaceCheck.mjs';

const env = fs.readFileSync('./.env', 'utf-8');
for (const l of env.split('\n')) { const m = l.match(/^([A-Z_]+)=(.+)$/); if (m) process.env[m[1]] = m[2].trim(); }
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'logs/replaced_strict_verdict.json';
const DROP = args.includes('--drop');
const FORCE = new Set((args.includes('--force') ? args[args.indexOf('--force') + 1] : '').split(',').filter(Boolean));   // 場所の語が揃っていても問い直す id
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out' && args[i - 1] !== '--force');
const dests = new Map(JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')).map((d) => [d.id, d]));
const rad = (x) => (x * Math.PI) / 180;
const km = (a, b) => { const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };

const SYSTEM = `あなたは旅行サイトの画像審査担当です。写真が「指定の旅先（またはその主な見どころ）を写したもの」かを、厳しく判定します。
同じ県や似た名前の別の場所の写真は no。場所を断定できる手がかり（Commons のファイル名・カテゴリ・説明文・写っている看板や特徴的な建造物・地形）が旅先と合うときだけ yes。確信が持てないなら unsure。
JSONのみで返答: {"match":"yes"|"no"|"unsure","reason":"60字以内"}`;

const rows = [];
for (const f of files) for (const a of JSON.parse(fs.readFileSync(f, 'utf8')).adopted || []) {
  const d = dests.get(a.id);
  if (!d || d.imageCredit?.url !== a.credit.url) continue;
  const words = [d.name, d.mainSpot, ...(d.spots || []).filter((s) => s && typeof s === 'object').map((s) => s.name)].filter(Boolean);
  const pc = await placeCheck(a.file, d.prefecture, words);
  const g = await (await fetch(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=coordinates&colimit=1&titles=${encodeURIComponent(a.file)}`, { headers: UA })).json();
  const c = Object.values(g.query?.pages || {})[0]?.coordinates?.[0];
  const geoKm = c ? km({ lat: d.lat, lng: d.lng }, { lat: c.lat, lng: c.lon }) : null;
  const geoBad = geoKm != null && geoKm > 40;
  if (!FORCE.has(a.id) && pc.hitsLocal && !geoBad) continue;                 // 場所の語で裏が取れている（座標も離れていない）→ 対象外
  if (!FORCE.has(a.id) && !pc.hitsLocal && geoKm != null && geoKm <= 15) continue;   // 語は無いが撮影地点が旅先のごく近く → 対象外
  rows.push({ id: a.id, name: d.name, file: a.file, cats: pc.cats.slice(0, 6), desc: pc.desc, geoKm: geoKm == null ? null : +geoKm.toFixed(1), geoBad });
  await sleep(200);
}
console.log(`厳しく問い直す対象 ${rows.length}件`);
const verdicts = [];
for (const r of rows) {
  const d = dests.get(r.id);
  const buf = fs.readFileSync(`public/images/${r.id}/main.jpg`);
  const b64 = (await sharp(buf).resize({ width: 800, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer()).toString('base64');
  let v;
  try {
    const res = await client.messages.create({ model: 'claude-sonnet-4-6', max_tokens: 300, system: SYSTEM,
      messages: [{ role: 'user', content: [
        { type: 'text', text: `旅先: ${d.name}（${d.prefecture}）／主な見どころ: ${d.mainSpot || '-'}／紹介: ${d.description.slice(0, 120)}\nCommons ファイル名: ${r.file}\nカテゴリ: ${r.cats.join(' | ')}\n説明: ${r.desc}\n撮影地点と旅先の距離: ${r.geoKm == null ? '不明' : r.geoKm + 'km'}\nこの写真は旅先を写したものか。` },
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } }] }] });
    let t = res.content[0].text.trim(); const s = t.indexOf('{'), e = t.lastIndexOf('}'); if (s >= 0) t = t.slice(s, e + 1);
    v = JSON.parse(t);
  } catch (e) { v = { match: 'unsure', reason: '判定失敗' }; }
  if (r.geoBad) v = { match: 'no', reason: `撮影地点が旅先から${r.geoKm}km` };
  verdicts.push({ ...r, ...v });
  console.log(`  ${v.match === 'yes' ? '✅' : v.match === 'no' ? '❌' : '❓'} ${r.id.padEnd(22)} ${r.name.slice(0, 9).padEnd(10)} ${r.file.slice(5, 40)} | ${v.reason}`);
}
fs.writeFileSync(OUT, JSON.stringify(verdicts, null, 1));
const bad = verdicts.filter((v) => v.match !== 'yes');
console.log(`\n合格 ${verdicts.length - bad.length} / 不合格(no・unsure) ${bad.length}`);
if (DROP && bad.length) {
  const FILES = ['src/data/destinations.json', 'public/data/destinations.json'];
  const data = JSON.parse(fs.readFileSync(FILES[0], 'utf8'));
  for (const b of bad) { const d = data.find((x) => x.id === b.id); d.images = []; delete d.imageCredit; for (const p of [`public/images/${b.id}/main.jpg`]) if (fs.existsSync(p)) fs.unlinkSync(p); }
  for (const f of FILES) fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n');
  console.log(`✅ ${bad.length}件の画像と出典を外した`);
}
