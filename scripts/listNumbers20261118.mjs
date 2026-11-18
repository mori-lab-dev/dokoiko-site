// 統合した5ページの、数字（所要時間・距離・料金・時刻・件数など）を含む文を、見出し・節ごとに一覧にする（2026-11-18・読み取りのみ）。食い違いの洗い出しの入力。
import fs from 'fs';
const pairs = JSON.parse(fs.readFileSync('scripts/data/mergedPages.json', 'utf8')).pairs.filter((p) => p.hash);
const reps = [...new Set(pairs.map((p) => p.to))];
const NUM = /[0-9０-９]+|[〇一二三四五六七八九十百千万]+(?=分|時間|キロ|メートル|円|人|段|本|年|世紀|日|便|軒|室|台|棟|か所|カ所|箇所|倍|度|歩|周|回)/;
const sents = (t) => String(t || '').split(/\n+/).flatMap((l) => l.match(/[^。]+。?/g) || []).map((s) => s.trim()).filter(Boolean);
const out = [];
for (const rep of reps) {
  const a = JSON.parse(fs.readFileSync(`src/data/articles/${rep}.json`, 'utf8'));
  for (const g of a.groups) {
    const add = (where, text) => { for (const s of sents(text)) if (NUM.test(s)) out.push({ page: rep, group: g.id, where, s }); };
    add('description', g.description); add('lead', g.lead); add('tips', typeof g.tips === 'string' ? g.tips : (g.tips || []).join('\n')); add('bestSeason', g.bestSeason);
    if (g.modelCourse) { add('modelCourse.daytrip', g.modelCourse.daytrip); add('modelCourse.onenight', g.modelCourse.onenight); }
    g.sections.forEach((s, i) => { add(`節${i + 1}「${(s.title || '').slice(0, 14)}」body`, s.body); add(`節${i + 1}「${(s.title || '').slice(0, 14)}」info`, s.info); add(`節${i + 1}title`, s.title); });
  }
  const d = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')).find((x) => x.id === rep);
  for (const sp of d.spots || []) for (const s of sents(sp.description)) if (NUM.test(s)) out.push({ page: rep, group: '(spots)', where: `spot「${sp.name}」`, s });
}
fs.writeFileSync('logs/conflicts_20261118/numbers.json', JSON.stringify(out, null, 1));
for (const p of reps) { console.log(`\n######## ${p}`); for (const r of out.filter((x) => x.page === p)) console.log(`[${r.group}|${r.where}] ${r.s}`); }
console.log('\n文', out.length);
