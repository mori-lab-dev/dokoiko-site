#!/usr/bin/env node
/**
 * rewriteSpotDesc.mjs — スポットの説明文（40〜80字）から禁止句・推測表現を取り除いて書き直す（2026-10-13）。
 *
 * 新しい事実は足さない。元の説明と旅先の情報（名前・県・スポット名）にある事実だけで書く。
 * 採用の条件（すべて機械で判定）
 *   1. 40〜80字
 *   2. descStyleCheck の禁止句・推測表現を含まない
 *   3. 本文の数値は、元の説明に出てくるものだけ
 *   4. 本文の固有名詞（漢字・カタカナ3字以上の語）は、元の説明・旅先名・県名・スポット名・主な見どころのどれかに出てくるもの
 *      （材料にない地名・施設名を作らない）
 * 落ちたときは指摘を渡して最大4回まで書き直させる。通らないものは採用しない。
 *
 * usage: node scripts/rewriteSpotDesc.mjs --spots logs/xxx.json --out logs/yyy.json [--conc 6]
 *   --spots は {id, idx} の配列
 */
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { NG_PHRASES, NG_HEDGE } from './descStyleCheck.mjs';

const env = fs.readFileSync('./.env', 'utf-8');
for (const l of env.split('\n')) { const m = l.match(/^([A-Z_]+)=(.+)$/); if (m) process.env[m[1]] = m[2].trim(); }
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const arg = (f, d = null) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const targets = JSON.parse(fs.readFileSync(arg('--spots'), 'utf8'));
const OUT = arg('--out');
const UNRES = OUT.replace(/\.json$/, '.unresolved.json');
const CONC = Number(arg('--conc', 6));
const dests = new Map(JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')).map((d) => [d.id, d]));

const RULES = `あなたは旅行サイトの編集者です。スポットの説明文（40〜80字）を、禁止された言い回しを取り除いて書き直します。

# 守ること（機械で検査され、1つでも落ちると不採用）
- 40〜80字（句点を含む）。1〜2文
- **新しい事実を足さない**。元の説明に書かれている事実（場所・特徴・数値・手段）だけで書く。わからないことは書かない
- 元の説明に無い数値・年号・距離を入れない。元にある数値はそのまま使う
- 元の説明・旅先・スポット名に出てこない固有名詞（地名・施設名・人名）を入れない
- 推測表現（だろう・かもしれない・ようだ・思わせる・感じられる）は使わず、断定できる事実だけ書く
- 次の言い回しは使わない: ここでしか／ここならでは／ここにしかない／ここだけのもの／だけのものだ／味わえない／出会えない／息を呑／に包まれ／静寂／鼻腔／肌をなで／空気が変わる／が広がる
- 誇張・最上級・「必見」「絶対」は使わない。感覚の形容詞を重ねない

出力は説明文の本文のみ（前置き・鍵括弧・改行なし）。`;

const nums = (t) => (String(t).match(/[0-9０-９][0-9０-９,，.．]*/g) || []).map((n) => n.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，]/g, ''));
const words = (t) => [...new Set(String(t).match(/[一-龥ァ-ヶー]{3,}/g) || [])];

function check(text, src, ctx) {
  const issues = [];
  if (text.length < 40 || text.length > 80) issues.push(`${text.length}字（40〜80字）`);
  const ng = NG_PHRASES.filter((p) => text.includes(p)); if (ng.length) issues.push(`禁止句 ${ng.join('/')}`);
  const hg = NG_HEDGE.filter((p) => text.includes(p)); if (hg.length) issues.push(`推測表現 ${hg.join('/')}`);
  const have = new Set(nums(src)); const bad = [...new Set(nums(text))].filter((n) => !have.has(n));
  if (bad.length) issues.push(`元に無い数値 ${bad.join('・')}`);
  const pool = src + ' ' + ctx;
  // 3字以上の語が材料に部分一致で含まれるか（活用語尾の違い程度は許す）
  const novel = words(text).filter((w) => !pool.includes(w) && !pool.includes(w.slice(0, -1)) && ![...pool.matchAll(/./g)].length === 0 && !pool.includes(w.slice(0, 3)));
  if (novel.length) issues.push(`材料に無い語 ${novel.slice(0, 4).join('・')}`);
  return issues;
}

async function ask(user) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await client.messages.create({ model: MODEL, max_tokens: 300, system: RULES, messages: [{ role: 'user', content: user }] });
      return r.content[0].text.trim().replace(/^[「『"]|[」』"]$/g, '').replace(/\n+/g, '');
    } catch (e) { if (e.status === 400) throw e; await sleep(3000 * (i + 1)); }
  }
  return null;
}

const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const unres = fs.existsSync(UNRES) ? JSON.parse(fs.readFileSync(UNRES, 'utf8')) : {};
let stop = false;
async function one({ id, idx }) {
  const key = `${id}#${idx}`;
  const d = dests.get(id); const s = d?.spots?.[idx];
  if (!s?.description || out[key] || unres[key]) return;
  const ctx = [d.name, d.prefecture, d.mainSpot, ...d.spots.filter((x) => x && typeof x === 'object').map((x) => x.name)].filter(Boolean).join(' ');
  let fb = null, last = null;
  for (let a = 1; a <= 4; a++) {
    const user = `旅先: ${d.name}（${d.prefecture}）\nスポット名: ${s.name}\n元の説明: ${s.description}\n` + (fb ? `\n前回の文は次の理由で不採用。直して書き直して:\n${fb}\n` : '') + '\n書き直した説明文を出力してください。';
    let text; try { text = await ask(user); } catch (e) { console.log(`⛔ API停止（${e.status}）`); stop = true; return; }
    if (!text) break;
    const issues = check(text, s.description, ctx);
    last = { text, issues };
    if (!issues.length) { out[key] = { name: s.name, text }; return; }
    fb = issues.join(' / ') + `\n不採用だった文: ${text}`;
  }
  unres[key] = { name: s.name, old: s.description, last };
}
let next = 0, done = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (!stop && next < targets.length) {
    await one(targets[next++]);
    if (++done % 20 === 0) { fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); fs.writeFileSync(UNRES, JSON.stringify(unres, null, 1)); console.log(`  …${done}/${targets.length} 採用${Object.keys(out).length} 未解決${Object.keys(unres).length}`); }
  }
}));
fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); fs.writeFileSync(UNRES, JSON.stringify(unres, null, 1));
console.log(`採用 ${Object.keys(out).length} / 未解決 ${Object.keys(unres).length}${stop ? '（API停止）' : ''}`);
