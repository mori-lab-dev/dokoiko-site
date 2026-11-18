// 食い違い候補の機械的な洗い出し（2026-11-18・読み取りのみ）。入力: logs/conflicts_20261118/numbers.json（scripts/listNumbers20261118.mjs）。
// 方法: ①5ページの数字を含む文（292文）を、見出し・節ごとに列挙する。②同じ場所・事柄を指すキーワード（場所名・乗り物・出発地）ごとに、別の節・別の見出しの文を集める。
//       ③キーワードごとに、数字+単位（分・時間・km・m・円・年・段・時刻 など）の組が文の間で違うものを「候補」にする。④候補を目視で、同じ事柄か（別の場所・別のコース・別の出発地なら食い違いではない）を確かめる。
import fs from 'fs';
const rows = JSON.parse(fs.readFileSync('logs/conflicts_20261118/numbers.json', 'utf8'));
const KEYS = ['焼火神社', '国賀海岸', '摩天崖', 'ローソク島', '玉若酢命神社', '八百杉', '中ノ島', '海士町', '西ノ島', '別府港', '七類港', '隠岐', '阿波連', '渡嘉敷', '展望台', '古座間味', '阿真', 'ホエール', 'クイーンざまみ', '座間味', '阿嘉', '開龍寺', '石切場', '白石島', '真鍋島', '真鍋邸', '笠岡', '三虎', '小富士', 'おがさわら丸', 'ははじま丸', '父島', '母島', '球磨川', '人吉城', '歴史館', '青井阿蘇神社', '人吉旅館', '永国寺', '福岡', '熊本', '那覇', '大阪', '福山', 'フェリー', '高速船', 'レンタカー', 'シュノーケル', '2020年'];
const tok = (s) => [...s.matchAll(/(約)?([0-9０-９,，.]+|[〇一二三四五六七八九十百千万]+)\s*(分|時間|キロ|km|メートル|m|円|年|世紀|段|人|匹|度|℃|日|便|か所|%|％|時|月)?/g)].map((m) => m[2].replace(/[,，]/g, '') + (m[3] || '')).filter((x) => /[分時間キロkmメートルm円年段人匹度℃日便か所%％月]/.test(x) || x.length >= 3);
const out = [];
for (const k of KEYS) {
  const hits = rows.filter((r) => r.s.includes(k));
  const groups = new Set(hits.map((r) => `${r.page}|${r.group}|${r.where.split('」')[0]}`));
  if (groups.size < 2) continue;
  const sets = new Map(); for (const r of hits) { const key = `${r.page}|${r.group}`; (sets.get(key) || sets.set(key, new Set()).get(key)); for (const t of tok(r.s)) sets.get(key).add(t); }
  const all = new Set([...sets.values()].flatMap((s) => [...s]));
  const common = [...all].filter((t) => [...sets.values()].every((s) => s.has(t)));
  if (all.size > common.length && sets.size >= 2) out.push({ キーワード: k, 文数: hits.length, 見出し数: sets.size, 数字: [...all].join(' '), 文: hits.map((r) => `[${r.group}|${r.where.slice(0, 18)}] ${r.s}`) });
}
fs.writeFileSync('logs/conflicts_20261118/candidates.json', JSON.stringify(out, null, 1));
for (const o of out) console.log(`■ ${o.キーワード}（文${o.文数}・見出し${o.見出し数}）数字: ${o.数字}`);
console.log('\n候補キーワード', out.length, '/', KEYS.length);
