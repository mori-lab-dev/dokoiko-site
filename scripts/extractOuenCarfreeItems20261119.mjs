// 確認日が古い項目（応援割17・車なし旅25）の一覧を作る（読むだけ）。出力: logs/ouen_carfree_20261119/items.json
import fs from 'fs'; import { SCHEMES } from '../src/data/ouenWari.ts';
const items = [];
for (const s of SCHEMES) for (const f of [...(s.channels ?? []), ...(s.facts ?? [])]) if (f.checked === '2026年11月4日') items.push({ 種類: '応援割', slug: s.slug, 制度: s.name, 項目: f.name ?? f.label, 値: f.value ?? f.text ?? f.body ?? f.note ?? null, 出典名: f.source?.name, 出典URL: f.source?.url, 確認日: f.checked, raw: f });
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
for (const d of dests) for (const it of d.carFree?.items ?? []) if (JSON.stringify(it).includes('2026年11月4日') || it.checked === '2026-11-04') items.push({ 種類: '車なし旅', slug: d.id, 制度: d.name, 項目: it.title ?? it.name ?? it.label, 値: it.body ?? it.text ?? it.value ?? null, 出典URL: it.source?.url ?? it.sourceUrl, 確認日: it.checked, raw: it });
fs.writeFileSync('logs/ouen_carfree_20261119/items.json', JSON.stringify(items, null, 1)); console.log(items.length, items.filter((i) => i.種類 === '応援割').length);
console.log(JSON.stringify(items[0]).slice(0, 700)); console.log(JSON.stringify(items.find((i) => i.種類 === '車なし旅')).slice(0, 900));
