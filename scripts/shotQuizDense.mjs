// 点が密な地域の結果画面の写真（2026-11-18）。エンジンで、その旅先が1位になる回答を探し、ブラウザでその回答を流して地図の写真を撮る。
// usage: node scripts/shotQuizDense.mjs <出力フォルダ> [http://127.0.0.1:4399]   先に astro preview を起動しておく
import { chromium } from 'playwright';
import fs from 'fs';
import { prepare, result, QUESTIONS } from '../src/lib/quizEngine.js';
const OUT = process.argv[2]; const BASE = process.argv[3] || 'http://127.0.0.1:4399';
fs.mkdirSync(OUT, { recursive: true });
const P = prepare(JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8')));
const answersFor = (picks) => { const a = {}; QUESTIONS.forEach((q, i) => { a[q.key] = q.options[picks[i]]; }); return a; };
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const TARGETS = [['隠岐の島', 'oki'], ['三朝温泉', 'sanin'], ['別府', 'kyushu'], ['鎌倉', 'kanto'], ['海士町', 'ama']];
const found = [];
for (const [name, tag] of TARGETS) {
  const d = P.find((x) => x.name === name); if (!d) { console.log('旅先なし', name); continue; }
  let picks = null;
  for (let t = 0; t < 400000 && !picks; t++) { const pk = QUESTIONS.map((q) => Math.floor(rnd() * q.options.length)); if (result(P, answersFor(pk)).top.id === d.id) picks = pk; }
  console.log(name, picks ? '回答を見つけた' : '見つからず（1位になる回答が少ない）');
  if (picks) found.push({ name, tag, picks, d });
}
const browser = await chromium.launch();
for (const vp of [{ n: '390', w: 390, h: 844 }, { n: '1280', w: 1280, h: 800 }]) {
  for (const f of found) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2 }); const page = await ctx.newPage();
    await page.goto(BASE + '/quiz/?qa=1', { waitUntil: 'networkidle' }); await page.click('#qz-start');
    for (let i = 0; i < 12; i++) {
      const opts = await page.$$('#qz-opts .qz-opt');
      if (i === 8) await page.locator('#qz-map').screenshot({ path: `${OUT}/mid_${f.tag}_${vp.n}.png` });
      await opts[Math.min(f.picks[i], opts.length - 1)].click(); await page.waitForTimeout(i < 11 ? 900 : 100);
    }
    await page.waitForSelector('#qz-result:not([hidden])'); await page.waitForTimeout(1800);
    const nm = await page.textContent('#qz-r-name');
    await page.locator('#qz-map').screenshot({ path: `${OUT}/result_${f.tag}_${vp.n}.png` });
    await page.screenshot({ path: `${OUT}/result_${f.tag}_${vp.n}_page.png` });
    console.log(vp.n, f.tag, nm);
    await ctx.close();
  }
}
await browser.close();
