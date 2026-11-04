// SEO技術面の測定（読み取り専用・dist を読むだけ。2026-11-04）
// title / meta description の重複・長さ・型の使い回し、似通う説明文、薄いページ、canonical/構造化データ/noindex。
// 使い方: node scripts/seoTechMeasure.mjs [--json out.json]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));

const pages = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '_astro' && e.name !== 'images' && e.name !== 'data') walk(p); }
    else if (e.name === 'index.html' || (e.name.endsWith('.html') && dir === dist)) pages.push(p);
  }
};
walk(dist);

const dec = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const rows = pages.map((f) => {
  const h = fs.readFileSync(f, 'utf8');
  const rel = '/' + path.relative(dist, f).replace(/index\.html$/, '');
  const title = dec(h.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
  const desc = dec(h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '').trim();
  const canon = h.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '';
  const robots = h.match(/<meta name="robots" content="([^"]+)"/)?.[1] ?? '';
  const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  let ldOk = 0, ldBad = 0;
  for (const m of ld) { try { JSON.parse(m[1]); ldOk++; } catch { ldBad++; } }
  const h1 = (h.match(/<h1\b/g) || []).length;
  return { rel, title, desc, canon, robots, ldOk, ldBad, h1 };
});

const out = {};
const isDest = (r) => r.rel.startsWith('/destinations/') && r.rel !== '/destinations/';
const L = (s) => [...s].length;
const stat = (name, arr) => { out[name] = arr.length; console.log(`${name}: ${arr.length}件`); };

console.log(`HTMLページ ${rows.length} 枚（旅先 ${rows.filter(isDest).length}）`);
// 重複
const dup = (key) => { const m = new Map(); for (const r of rows) { if (!r[key]) continue; (m.get(r[key]) ?? m.set(r[key], []).get(r[key])).push(r.rel); } return [...m.entries()].filter(([, v]) => v.length > 1); };
const dt = dup('title'), dd = dup('desc');
stat('title が他ページと重複するページ数', dt.flatMap(([, v]) => v));
stat('description が他ページと重複するページ数', dd.flatMap(([, v]) => v));
if (dt.length) console.log('  title重複例:', dt.slice(0, 5).map(([k, v]) => `${k} ×${v.length}`).join(' / '));
if (dd.length) console.log('  desc重複例:', dd.slice(0, 5).map(([k, v]) => `${k.slice(0, 40)}… ×${v.length}`).join(' / '));
// 長さ
const hist = (arr, edges) => edges.map((e, i) => `${i ? edges[i - 1] : 0}-${e}:${arr.filter((x) => x > (i ? edges[i - 1] : -1) && x <= e).length}`).join(' ') + ` ${edges.at(-1)}超:${arr.filter((x) => x > edges.at(-1)).length}`;
const tl = rows.map((r) => L(r.title)), dl = rows.map((r) => L(r.desc));
console.log('titleの文字数分布 ', hist(tl, [10, 20, 30, 40, 50, 60]));
console.log('descriptionの文字数分布 ', hist(dl, [40, 70, 100, 120, 140, 160, 200]));
stat('titleなし', rows.filter((r) => !r.title));
stat('descriptionなし', rows.filter((r) => !r.desc));
stat('title が短い(<12字)', rows.filter((r) => r.title && L(r.title) < 12));
stat('title が長い(>40字)', rows.filter((r) => L(r.title) > 40));
stat('description が短い(<50字)', rows.filter((r) => r.desc && L(r.desc) < 50));
stat('description が長い(>120字・スマホで切れやすい)', rows.filter((r) => L(r.desc) > 120));
stat('description が非常に長い(>160字)', rows.filter((r) => L(r.desc) > 160));
// 型の使い回し: 旅先名を {名} に置換して比較
const tpl = (r) => { const d = byId.get(decodeURIComponent(r.rel.split('/')[2] ?? '')); const nm = d?.name; let t = r.title, s = r.desc; if (nm) { t = t.split(nm).join('{名}'); s = s.split(nm).join('{名}'); } if (d?.prefecture) { t = t.split(d.prefecture).join('{県}'); s = s.split(d.prefecture).join('{県}'); } return { t, s }; };
const dr = rows.filter(isDest).map((r) => ({ r, ...tpl(r) }));
const tc = new Map(); for (const x of dr) tc.set(x.t, (tc.get(x.t) ?? 0) + 1);
console.log(`旅先titleの型: ${tc.size}種類`); for (const [k, v] of [...tc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`   ${v}件  ${k}`);
const sc = new Map(); for (const x of dr) sc.set(x.s, (sc.get(x.s) ?? 0) + 1);
console.log(`旅先descriptionの型(名前置換後に完全一致): ${sc.size}種類 / 旅先${dr.length}件`);
// 先頭30字の一致
const head = new Map(); for (const x of dr) { const k = x.s.slice(0, 30); head.set(k, (head.get(k) ?? 0) + 1); }
console.log(`旅先descriptionの先頭30字が同じ型で2件以上: ${[...head.values()].filter((v) => v > 1).reduce((a, b) => a + b, 0)}件`);
for (const [k, v] of [...head.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`   ${v}件  ${k}`);
// canonical / robots / 構造化データ
stat('canonical なし', rows.filter((r) => !r.canon));
stat('canonical が自分自身でない', rows.filter((r) => r.canon && decodeURI(new URL(r.canon).pathname) !== decodeURI(r.rel) && !r.rel.endsWith('404.html')));
stat('noindex を含むページ', rows.filter((r) => /noindex/i.test(r.robots)));
stat('JSON-LDが壊れているページ', rows.filter((r) => r.ldBad));
stat('JSON-LDなしの旅先ページ', rows.filter((r) => isDest(r) && !r.ldOk));
stat('h1が1つでないページ', rows.filter((r) => r.h1 !== 1 && !r.rel.endsWith('404.html')));

// 説明文(description フィールド)の類似度: 文字3-gram の Jaccard
const grams = (s) => { const set = new Set(); const t = s.replace(/\s/g, ''); for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3)); return set; };
const items = dests.map((d) => ({ id: d.id, name: d.name, g: grams(String(d.description ?? '').split(d.name).join('')) }));
const pairs = [];
for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
  const a = items[i].g, b = items[j].g; if (!a.size || !b.size) continue;
  let inter = 0; const [s, l] = a.size < b.size ? [a, b] : [b, a]; for (const x of s) if (l.has(x)) inter++;
  const jac = inter / (a.size + b.size - inter); if (jac >= 0.5) pairs.push([jac, items[i].id, items[j].id]);
}
pairs.sort((x, y) => y[0] - x[0]);
const involved = new Set(pairs.flatMap((p) => [p[1], p[2]]));
console.log(`旅先説明文(description)の類似: 3-gram Jaccard≥0.5 の組 ${pairs.length}、関わるページ ${involved.size}`);
for (const p of pairs.slice(0, 5)) console.log(`   ${p[0].toFixed(2)}  ${p[1]} ⇔ ${p[2]}`);
out.simPairs = pairs.length; out.simPages = involved.size;
// 薄いページ
const noHero = (d) => !(d.images?.length) ;
const thin = dests.filter((d) => {
  const hasHero = fs.existsSync(path.join(root, 'public/images', d.id, 'main.jpg'));
  const spots = (d.spots ?? []).length;
  return (!hasHero && spots <= 2) || String(d.description ?? '').length < 60;
});
console.log(`薄い候補(ヒーロー画像なし かつ spots≤2、または説明文<60字): ${thin.length}件`);
const nh = dests.filter((d) => !fs.existsSync(path.join(root, 'public/images', d.id, 'main.jpg')));
console.log(`ヒーロー画像なし: ${nh.length}件 / spots 0件: ${dests.filter((d) => !(d.spots ?? []).length).length}件 / spots≤2: ${dests.filter((d) => (d.spots ?? []).length <= 2).length}件`);
const dlen = dests.map((d) => String(d.description ?? '').length).sort((a, b) => a - b);
console.log(`説明文の長さ 最小${dlen[0]} 中央値${dlen[dlen.length >> 1]} 最大${dlen.at(-1)}`);
for (const d of thin.slice(0, 8)) console.log(`   ${d.id} spots=${(d.spots ?? []).length} desc=${String(d.description ?? '').length}字`);
out.thin = thin.map((d) => d.id);
if (process.argv.includes('--json')) fs.writeFileSync(process.argv[process.argv.indexOf('--json') + 1], JSON.stringify({ out, titleDup: dt, descDup: dd, pairs: pairs.slice(0, 100) }, null, 1));
