#!/usr/bin/env node
/**
 * auditLocalityOfReplaced.mjs — 差し替えた画像が「県」だけでなく「その場所の語」でも裏が取れているかを見る（2026-10-13）。
 * commonsPlaceCheck は県名が出れば ok にするので、同じ県の別の場所（例: 益田市の滝に松江の庭園）を通してしまう。
 * 旅先名・主な見どころ・スポット名・追加の手がかり語のどれかが Commons のカテゴリ／説明文に出る(hitsLocal)かを数える。
 * usage: node scripts/auditLocalityOfReplaced.mjs logs/replace_*.json [--extra logs/dest_image_extra_*.json]
 */
import fs from 'fs';
import { placeCheck } from './commonsPlaceCheck.mjs';
const args = process.argv.slice(2);
const exI = args.indexOf('--extra');
const EXTRA = exI >= 0 ? JSON.parse(fs.readFileSync(args[exI + 1], 'utf8')) : {};
const files = args.filter((a, i) => !a.startsWith('--') && i !== exI + 1);
const dests = new Map(JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')).map((d) => [d.id, d]));
const out = [];
for (const f of files) for (const a of JSON.parse(fs.readFileSync(f, 'utf8')).adopted || []) {
  const d = dests.get(a.id);
  if (!d || d.imageCredit?.url !== a.credit.url) continue;               // 既に外した・別の出典に替わったものは対象外
  const words = [d.name, d.mainSpot, ...(d.spots || []).filter((s) => s && typeof s === 'object').map((s) => s.name), ...(EXTRA[a.id]?.words || [])].filter(Boolean);
  const r = await placeCheck(a.file, d.prefecture, words);
  out.push({ id: a.id, name: d.name, file: a.file, hitsLocal: r.hitsLocal, verdict: r.verdict, cats: r.cats.slice(0, 4), desc: r.desc.slice(0, 80) });
  await new Promise((r2) => setTimeout(r2, 250));
}
const weak = out.filter((x) => !x.hitsLocal);
console.log(`対象 ${out.length}件 / 場所の語でも一致 ${out.length - weak.length}件 / 県だけの一致 ${weak.length}件`);
for (const x of weak) console.log(`  ${x.id.padEnd(22)} ${x.name.slice(0, 10).padEnd(11)} ${x.file.slice(5, 60)}  | ${x.cats.join(',').slice(0, 60)}`);
fs.writeFileSync('logs/replaced_locality_audit.json', JSON.stringify(out, null, 1));
