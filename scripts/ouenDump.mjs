// 応援割データの一覧（読み取りのみ）。node scripts/ouenDump.mjs [slug]
import { SCHEMES } from '../src/data/ouenWari.ts';
const only = process.argv[2];
for (const s of SCHEMES) {
  if (only && s.slug !== only) continue;
  console.log(`\n### ${s.slug} | ${s.pref} | ${s.name} | status=${s.status} start=${s.startsOn ?? '-'} end=${s.endsOn ?? '-'} checked=${s.checked}`);
  console.log(' period:', s.period, '| booking:', s.booking);
  if (s.state) console.log(' state:', s.state);
  if (s.note) console.log(' note:', s.note);
  if (s.applyNote) console.log(' applyNote:', s.applyNote);
  console.log(' official:', s.official.map((o) => `${o.label} ${o.url}`).join(' ; '));
  for (const c of s.channels ?? []) console.log(` ch[${c.name}] ${c.body} (${c.source.label} ${c.source.url} ${c.checked})`);
  for (const f of s.facts ?? []) console.log(` fact[${f.label}] ${f.body} (${f.source.label} ${f.source.url} ${f.checked})`);
  for (const n of s.news ?? []) console.log(` news: ${n.text} (${n.outlet} ${n.date} ${n.url})`);
  const rest = Object.keys(s).filter((k) => !['slug','pref','prefShort','name','parent','period','booking','status','startsOn','endsOn','state','checked','official','note','applyNote','channels','facts','news','seo'].includes(k));
  if (rest.length) console.log(' other keys:', rest.join(','));
}
