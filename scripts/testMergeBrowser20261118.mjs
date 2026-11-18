// 統合ページの手元確認（2026-11-18）。先に astro preview を起動しておく（既定 http://127.0.0.1:4399）。
//   ・統合した5ページ（390・360・1280）: 見出し（h1）が統合後の名前・元の各ページの見出し（h2・id）・節の数・画像の出典・宿のカード・横スクロールなし・エラーなし
//   ・転送ページ12件: アンカー付きで統合ページの該当する見出しへ飛ぶ（URL の # と、その見出しが画面に入っていること）
//   ・診断: 統合後のページ名で結果が出る（390・360・1280）／消えた旅先の結果ページが統合先の結果ページへ転送される（utm を引き継ぐ）
// usage: node scripts/testMergeBrowser20261118.mjs [http://127.0.0.1:4399]
import { chromium } from 'playwright';
import fs from 'fs';
import { prepare, result, QUESTIONS } from '../src/lib/quizEngine.js';
const BASE = process.argv[2] || 'http://127.0.0.1:4399';
const OUT = 'logs/merge_20261118/shots'; fs.mkdirSync(OUT, { recursive: true });
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const before = new Map(J('backup/merge_20261118/destinations.json').map((d) => [d.id, d]));
const after = new Map(J('src/data/destinations.json').map((d) => [d.id, d]));
const pairs = J('scripts/data/mergedPages.json').pairs.filter((p) => p.hash);
const reps = [...new Set(pairs.map((p) => p.to))];
const res = [];
const ok = (name, cond, extra = '') => { res.push({ name, ok: !!cond, extra: String(extra).slice(0, 240) }); console.log((cond ? 'OK  ' : 'NG  ') + name + ' ' + String(extra).slice(0, 160)); };
const browser = await chromium.launch();
const VPS = [{ n: '390', w: 390, h: 844 }, { n: '360', w: 360, h: 740 }, { n: '1280', w: 1280, h: 800 }];
// ---- 統合ページ
for (const vp of VPS) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const rep of reps) {
    const d = after.get(rep); const art = J(`src/data/articles/${rep}.json`); const members = [rep, ...pairs.filter((p) => p.to === rep).map((p) => p.from)];
    await page.goto(`${BASE}/destinations/${rep}/`, { waitUntil: 'networkidle' });
    const tag = `${vp.n} ${d.name}`;
    ok(`${tag} 見出し（h1）が統合後の名前`, (await page.textContent('h1')).trim() === d.name);
    const gs = await page.$$eval('section.merged-group', (es) => es.map((e) => ({ id: e.id, title: e.querySelector('h2')?.textContent.trim(), sections: e.querySelectorAll('.spot-section').length, credits: e.querySelectorAll('.spot-credit').length, imgs: e.querySelectorAll('img').length, stay: e.querySelector('.merged-group-stay')?.textContent || '' })));
    ok(`${tag} 元の各ページが見出し（h2・id=元のid）になっている（${members.length}件）`, gs.length === members.length && members.every((id) => gs.some((g) => g.id === id && g.title === art.groups.find((x) => x.id === id).title)), gs.map((g) => `${g.id}:${g.title}`).join(' / '));
    ok(`${tag} 各見出しの節の数が元のページと同じ`, art.groups.every((g) => gs.find((x) => x.id === g.id)?.sections === g.sections.length), gs.map((g) => `${g.title}:${g.sections}`).join(' '));
    // 画像の出典: 元のページで表示していた出典（attributionRequired≠false）の数
    const wantCred = art.groups.reduce((n, g) => n + (g.image?.credit && (g.image.credit.author || g.image.credit.license) ? 1 : 0) + g.sections.filter((s) => s.imageUrl && s.imageCredit && s.imageCredit.attributionRequired !== false && (s.imageCredit.author || s.imageCredit.license)).length, 0);
    ok(`${tag} 節・見出し画像の出典の数が一致（${wantCred}）`, gs.reduce((n, g) => n + g.credits, 0) === wantCred, gs.map((g) => g.credits).join(','));
    const fsCard = await page.$$eval('.fs-card .fs-name', (es) => es.map((e) => e.textContent.trim()));
    ok(`${tag} おすすめの宿のカードが1軒（${d.featured_stay?.name ?? 'なし'}）`, d.featured_stay ? fsCard.length === 1 && fsCard[0] === d.featured_stay.name : fsCard.length === 0, fsCard.join(','));
    const stays = gs.filter((g) => g.stay).map((g) => g.stay); const wantStays = art.groups.filter((g) => g.stay).length;
    ok(`${tag} カードにしなかった宿は、見出しの下に宿名だけ（${wantStays}件）`, stays.length === wantStays, stays.join(' | '));
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(`${tag} 横スクロールなし`, ov <= 0, '差=' + ov);
    if (rep === 'nishinoshima' || vp.n === '390') { const loc = page.locator('section.merged-group').first(); await loc.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/merged_${rep}_${vp.n}.png` }); }
  }
  ok(`${vp.n} 統合ページ5つ: ブラウザのエラーなし`, errors.length === 0, errors.slice(0, 2).join(' | '));
  await ctx.close();
}
// ---- 転送ページ（アンカー）
for (const vp of [VPS[0], VPS[2]]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } }); const page = await ctx.newPage();
  for (const p of pairs) {
    await page.goto(`${BASE}/destinations/${p.from}/`, { waitUntil: 'load' });
    await page.waitForURL((u) => u.pathname === `/destinations/${p.to}/`, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    const u = new URL(page.url());
    const box = await page.evaluate((id) => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), h: window.innerHeight }; }, p.hash);
    ok(`${vp.n} 転送 ${p.from} → /destinations/${p.to}/#${p.hash}`, u.pathname === `/destinations/${p.to}/` && u.hash === `#${p.hash}`, u.pathname + u.hash);
    ok(`${vp.n} 転送 ${p.from}: その見出しが画面に入っている`, box && box.top >= -5 && box.top < box.h, JSON.stringify(box));
  }
  await ctx.close();
}
// ---- 診断
const P = prepare(J('src/data/quizDestinations.json'));
const answersFor = (picks) => { const a = {}; QUESTIONS.forEach((q, i) => { a[q.key] = q.options[picks[i]]; }); return a; };
let seed = 11; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const found = [];
for (const [name, id] of [['隠岐諸島', 'nishinoshima'], ['慶良間諸島', 'tokashiki-jima'], ['笠岡諸島', 'shiraishijima'], ['人吉', 'hitoyoshi']]) {
  let picks = null; for (let t = 0; t < 400000 && !picks; t++) { const pk = QUESTIONS.map((q) => Math.floor(rnd() * q.options.length)); if (result(P, answersFor(pk)).top.id === id) picks = pk; }
  if (picks) found.push({ name, id, picks }); else ok(`診断で ${name} が1位になる回答が見つかる`, false);
}
for (const vp of VPS) for (const f of found) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
  await page.goto(BASE + '/quiz/?qa=1', { waitUntil: 'networkidle' }); await page.click('#qz-start');
  for (let i = 0; i < 12; i++) { const opts = await page.$$('#qz-opts .qz-opt'); await opts[Math.min(f.picks[i], opts.length - 1)].click(); await page.waitForTimeout(i < 11 ? 700 : 100); }
  await page.waitForSelector('#qz-result:not([hidden])'); await page.waitForTimeout(1500);
  const nm = (await page.textContent('#qz-r-name')).trim(); const link = await page.getAttribute('#qz-r-link', 'href');
  ok(`${vp.n} 診断の結果が統合後のページ名で出る: ${f.name}`, nm === f.name && link === `/destinations/${f.id}/`, `${nm} ${link}`);
  if (f.name === '隠岐諸島') await page.screenshot({ path: `${OUT}/quiz_${f.id}_${vp.n}.png` });
  await ctx.close();
}
{ // 消えた旅先の結果ページ → 統合先の結果ページ（utm を引き継ぐ）
  const moved = J('src/data/quizMovedCodes.json'); const ctx = await browser.newContext(); const page = await ctx.newPage(); let allOk = true; const bad = [];
  for (const [old, m] of Object.entries(moved)) {
    await page.goto(`${BASE}/quiz/r/${old}/?utm_source=x&utm_content=${old}`, { waitUntil: 'load' });
    await page.waitForURL((u) => u.pathname === `/quiz/r/${m.to}/`, { timeout: 8000 }).catch(() => {});
    const u = new URL(page.url()); if (u.pathname !== `/quiz/r/${m.to}/` || u.searchParams.get('utm_source') !== 'x') { allOk = false; bad.push(old); }
  }
  ok(`消えた旅先の結果ページ ${Object.keys(moved).length}件が、統合先の結果ページへ転送される（utm を引き継ぐ）`, allOk, bad.join(','));
  await ctx.close();
}
await browser.close();
const ng = res.filter((r) => !r.ok); fs.writeFileSync('logs/merge_20261118/browser_result.json', JSON.stringify({ 項目: res.length, NG: ng.length, 結果: res }, null, 1));
console.log(`\n確認 ${res.length}項目 / NG ${ng.length}`); process.exit(ng.length ? 1 : 0);
