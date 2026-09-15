#!/usr/bin/env node
/**
 * descStyleCheck.mjs — description が新しい書き方の基準を満たしているかを見る。
 *
 * 旧基準は「五感表現を必ず1つ以上」を得点にしていたため、1,308件が同じ語彙に
 * 収束し、「ここでしか味わえない」が3件に1件という状態になった。
 * そこで五感は必須ではなく上限（多くても2箇所）に反転させ、
 * 固定化した言い回しと推測表現を弾き、事実の密度と文のリズムを見る。
 *
 * usage:
 *   node scripts/descStyleCheck.mjs                 全件を集計
 *   node scripts/descStyleCheck.mjs <id> [...]      指定したidだけ詳しく
 *   node scripts/descStyleCheck.mjs --file a.json   {id: description} を検査
 */
import fs from 'fs';

/** 固定化した言い回し。1つでも入っていたら不合格 */
export const NG_PHRASES = [
  'ここでしか', 'ここならでは', 'ここにしかない', 'ここだけのもの', 'だけのものだ',
  '味わえない', '出会えない', '息を呑', 'に包まれ', '静寂',
  '鼻腔', '肌をなで', '肌を撫で', '空気が変わる', 'が広がる',
];
/** 推測・ぼかし。断定できる事実は断定する */
export const NG_HEDGE = ['だろう', 'かもしれない', 'ようだ', '思わせる', '感じられる', 'とされる気がする'];
/**
 * 五感の語。禁止ではなく上限を設ける。
 * 「音」「光」「風」を素の1文字で見ると観光・風景・光客まで拾ってしまうので、
 * 感覚として使われている形だけを取る。
 */
export const SENSE = [
  ['匂い', /匂い/], ['香り', /香り|香る|香ばし/], ['湯けむり', /湯けむり|湯気/],
  ['せせらぎ', /せせらぎ/], ['静か', /静か/], ['肌', /肌/],
  ['冷たい', /冷た/], ['温かい', /温か|熱さ/], ['甘い', /甘[いさ]/], ['塩辛い', /塩辛/],
  ['湿った', /湿っ/], ['聞こえる', /聞こえ/], ['見える', /見える|目に入る/],
  ['触れる', /触れ/], ['味わう', /味わ/],
  ['音', /[水足波羽鐘風]音|音が|音だけ|轟音/], ['風', /潮風|そよ風|風が|風を/],
];

const sentences = (t) => t.split(/(?<=。)/).map((s) => s.trim()).filter(Boolean);

/** 数値の数。距離・所要時間・年・温度・本数。漢数字の表記ゆれも拾う */
function countNumbers(t) {
  const arabic = t.match(/[0-9０-９]+/g) || [];
  const kanji = t.match(/[一二三四五六七八九十百千万]+(?=年|分|時間|度|人|軒|種|本|号|世紀|km|メートル|キロ)/g) || [];
  return arabic.length + kanji.length;
}

export function checkDesc(text) {
  const t = String(text || '');
  const ss = sentences(t);
  const lens = ss.map((s) => s.length);
  const senseHits = SENSE.filter(([, re]) => re.test(t)).map(([label]) => label);
  const proper = new Set([...t.matchAll(/[一-龥]{2,}/g)].map((m) => m[0]));
  const polite = (t.match(/できます|です。|ます。/g) || []).length;

  const issues = [];
  const ng = NG_PHRASES.filter((p) => t.includes(p));
  if (ng.length) issues.push(`禁止句 ${ng.join('/')}`);
  const hedge = NG_HEDGE.filter((p) => t.includes(p));
  if (hedge.length) issues.push(`推測表現 ${hedge.join('/')}`);
  if (senseHits.length > 2) issues.push(`五感${senseHits.length}箇所（上限2）${senseHits.join('/')}`);
  const nums = countNumbers(t);
  if (nums < 2) issues.push(`数値${nums}個（2つ以上）`);
  if (!lens.some((l) => l <= 15)) issues.push('15字以下の短文が無い');
  if (!lens.some((l) => l >= 35)) issues.push('40字前後の長めの文が無い');
  if (proper.size < 5) issues.push(`固有名詞まわりの漢字語 ${proper.size}種（5種以上）`);
  if (t.length < 200 || t.length > 300) issues.push(`${t.length}字（200〜300字）`);
  if (polite > 3) issues.push(`です・ます ${polite}回（3回以下）`);

  return {
    ok: issues.length === 0, issues,
    len: t.length, n: ss.length,
    min: lens.length ? Math.min(...lens) : 0,
    max: lens.length ? Math.max(...lens) : 0,
    nums, sense: senseHits.length, polite,
  };
}

// ---- CLI ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));

  let entries;
  if (args[0] === '--file') {
    const obj = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    entries = Object.entries(obj).map(([id, description]) => ({ id, name: dests.find((d) => d.id === id)?.name ?? id, description }));
  } else if (args.length) {
    entries = args.map((id) => dests.find((d) => d.id === id)).filter(Boolean);
  } else {
    entries = dests.filter((d) => d.description);
  }

  let ok = 0;
  const detail = args.length > 0;
  for (const e of entries) {
    const r = checkDesc(e.description);
    if (r.ok) ok++;
    if (detail || !r.ok) {
      const head = `${r.ok ? '✅' : '❌'} ${String(e.id).padEnd(22)} ${String(e.name).slice(0, 12).padEnd(14)}`;
      const body = `${String(r.len).padStart(3)}字 文${String(r.n).padStart(2)} 最短${String(r.min).padStart(2)} 最長${String(r.max).padStart(2)} 数値${String(r.nums).padStart(2)} 五感${r.sense}`;
      console.log(`${head} ${body}${r.ok ? '' : '\n      ' + r.issues.join(' / ')}`);
    }
  }
  console.log(`\n通過 ${ok} / ${entries.length}（${(ok / entries.length * 100).toFixed(1)}%）`);
  if (detail) process.exit(ok === entries.length ? 0 : 1);
}
