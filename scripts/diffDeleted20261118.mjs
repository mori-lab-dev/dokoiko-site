// 優先ページの修正・削除（backup/facts_20261118 の変更前と、今の記事）の差を、前後の文つきで一覧にする（2026-11-18・読み取りのみ）
import fs from 'fs';
const ids = process.argv.slice(2); const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
for (const id of ids) {
  const bf = `backup/facts_20261118/src__data__articles__${id}.json`; if (!fs.existsSync(bf)) { console.log(`## ${id}: 変更前の写しなし（変更なし）`); continue; }
  const b = J(bf), a = J(`src/data/articles/${id}.json`); console.log(`## ${id}`);
  const cmp = (lab, x, y) => { if (x === y) return; const xs = String(x || '').split('\n'), ys = String(y || '').split('\n'); const rem = xs.filter((l, i) => !ys.includes(l)); const add = ys.filter((l) => !xs.includes(l)); console.log(`- ${lab}\n  消えた行: ${JSON.stringify(rem)}\n  増えた行: ${JSON.stringify(add)}`);
    for (const r of rem) { const i = xs.indexOf(r); const prev = xs.slice(0, i).reverse().find((l) => ys.includes(l) && l.trim()); const next = xs.slice(i + 1).find((l) => ys.includes(l) && l.trim()); console.log(`  前後: 「${prev || ''}」→(消えた行)→「${next || ''}」`); } };
  cmp('lead', b.lead, a.lead); b.sections.forEach((s, i) => { cmp(`節${i + 1} body`, s.body, a.sections[i].body); cmp(`節${i + 1} info`, s.info, a.sections[i].info); }); cmp('tips', b.tips, a.tips);
  if (b.modelCourse) for (const k of Object.keys(b.modelCourse)) cmp(`modelCourse.${k}`, b.modelCourse[k], a.modelCourse[k]);
}
