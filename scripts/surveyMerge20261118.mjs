#!/usr/bin/env node
/**
 * surveyMerge20261118.mjs — 近い旅先ページを統合する案のための実測（2026-11-18）。読み取りのみ。サイトのファイルは変えない。
 *   入力: src/data/destinations.json・src/data/articles/*.json・dist（先に npm run build）・logs/gsc/inspect_2026-11-17.jsonl・logs/merge_20261118/gsc_*.json（scripts/gscPageQuery.mjs）
 *   出力: logs/merge_20261118/pages.json（旅先ごとの実測）・clusters_<しきい値>km.json（自動の集まり）・islands.json（島の手リスト）・summary.json
 * usage: node scripts/surveyMerge20261118.mjs
 */
import fs from 'fs';
import path from 'path';
const OUT = 'logs/merge_20261118';
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dests = J('src/data/destinations.json');
const byId = new Map(dests.map((d) => [d.id, d]));
const merged = J('scripts/data/mergedPages.json').pairs;
const enc = (s) => encodeURIComponent(s);
const idOfUrl = (u) => { const m = u.match(/\/destinations\/([^/]+)\//); return m ? decodeURIComponent(m[1]) : null; };

// ---- sitemap の lastmod
const sm = fs.readFileSync('dist/sitemap.xml', 'utf8'); const lastmod = new Map();
for (const m of sm.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) { const id = idOfUrl(m[1]); if (id) lastmod.set(id, m[2]); }

// ---- 内部リンク（dist の全HTML。診断 /quiz/ ・転送ページ自身は元に数えない）
const stubIds = new Set([...merged.map((p) => p.from), 'kumano']);
const inFrom = new Map(), inFromDest = new Map(), outTo = new Map();
const walk = (d, out = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (['dist/_astro', 'dist/images', 'dist/quiz'].includes(p)) continue; walk(p, out); } else if (e.name.endsWith('.html')) out.push(p); } return out; };
for (const f of walk('dist')) {
  const rel = path.relative('dist', f); const m = rel.match(/^destinations\/([^/]+)\/index\.html$/); const self = m ? decodeURIComponent(m[1]) : null;
  if (self && stubIds.has(self)) continue;
  const t = fs.readFileSync(f, 'utf8'); const seen = new Set();
  for (const x of t.matchAll(/href="\/destinations\/([^/"#?]+)\/"/g)) { const id = decodeURIComponent(x[1]); if (id !== self) seen.add(id); }
  for (const id of seen) { (inFrom.get(id) || inFrom.set(id, new Set()).get(id)).add(rel); if (self) (inFromDest.get(id) || inFromDest.set(id, new Set()).get(id)).add(self); }
  if (self) outTo.set(self, seen.size);
}

// ---- Search Console
const pgAll = J(`${OUT}/gsc_page_累計.json`), pg28 = J(`${OUT}/gsc_page_直近28日.json`), pq28 = J(`${OUT}/gsc_page_query_直近28日.json`), pqAll = J(`${OUT}/gsc_page_query_累計.json`);
const mp = (rows) => { const m = new Map(); for (const r of rows) { const id = idOfUrl(r.page); if (id) m.set(id, r); } return m; };
const gAll = mp(pgAll), g28 = mp(pg28);
const qBy = (rows) => { const m = new Map(); for (const r of rows) { const id = idOfUrl(r.page); if (id) (m.get(id) || m.set(id, []).get(id)).push(r); } return m; };
const qAll = qBy(pqAll), q28 = qBy(pq28);
const insp = new Map(); for (const l of fs.readFileSync('logs/gsc/inspect_2026-11-17.jsonl', 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); const id = idOfUrl(r.url); if (id) insp.set(id, r); }
const STATE = { '送信して登録されました': '登録済み', 'クロール済み - インデックス未登録': 'クロール済み-未登録', '検出 - インデックス未登録': '検出-未登録', 'URL が Google に認識されていません': '未認識' };

// ---- ページごとの実測
const artChars = (id) => { const f = `src/data/articles/${id}.json`; if (!fs.existsSync(f)) return 0; const a = J(f); let n = (a.lead || '').length + (a.tips || '').length + (a.bestSeason || '').length; for (const s of a.sections || []) n += (s.body || '').length; if (a.modelCourse) n += Object.values(a.modelCourse).join('').length; return n; };
const heroOk = (d) => fs.existsSync(`public/images/${d.id}/main.jpg`) || fs.existsSync(`public/images/${d.id}.jpg`) || ((d.images || [])[0] && !String(d.images[0]).startsWith('/images/'));
const nameCount = new Map(); for (const d of dests) nameCount.set(d.name, (nameCount.get(d.name) || 0) + 1);
const ownName = (d, q) => q.includes(d.name) || (d.mainSpot && q.includes(d.mainSpot));
const pages = dests.map((d) => {
  const qs = (q28.get(d.id) || []).sort((a, b) => b.impressions - a.impressions); const qa = (qAll.get(d.id) || []).sort((a, b) => b.impressions - a.impressions);
  const own = qa.filter((r) => ownName(d, r.query));
  const ins = insp.get(d.id);
  return {
    id: d.id, name: d.name, prefecture: d.prefecture, lat: d.lat, lng: d.lng, url: `/destinations/${d.id}/`,
    本文字数: (d.description || '').length + artChars(d.id), 説明の字数: (d.description || '').length, 記事の字数: artChars(d.id),
    見どころ数: (d.spots || []).length, featured_stay: !!d.featured_stay, 画像数: (d.images || []).length, ヒーロー画像なし: !heroOk(d), 同名の重複: nameCount.get(d.name) > 1,
    内部リンク_入る: (inFrom.get(d.id) || new Set()).size, 内部リンク_入る_旅先ページから: (inFromDest.get(d.id) || new Set()).size, 内部リンク_出る: outTo.get(d.id) ?? 0, lastmod: lastmod.get(d.id) || null,
    表示_28日: g28.get(d.id)?.impressions || 0, クリック_28日: g28.get(d.id)?.clicks || 0, 表示_累計: gAll.get(d.id)?.impressions || 0, クリック_累計: gAll.get(d.id)?.clicks || 0,
    順位_累計: gAll.get(d.id)?.position ?? null,
    上位の検索語_28日: qs.slice(0, 3).map((r) => `${r.query}（表示${r.impressions}・ク${r.clicks}）`), 上位の検索語_累計: qa.slice(0, 3).map((r) => `${r.query}（表示${r.impressions}・ク${r.clicks}）`),
    自分の名前の検索語_表示: own.reduce((s, r) => s + r.impressions, 0), 自分の名前の検索語_クリック: own.reduce((s, r) => s + r.clicks, 0),
    インデックス: ins ? STATE[ins.coverageState] || ins.coverageState : '確認できず', 最終クロール: ins?.lastCrawlTime || null, googleCanonical: ins?.googleCanonical && ins.googleCanonical !== `https://tabidokoiko.com/destinations/${enc(d.id)}/` ? ins.googleCanonical : null,
    isIsland: !!d.isIsland || d.destType === 'island',
  };
});
fs.writeFileSync(`${OUT}/pages.json`, JSON.stringify(pages, null, 1));
const P = new Map(pages.map((p) => [p.id, p]));

// ---- 距離
const R = 6371; const rad = (x) => (x * Math.PI) / 180;
const km = (a, b) => { const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

// ---- 自動: 同じ県の中で single linkage（直径の上限つき）
const DIAM = 25;
function autoClusters(T) {
  const groups = [];
  const byPref = new Map(); for (const p of pages) (byPref.get(p.prefecture) || byPref.set(p.prefecture, []).get(p.prefecture)).push(p);
  for (const [pref, list] of byPref) {
    const n = list.length; const cl = list.map((p, i) => ({ m: [i] })); const owner = list.map((_, i) => i);
    const D = (i, j) => km(list[i], list[j]);
    const edges = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const d = D(i, j); if (d <= T) edges.push([d, i, j]); }
    edges.sort((a, b) => a[0] - b[0]);
    for (const [, i, j] of edges) {
      const a = owner[i], b = owner[j]; if (a === b) continue;
      let ok = true; for (const x of cl[a].m) { for (const y of cl[b].m) if (D(x, y) > DIAM) { ok = false; break; } if (!ok) break; }
      if (!ok) continue; for (const y of cl[b].m) owner[y] = a; cl[a].m.push(...cl[b].m); cl[b].m = [];
    }
    for (const c of cl) if (c.m.length >= 2) groups.push({ pref, members: c.m.map((i) => list[i]) });
  }
  return groups;
}
const diam = (ms) => { let d = 0; for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) d = Math.max(d, km(ms[i], ms[j])); return +d.toFixed(1); };
const sumOf = (ms, k) => ms.reduce((s, p) => s + p[k], 0);
const regs = {}; const dist = {};
for (const T of [5, 10, 15]) {
  const gs = autoClusters(T).map((g) => ({ 県: g.pref, 件数: g.members.length, 直径km: diam(g.members), ids: g.members.map((p) => p.id) }));
  gs.sort((a, b) => b.件数 - a.件数);
  const sizes = {}; for (const g of gs) sizes[g.件数] = (sizes[g.件数] || 0) + 1;
  dist[T] = { 集まりの数: gs.length, 含まれるページ数: gs.reduce((s, g) => s + g.件数, 0), 件数の内訳: sizes, 最大件数: gs[0]?.件数 || 0, 最大の直径km: Math.max(...gs.map((g) => g.直径km)), 消えるページ数_全部を1つにすると: gs.reduce((s, g) => s + g.件数 - 1, 0) };
  regs[T] = gs; fs.writeFileSync(`${OUT}/clusters_${T}km.json`, JSON.stringify(gs, null, 1));
}
fs.writeFileSync(`${OUT}/summary.json`, JSON.stringify({ 旅先ページ数: dests.length, しきい値ごと: dist, 条件: `同じ県・single linkage・直径${DIAM}km以内` }, null, 1));
console.log(JSON.stringify(dist, null, 1));
