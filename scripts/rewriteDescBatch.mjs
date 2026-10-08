#!/usr/bin/env node
/**
 * rewriteDescBatch.mjs — description を新基準で書き直す（2026-10-08）。Sonnet が書き、機械が検査する。
 *
 * 採用の条件は2つ（どちらも機械で判定。人の目や自己申告は使わない）
 *   1. descStyleCheck の全項目に通る（禁止句・推測・五感2箇所まで・数値2つ以上・文長の幅・固有名詞・200〜300字・です/ます3回以下）
 *   2. **本文中の数値がすべて材料（既存の本文・スポット説明・交通・宿・所要時間）に出てくる**
 *      （捏造防止。新基準は「数値2つ以上」を求めるので、材料に無い数値を作って埋めがちになる）
 * 落ちたときは指摘を渡して最大4回まで書き直させる。それでも通らないものは採用せず unresolved に残す。
 *
 * 書く順番: 事実 → 行き方 → 見どころ → 情景1文
 *
 * destinations.json は書き換えない。結果は --out（{id: description}）。反映は applyDescRewrite.mjs。
 *
 * usage: node scripts/rewriteDescBatch.mjs --ids logs/xxx.json --out logs/desc_new_NN.json [--conc 4]
 */
import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { checkDesc } from './descStyleCheck.mjs';

const env = fs.readFileSync('./.env', 'utf-8');
for (const l of env.split('\n')) { const m = l.match(/^([A-Z_]+)=(.+)$/); if (m) process.env[m[1]] = m[2].trim(); }
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const args = process.argv.slice(2);
const arg = (f, d = null) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const IDS = JSON.parse(fs.readFileSync(arg('--ids'), 'utf8')).map((x) => (typeof x === 'string' ? x : x.id));
const OUT = arg('--out');
const UNRES = OUT.replace(/\.json$/, '.unresolved.json');
const CONC = Number(arg('--conc', 4));

const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));

// 手本: 新基準を満たしている既存の文（種類の違うものを3つ）
const passing = dests.filter((d) => checkDesc(d.description).ok);
const EXAMPLES = ['island', 'onsen', 'sight'].map((t) => passing.find((d) => d.destType === t)).filter(Boolean)
  .map((d) => `【${d.name}】${d.description}`).join('\n');

const hours = (m) => (m % 60 === 0 ? `${m / 60}時間` : m < 60 ? `${m}分` : `${Math.floor(m / 60)}時間${m % 60}分`);
const CITY = { tokyo: '東京', osaka: '大阪', nagoya: '名古屋', fukuoka: '福岡', takamatsu: '高松' };

/** 材料。ここに出てくる数値だけが本文に使える */
function materials(d) {
  const tt = Object.entries(d.travelTime || {}).filter(([, v]) => typeof v === 'number')
    .map(([k, v]) => `${CITY[k] || k}から約${hours(v)}`);
  return {
    名前: d.name, 都道府県: d.prefecture, 種類: d.destType, 地方: d.region, タグ: d.tags, 主な見どころ: d.mainSpot, ベストシーズン: d.bestSeason,
    最寄り駅や港: d.accessStation, 玄関口: d.gateways, 拠点: d.hubName, 所要時間の目安: tt, 宿の説明: d.stayDescription,
    おすすめ滞在: d.stayRecommendation, 車が必要: d.requiresCar, 離島: d.isIsland,
    スポット: (d.spots || []).filter((s) => s && typeof s === 'object').map((s) => ({ 名前: s.name, 説明: s.description })),
    宿: d.featured_stay ? { 名前: d.featured_stay.name, 紹介: d.featured_stay.catchcopy, アクセス: d.featured_stay.accessStation, 送迎: d.featured_stay.shuttleInfo } : null,
    既存の本文: d.description,
  };
}
const numsOf = (t) => (String(t).match(/[0-9０-９][0-9０-９,，.．]*/g) || []).map((n) => n.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，]/g, ''));

/** 本文の数値が、材料に出てくるものだけか。出てこない数値を返す */
function ungrounded(text, mat) {
  const have = new Set(numsOf(JSON.stringify(mat)));
  // 「約3時間」(180分) のような換算は所要時間の目安に既に入れてある。それ以外の換算は許さない
  return [...new Set(numsOf(text))].filter((n) => !have.has(n));
}

const RULES = `あなたは旅行サイト「どこ行こ？」の編集者です。指定の旅先の紹介文（description）を書き直します。

# 書く順番（必ずこの順）
1. 事実（その場所が何か。位置・規模・歴史などの事実）
2. 行き方（最寄り駅・港・所要時間。材料にあるものだけ）
3. 見どころ（スポットを具体的に）
4. 情景を1文だけ（最後に1文。体言止めや短い一文でよい）

# 守ること（機械で検査され、1つでも落ちると不採用）
- 200〜300字。文の長さに幅を持たせる（15字以下の短い文を1つ以上、35字以上の長い文を1つ以上）
- 数値を2つ以上入れる。**ただし数値は材料に出てくるものだけ**（所要時間の目安もそのまま使える）。材料に無い数値・年号・距離・標高を作らない
- 材料にない固有名詞・施設名・歴史的事実は書かない。わからないことは書かない
- 行き方は「最寄り駅・港・バス・車」など実際の手段を中心に書く。「拠点は○○」「東京からは約◯時間」のような遠方からの所要時間は、数値が足りないときに限り、自然な1文に溶かして最大1か所だけ（「拠点は」で始めない）
- スポットの説明が旅先の所在地と明らかに合わない（遠く離れた別の地域のもの）と判断できる場合は、そのスポットを本文に使わない（材料の「既存の本文」や所在地を優先する）
- 文を「…も。」「…だ。」で機械的に揃えない。接続や言い回しに変化をつける
- 推測表現（だろう・かもしれない・ようだ・思わせる・感じられる）は使わない。断定できる事実だけ書く
- 五感の語（匂い・香り・湯けむり・せせらぎ・静か・肌・冷たい・温かい・甘い・聞こえる・見える・触れる・味わう・音・風）は全体で2種類まで。ゼロでもよい
- 次の言い回しは使わない: ここでしか／ここならでは／ここにしかない／ここだけのもの／だけのものだ／味わえない／出会えない／息を呑／に包まれ／静寂／鼻腔／肌をなで／空気が変わる／が広がる
- 「です。」「ます。」「できます」の合計は3回まで。ほかは常体（だ・である調でなく、言い切りの文）でよい
- 固有名詞（漢字2字以上の語）を5種類以上
- 誇張・最上級・「必見」「絶対」は使わない。同じ文末を続けない

# 手本（この文体・密度）
${EXAMPLES}

出力は説明文の本文のみ（前置き・鍵括弧・JSON・改行なし）。`;

async function ask(d, mat, feedback) {
  const user = `旅先の材料（JSON）:\n${JSON.stringify(mat, null, 1)}\n\n` +
    (feedback ? `前回の文は次の理由で不採用でした。直して書き直してください:\n${feedback}\n\n` : '') +
    'この旅先の description を書いてください。';
  for (let i = 0; i < 4; i++) {
    try {
      const r = await client.messages.create({ model: MODEL, max_tokens: 900, system: RULES, messages: [{ role: 'user', content: user }] });
      return r.content[0].text.trim().replace(/^[「『"]|[」』"]$/g, '').replace(/\n+/g, '');
    } catch (e) {
      if (e.status === 400) throw e;
      await sleep(3000 * (i + 1));
    }
  }
  return null;
}

const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
const unres = fs.existsSync(UNRES) ? JSON.parse(fs.readFileSync(UNRES, 'utf8')) : {};
let stop = false;

async function one(id) {
  const d = byId.get(id);
  if (!d || out[id] || unres[id]) return;
  const mat = materials(d);
  let feedback = null, last = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    let text;
    try { text = await ask(d, mat, feedback); } catch (e) { console.log(`⛔ API停止（${e.status}）`); stop = true; return; }
    if (!text) break;
    const r = checkDesc(text);
    const ug = ungrounded(text, mat);
    const issues = [...r.issues, ...(ug.length ? [`材料に無い数値 ${ug.join('・')}（材料にある数値だけを使う）`] : [])];
    last = { text, issues };
    if (!issues.length) { out[id] = text; console.log(`  ✅ ${id}（${attempt}回目・${text.length}字）`); return; }
    feedback = issues.join(' / ') + `\n不採用だった文: ${text}`;
  }
  unres[id] = last;
  console.log(`  ❌ ${id}: ${last?.issues?.join(' / ') ?? '生成失敗'}`);
}

const queue = IDS.filter((id) => !out[id] && !unres[id]);
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (!stop && next < queue.length) {
    const id = queue[next++];
    await one(id);
    fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
    fs.writeFileSync(UNRES, JSON.stringify(unres, null, 1));
  }
}));
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
fs.writeFileSync(UNRES, JSON.stringify(unres, null, 1));
console.log(`\n採用 ${Object.keys(out).length} / 未解決 ${Object.keys(unres).length}${stop ? '（API停止で中断。再実行で続きから）' : ''}`);
