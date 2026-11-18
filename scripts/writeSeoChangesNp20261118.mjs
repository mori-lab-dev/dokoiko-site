// logs/seo_changes_2026-11-18.md/.json に、優先ページ以外のメタの変更（第2回）を追記する（2026-11-18）。11/9・同日の第1回と重なるページを印にする
import fs from 'fs';
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const b = J('logs/nonpriority_meta_20261118/meta_before.json'), a = J('logs/nonpriority_meta_20261118/meta_after.json'); const prev9 = new Map(J('logs/seo_changes_2026-11-09.json').items.map((x) => [x.id, x]));
const cur = J('logs/seo_changes_2026-11-18.json'); const first = new Set((cur.items || []).map((x) => x.id)); const dests = new Map(J('src/data/destinations.json').map((d) => [d.id, d]));
const items = [];
for (const id of Object.keys(a)) { const f = ['title', 'description', 'ogTitle', 'ogDescription', 'twDescription'].filter((k) => a[id][k] !== b[id][k]); const ld = JSON.stringify(a[id].ldDescriptions) !== JSON.stringify(b[id].ldDescriptions); if (!(f.length || ld)) continue; const p = prev9.get(id);
  items.push({ id, name: dests.get(id).name, url: `https://tabidokoiko.com/destinations/${id}/`, 変更日: '2026-11-18（第2回・優先ページ以外）', 変えた欄: [...f, ...(ld ? ['構造化データの description'] : [])], 変更前: { description: b[id].description }, 変更後: { description: a[id].description }, '2026-11-09にも変更したページ': !!p, ...(p ? { '2026-11-09の変更': { before: p.before, after: p.after } } : {}), '同日の第1回（優先ページ）にも変更したページ': first.has(id), 理由: '料金・休館日の数字を公式で確認し、置換または削除した（メタに出る文）' }); }
cur.第2回_優先ページ以外 = { 変えたページ数: items.length, '11/9と重なるページ数': items.filter((x) => x['2026-11-09にも変更したページ']).length, '第1回と重なるページ数': items.filter((x) => x['同日の第1回（優先ページ）にも変更したページ']).length, items };
fs.writeFileSync('logs/seo_changes_2026-11-18.json', JSON.stringify(cur, null, 1));
const md = fs.readFileSync('logs/seo_changes_2026-11-18.md', 'utf8').split('\n## 第2回')[0]; const add = ['', '## 第2回（2026-11-18・優先ページ以外の料金・休館日）', '', `メタ（description・og・twitter・構造化データの description）が変わったページ: ${items.length}。うち 2026-11-09 にも変更: ${items.filter((x) => x['2026-11-09にも変更したページ']).length}。同日の第1回と重なる: ${items.filter((x) => x['同日の第1回（優先ページ）にも変更したページ']).length}。title は変えていない。`, '', '| ページ | 11/9にも変更 | 変えた欄 |', '|---|---|---|', ...items.map((x) => `| ${x.name}（${x.id}） | ${x['2026-11-09にも変更したページ'] ? 'はい' : 'いいえ'} | ${x.変えた欄.join('・')} |`), ''];
for (const x of items) add.push(`### ${x.name}（${x.id}）${x['2026-11-09にも変更したページ'] ? ' ※11/9にも変更' : ''}`, '変更前: ' + x.変更前.description.replace(/\n/g, ' '), '変更後: ' + x.変更後.description.replace(/\n/g, ' '), '');
fs.writeFileSync('logs/seo_changes_2026-11-18.md', md + '\n' + add.join('\n')); console.log(items.length, cur.第2回_優先ページ以外.経験 ?? '', cur.第2回_優先ページ以外['11/9と重なるページ数']);
