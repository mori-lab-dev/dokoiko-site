#!/usr/bin/env node
/**
 * mergePilot20261118.mjs — 近い旅先ページの統合（パイロット5地域・17ページ→5ページ）（2026-11-18）。
 *   隠岐諸島（西ノ島のURLを残す）・慶良間諸島・笠岡諸島・小笠原諸島・人吉。調査と判断: logs/merge_20261118/。
 * 方針（事実は足さない・減らさない）:
 *   ・元の各ページを、統合ページの見出し（h2・id=元のページid）にして引き継ぐ。article.groups に、元の文を一字も変えずに入れる
 *     （lead・description・article の各節（title/body/info/imageAlt）・記事の無いページは spots の説明を節に・modelCourse・tips・bestSeason・見出しの画像と出典）。
 *   ・統合ページの description は、見出しの名前を並べた1文だけ（元の description は各見出しの下に残る）。
 *   ・spots は、同じ場所（別名を含む）を1つにまとめる。説明は、残す側の文に、重なる側の文のうち残す側に含まれない文（原文のまま）を足す。
 *   ・featured_stay は1軒だけ（代表が持っていればその宿。無ければ、順番の早い元ページの宿）。ほかの宿は、見出しの下に宿名だけ書く。
 *   ・travelTime は、推定（travelTimeEstimated）の値を消し、残った値だけ。残らなければ消して travelTimeRemoved: true（嵐山と同じ扱い）。
 *   ・座標・hub・宿の検索語などは代表の値。tags・stayAllowed・departures・gateways は和集合。
 * 元のURL: src/pages/destinations/<id>.astro（MovedPage・toHash=元のid）。scripts/data/mergedPages.json に組と hash を足す。
 * 診断: 消える旅先の結果ページは、統合先の結果ページへの転送（src/data/quizMovedCodes.json）。
 * 戻し方: backup/merge_20261118/（変更前の destinations.json・記事・設定・共有画像）。
 * usage: node scripts/mergePilot20261118.mjs [--dry]
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
const DRY = process.argv.includes('--dry');
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const W = (p, o) => { if (!DRY) fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); };
const code = (id) => crypto.createHash('sha1').update(id).digest('hex').slice(0, 8);
const TODAY = '2026-11-18';

const PILOT = [
  { key: '隠岐諸島', name: '隠岐諸島', rep: 'nishinoshima', order: ['nishinoshima', 'kuniga', 'ama-island', 'nakanoshima-oki', 'oki-island'], titles: { 'nishinoshima': '西ノ島', 'kuniga': '国賀海岸', 'ama-island': '海士町', 'nakanoshima-oki': '中ノ島', 'oki-island': '隠岐の島' } },
  { key: '慶良間諸島', name: '慶良間諸島', rep: 'tokashiki-jima', order: ['tokashiki-jima', 'aharen', 'zamami-island', 'aka-island'], titles: { 'tokashiki-jima': '渡嘉敷島', 'aharen': '阿波連ビーチ', 'zamami-island': '座間味島', 'aka-island': '阿嘉島' } },
  { key: '笠岡諸島', name: '笠岡諸島', rep: 'shiraishijima', order: ['shiraishijima', 'manabeshima', 'kasaoka-islands'], titles: { 'shiraishijima': '白石島', 'manabeshima': '真鍋島', 'kasaoka-islands': '笠岡諸島（全体）' } },
  { key: '小笠原諸島', name: '小笠原諸島', rep: 'chichijima', order: ['chichijima', 'hahajima'], titles: { 'chichijima': '父島', 'hahajima': '母島' } },
  { key: '人吉', name: '人吉', rep: 'hitoyoshi', order: ['hitoyoshi', 'hitoyoshi-city', 'hitoyoshi-onsen'], titles: { 'hitoyoshi': '人吉', 'hitoyoshi-city': '人吉・球磨', 'hitoyoshi-onsen': '人吉温泉' } },
];
// 同じ場所の別名（spots を1つにまとめるときの照合用）
const ALIAS = { '西ノ島焼火神社': '焼火神社', '人吉城': '人吉城跡', '球磨川くだり': '球磨川下り' };
const norm = (n) => ALIAS[n] || n;

const dests = J('src/data/destinations.json');
const get = (id) => { const d = dests.find((x) => x.id === id); if (!d) throw new Error('id なし ' + id); return d; };
const artOf = (id) => { const f = `src/data/articles/${id}.json`; return fs.existsSync(f) ? J(f) : null; };
const sentences = (t) => (String(t || '').match(/[^。]+。?/g) || []).map((x) => x.trim()).filter(Boolean);
const union = (...arrs) => [...new Set(arrs.flat().filter((x) => x !== undefined && x !== null))];
const STAY_ORDER = ['daytrip', '1night', '2night', '3night+'];

const B = 'backup/merge_20261118';
const log = []; const removed = []; const movedCodes = {}; const pairs = [];
const outDests = new Map(); const dropIds = new Set();

for (const G of PILOT) {
  const rep = structuredClone(get(G.rep)); const srcs = G.order.map((id) => ({ id, d: get(id), a: artOf(id) }));
  const names = G.order.map((id) => G.titles[id]);
  // ---- groups
  const groups = srcs.map(({ id, d, a }) => {
    const sections = a
      ? a.sections.map((s) => {
          const m = (d.spots || []).find((sp) => typeof sp === 'object' && sp.name && ((s.title || '').includes(sp.name) || sp.name.includes(s.title || '')));
          const o = { title: s.title, body: s.body }; if (s.info) o.info = s.info; if (s.imageAlt) o.imageAlt = s.imageAlt;
          if (m?.imageUrl) { o.imageUrl = m.imageUrl; if (m.imageCredit) o.imageCredit = m.imageCredit; }
          return o;
        })
      : (d.spots || []).map((sp) => { const o = { title: sp.name, body: sp.description || '' }; if (sp.imageUrl) { o.imageUrl = sp.imageUrl; if (sp.imageCredit) o.imageCredit = sp.imageCredit; } return o; });
    const g = { id, title: G.titles[id], description: d.description, sections };
    if (a?.lead) g.lead = a.lead;
    if (id !== G.rep && (d.images || [])[0]) { g.image = { url: d.images[0], alt: d.mainSpot ? `${G.titles[id]}の${d.mainSpot}` : `${G.titles[id]}の風景` }; if (d.imageCredit && (d.imageCredit.author || d.imageCredit.license)) g.image.credit = d.imageCredit; }
    if (a?.modelCourse) g.modelCourse = a.modelCourse;
    if (a?.tips) g.tips = a.tips;
    if (a?.bestSeason) g.bestSeason = a.bestSeason;
    return g;
  });
  // ---- 宿: 1軒だけ残す
  const keepSrc = srcs.find((s) => s.d.featured_stay && (s.id === G.rep)) || srcs.find((s) => s.d.featured_stay);
  const keepName = keepSrc?.d.featured_stay?.name;
  for (const g of groups) { const fs_ = get(g.id).featured_stay; if (fs_ && fs_.name !== keepName) g.stay = { name: fs_.name }; }
  if (keepSrc) rep.featured_stay = keepSrc.d.featured_stay; else delete rep.featured_stay;
  // ---- spots（同じ場所を1つに）
  const merged = []; const byKey = new Map();
  for (const { id, d } of srcs) for (const sp of (d.spots || [])) {
    const key = norm(sp.name);
    const prev = byKey.get(key);
    if (!prev) { const c = structuredClone(sp); c._src = id; byKey.set(key, c); merged.push(c); log.push({ 地域: G.key, 種別: 'spot', 元: `${id}:${sp.name}`, 扱い: '引き継ぐ' }); continue; }
    // 同名で別の場所（渡嘉敷島の展望台と阿嘉島の展望台）は別の spot にする
    if (prev._src && prev._src !== id && sp.name === prev.name && key === '展望台') { const c = structuredClone(sp); c._src = id; byKey.set(key + '|' + id, c); merged.push(c); log.push({ 地域: G.key, 種別: 'spot', 元: `${id}:${sp.name}`, 扱い: '別の場所なので別に引き継ぐ' }); continue; }
    const have = sentences(prev.description); const add = sentences(sp.description).filter((s) => !have.some((h) => h === s || h.includes(s.replace(/。$/, ''))));
    if (add.length) prev.description = (prev.description || '') + add.join('');
    if (!prev.imageUrl && sp.imageUrl) { prev.imageUrl = sp.imageUrl; if (sp.imageCredit) prev.imageCredit = sp.imageCredit; }
    log.push({ 地域: G.key, 種別: 'spot', 元: `${id}:${sp.name}`, 扱い: `同じ場所（${prev.name}）に統合`, 足した文: add });
  }
  for (const s of merged) delete s._src;
  // 展望台だけは出どころで分ける（上の特例のため、_src を最初の登録時にも付ける）
  rep.spots = merged;
  // ---- 基本項目
  rep.name = G.name;
  rep.description = `${rep.prefecture}の${names.join('・')}の${names.length}か所を、ひとつのページにまとめた。見出しごとに、元のページの紹介・見どころ・おすすめの宿を、そのまま載せている。`;   // 見出しの名前と、ページの作りだけを書く（新しい事実は書かない）。元の description は各見出しの下に残る
  delete rep.seo;
  rep.tags = union(...srcs.map((s) => s.d.tags || []));
  rep.stayAllowed = STAY_ORDER.filter((x) => srcs.some((s) => (s.d.stayAllowed || []).includes(x)));
  rep.departures = union(...srcs.map((s) => s.d.departures || []));
  if (rep.gateways) { const gw = {}; for (const k of Object.keys(rep.gateways)) gw[k] = union(...srcs.map((s) => (s.d.gateways || {})[k] || [])); rep.gateways = gw; }
  rep.images = union(...srcs.map((s) => s.d.images || []));
  // travelTime: 推定の値は書かない
  if (rep.travelTime) { const est = rep.travelTimeEstimated || {}; const tt = {}; for (const [k, v] of Object.entries(rep.travelTime)) if (!est[k]) tt[k] = v; if (Object.keys(tt).length) rep.travelTime = tt; else { delete rep.travelTime; rep.travelTimeRemoved = true; } delete rep.travelTimeEstimated; if (rep.travelTimeOriginal) { for (const k of Object.keys(rep.travelTimeOriginal)) if (!(rep.travelTime && k in rep.travelTime)) delete rep.travelTimeOriginal[k]; if (!Object.keys(rep.travelTimeOriginal).length) delete rep.travelTimeOriginal; } log.push({ 地域: G.key, 種別: 'travelTime', 元: G.rep, 扱い: Object.keys(tt).length ? `推定でない値 ${Object.keys(tt).length}件だけ残した` : '残る値がないので消した（travelTimeRemoved）' }); }
  outDests.set(G.rep, rep);
  // ---- 記事（代表）
  const art = { groups };
  if (!DRY) { fs.mkdirSync(B + '/articles', { recursive: true }); }
  W(`src/data/articles/${G.rep}.json`, art);
  // ---- 消えるページ
  for (const { id, d } of srcs) if (id !== G.rep) {
    dropIds.add(id); removed.push({ id, name: d.name, to: G.rep, hash: id, code: code(id), toCode: code(G.rep) });
    movedCodes[code(id)] = { from: id, to: code(G.rep) }; pairs.push({ from: id, to: G.rep, hash: id, date: TODAY });
    if (!DRY) { if (fs.existsSync(`src/data/articles/${id}.json`)) fs.unlinkSync(`src/data/articles/${id}.json`); }
    const stub = `// /destinations/${id}/ の転送ページ。近い場所の「${d.name}」を /destinations/${G.rep}/ の見出し「${G.titles[id]}」に統合した（${TODAY}）。作りは src/layouts/MovedPage.astro を参照。\nimport MovedPage from '../../layouts/MovedPage.astro';\n---\n<MovedPage fromName="${d.name}" toId="${G.rep}" toName="${G.name}" toHash="${id}" />\n`;
    if (!DRY) fs.writeFileSync(`src/pages/destinations/${id}.astro`, '---\n' + stub);
  }
}
// ---- destinations.json
const next = dests.filter((d) => !dropIds.has(d.id)).map((d) => outDests.get(d.id) || d);
W('src/data/destinations.json', next);
// ---- lastmod
{ const lm = J('src/data/lastmod.json'); for (const id of dropIds) delete lm.destinations[id]; for (const id of outDests.keys()) lm.destinations[id] = TODAY; W('src/data/lastmod.json', lm); }
// ---- mergedPages
{ const mp = J('scripts/data/mergedPages.json'); mp.note = mp.note.replace('検査は', '近い場所の統合（hash あり・2026-11-18）は、転送先の見出し（id=hash）のアンカーへ飛ばす。検査は'); const have = new Set(mp.pairs.map((p) => p.from)); for (const p of pairs) if (!have.has(p.from)) mp.pairs.push(p); W('scripts/data/mergedPages.json', mp); }
// ---- 診断の転送
{ const f = 'src/data/quizMovedCodes.json'; const cur = fs.existsSync(f) ? J(f) : {}; W(f, { ...cur, ...movedCodes }); }
// ---- 共有画像（消える分は、backup に退避して外す。manifest は build 後に別のスクリプトで更新する）
if (!DRY) { fs.mkdirSync(B + '/og', { recursive: true }); for (const r of removed) { const f = `public/quiz/og/${r.code}.png`; if (fs.existsSync(f)) { fs.copyFileSync(f, `${B}/og/${r.code}.png`); fs.unlinkSync(f); } } }
if (!DRY) fs.writeFileSync('logs/merge_20261118/merge_log.json', JSON.stringify({ 消えるページ: removed, 対応: log }, null, 1));
console.log(DRY ? 'dry' : '完了', `消えるページ ${removed.length} / 残る ${PILOT.length} / destinations ${dests.length}→${next.length}`);
