// 診断の手元確認（2026-11-17 / 2026-11-18 に地図・結果ページ・動きの確認を足した）。
// ビルド済みの /quiz/ をブラウザで動かして確かめる。先に astro preview を起動しておく（既定 http://127.0.0.1:4399）。
//   usage: node scripts/testQuizBrowser.mjs [http://127.0.0.1:4399]
import { chromium } from 'playwright';
import fs from 'fs';
import { prepare, filterPool, remainingCount, result, QUESTIONS, SCORE_QUESTIONS } from '../src/lib/quizEngine.js';
import { aliveFlags } from '../src/lib/quizAlive.js';

const BASE = process.argv[2] || 'http://127.0.0.1:4399';
const OUT = 'logs/quiz_20261117';
const DATA = JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8'));
const P = prepare(DATA);
const res = [];
const ok = (name, cond, extra = '') => { res.push({ name, ok: !!cond, extra: String(extra).slice(0, 300) }); console.log((cond ? 'OK  ' : 'NG  ') + name + ' ' + String(extra).slice(0, 200)); };
const fmt = (n) => n.toLocaleString('ja-JP');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 回答の組（選択肢の番号）。代表の3通り
const SETS = {
  A: [1, 6, 0, 2, 0, 0, 0, 1, 0, 1, 0, 1],      // 1泊・どこでも・温泉…
  B: [0, 3, 2, 4, 1, 1, 1, 2, 1, 0, 1, 0],      // 日帰り・関西…
  C: [2, 5, 5, 0, 0, 2, 2, 0, 2, 2, 2, 2],      // 2泊以上・九州沖縄…
};
const answersFor = (picks, upto = 12) => { const a = {}; for (let i = 0; i < upto; i++) a[QUESTIONS[i].key] = QUESTIONS[i].options[Math.min(picks[i], QUESTIONS[i].options.length - 1)]; return a; };
const expectLeft = (a) => {
  if (a.stay == null) return P.length;
  if (a.area == null) return P.filter((d) => filterPool([d], a.stay, 'どこでもよい').length).length;
  const s = {}; for (const q of SCORE_QUESTIONS) if (a[q.key] != null) s[q.key] = a[q.key];
  return remainingCount(filterPool(P, a.stay, a.area), s);
};

const browser = await chromium.launch();

async function runFlow(page, picks, vp, { shots = false, check = true, label = '' } = {}) {
  const tag = `${vp.n}${label}`;
  const readLeft = async () => Number((await page.textContent('#qz-left')).replace(/,/g, ''));
  const lefts = []; let allSame = true, codesOk = true, codeNote = '';
  await page.click('#qz-start');
  for (let i = 0; i < 12; i++) {
    const opts = await page.$$('#qz-opts .qz-opt');
    const idx = Math.min(picks[i], opts.length - 1);
    if (i === 0) {
      const q = await page.textContent('#qz-q'); const st = await page.textContent('#qz-step');
      ok(`${tag} 質問1の見出し・ステップ`, q.includes('旅の長さ') && st.includes('1 / 12'), `${q} / ${st}`);
      ok(`${tag} 選択肢が大きなカード（アイコンつき・高さ44px以上）`, (await page.$$eval('#qz-opts .qz-opt', (bs) => bs.every((b) => b.querySelector('svg') && b.getBoundingClientRect().height >= 44))));
    }
    if (shots && i === 2) await page.screenshot({ path: `${OUT}/shot_${vp.n}_2_question_theme.png` });
    if (shots && i === 6) await page.screenshot({ path: `${OUT}/shot_${vp.n}_2_question_mid.png` });
    await opts[idx].click();
    const a = answersFor(picks, i + 1);
    if (i < 11) {
      await sleep(vp.reduced ? 150 : 1000);                      // カウントダウン・フェードが終わるのを待つ
      const left = await readLeft(); lefts.push(left);
      if (check) {
        const exp = expectLeft(a);
        if (left !== exp) { allSame = false; codeNote += ` Q${i + 1}:画面${left}≠エンジン${exp}`; }
        const alive = await page.getAttribute('#qz-map', 'data-codes');
        const flags = aliveFlags(P, a); const expCodes = P.filter((d, k) => flags[k]).map((d) => d.code);
        const got = (alive || '').split(',').filter(Boolean);
        if (got.length !== expCodes.length || got.some((c, k) => c !== expCodes[k])) { codesOk = false; codeNote += ` Q${i + 1}:地図の残り${got.length}≠${expCodes.length}`; }
        if (got.length !== left && i >= 1) { codesOk = false; codeNote += ` Q${i + 1}:地図${got.length}と数${left}`; }
      }
      await sleep(vp.reduced ? 100 : 0);
    }
  }
  await page.waitForSelector('#qz-result:not([hidden])');
  return { lefts, allSame, codesOk, codeNote };
}

for (const vp of [{ n: 'phone390', w: 390, h: 844 }, { n: 'phone360', w: 360, h: 740 }, { n: 'pc1280', w: 1280, h: 800 }, { n: 'phone390-reduced', w: 390, h: 844, reduced: true }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, reducedMotion: vp.reduced ? 'reduce' : 'no-preference', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = []; const reqs = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => reqs.push(r.method() + ' ' + r.url()));
  await page.addInitScript(() => { window.dataLayer = []; });
  await page.goto(BASE + '/quiz/?qa=1', { waitUntil: 'networkidle' });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(`${vp.n} 開始画面 横スクロールなし`, (await overflow()) <= 0, '差=' + (await overflow()));
  // 地図: canvas に点が描かれている（墨色の点が多数）
  const px = await page.evaluate(() => { const c = document.getElementById('qz-map'); const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0, land = 0; for (let i = 0; i < x.length; i += 4) { if (x[i] < 80 && x[i + 1] < 80 && x[i + 2] < 80 && x[i + 3] > 100) ink++; if (Math.abs(x[i] - 233) < 6 && Math.abs(x[i + 1] - 223) < 6 && x[i + 3] > 200) land++; } return { ink, land, w: c.width, h: c.height }; });
  ok(`${vp.n} 地図に輪郭と墨色の点が描かれている`, px.ink > 500 && px.land > 5000, JSON.stringify(px));
  ok(`${vp.n} 開始画面の「のこり」= 旅先の数`, Number((await page.textContent('#qz-left')).replace(/,/g, '')) === P.length, await page.textContent('#qz-left'));
  await page.screenshot({ path: `${OUT}/shot_${vp.n}_1_intro.png` });

  const flow = await runFlow(page, SETS.A, vp, { shots: true });
  ok(`${vp.n} 最後まで答えると結果が出る`, true);
  ok(`${vp.n} 「のこり」の数が、各質問のあとエンジンの値と一致`, flow.allSame, flow.lefts.join('→') + flow.codeNote);
  ok(`${vp.n} 地図の残りの点が、エンジンの残りの旅先と一致（薄くなった点は外れた旅先）`, flow.codesOk, flow.codeNote);
  ok(`${vp.n} 「のこり」が減っていく`, flow.lefts.every((v, i) => i === 0 || v <= flow.lefts[i - 1]) && flow.lefts[flow.lefts.length - 1] < flow.lefts[0], flow.lefts.join('→'));
  await sleep(vp.reduced ? 200 : 1500);
  const expA = result(P, answersFor(SETS.A));
  const name = await page.textContent('#qz-r-name'); const pref = await page.textContent('#qz-r-pref');
  ok(`${vp.n} 結果の旅先がエンジンの結果と同じ`, name === expA.top.name && pref === expA.top.prefecture, `${name}(${pref})`);
  const nexts = await page.$$eval('#qz-r-next a', (as) => as.map((a) => ({ h: a.getAttribute('href'), t: a.textContent })));
  ok(`${vp.n} 次点が3つ（エンジンと同じ順）`, nexts.length === 3 && nexts.every((n, i) => n.t.includes(expA.next[i].name)), nexts.map((n) => n.t).join(' / '));
  ok(`${vp.n} 結果の文言「回答の傾向から選んだ1つ。ほかの候補もどうぞ」`, (await page.textContent('#qz-result')).includes('回答の傾向から選んだ1つ。ほかの候補もどうぞ'));
  const winText = await page.textContent('#qz-r-win'); const winShown = await page.$eval('#qz-r-win', (e) => !e.hidden);
  ok(`${vp.n} 「この診断の1万通りの回答のうち、◯通りで1位になる旅先」（実測のwin。0なら出さない）`, expA.top.win > 0 ? winShown && winText.includes(`${fmt(expA.top.win)}通り`) : !winShown, winText);
  // 結果の点が選ばれた旅先の位置と合っている: 地図の焦点 = x,y ／ 画面上の位置に朱色の点がある
  const focus = await page.getAttribute('#qz-map', 'data-focus'); const vw = JSON.parse(await page.getAttribute('#qz-map', 'data-view'));
  ok(`${vp.n} 地図の焦点が選ばれた旅先の位置（x,y）`, focus === `${expA.top.x},${expA.top.y}`, `${focus} / 期待 ${expA.top.x},${expA.top.y}`);
  const spot = await page.evaluate(({ x, y, k, tx, ty }) => { const c = document.getElementById('qz-map'); const sx = c.width / 1000; const px = Math.round(sx * (k * x + tx)), py = Math.round(sx * (k * y + ty)); const d = c.getContext('2d').getImageData(Math.max(0, px - 4), Math.max(0, py - 4), 9, 9).data; let red = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 100) red++; return { px, py, red, w: c.width, h: c.height }; }, { x: expA.top.x, y: expA.top.y, ...vw });
  ok(`${vp.n} 結果の点が、その旅先の位置に描かれている（朱色の画素）`, spot.red >= 5, JSON.stringify(spot));
  const link = await page.getAttribute('#qz-r-link', 'href');
  ok(`${vp.n} 旅先ページへのリンク（utm なし）`, link === expA.top.url && !link.includes('utm_') && nexts.every((n) => n.h.startsWith('/destinations/') && !n.h.includes('utm_')), link);
  const share = await page.getAttribute('#qz-share', 'href'); const u = new URL(share); const entry = new URL(u.searchParams.get('url'));
  ok(`${vp.n} 共有: x.com/intent/post`, u.origin + u.pathname === 'https://x.com/intent/post');
  ok(`${vp.n} 共有: 本文`, u.searchParams.get('text') === `私に似合う旅先は【${expA.top.name}(${expA.top.prefecture})】でした。あなたは？` && !u.searchParams.get('text').includes('作者'), u.searchParams.get('text'));
  ok(`${vp.n} 共有: url は結果ページ /quiz/r/<code>/ ＋ utm 4つ（utm_content=code）`, entry.origin + entry.pathname === `https://tabidokoiko.com/quiz/r/${expA.top.code}/` && entry.searchParams.get('utm_source') === 'x' && entry.searchParams.get('utm_medium') === 'social' && entry.searchParams.get('utm_campaign') === 'quiz_travelmatch_2611' && entry.searchParams.get('utm_content') === expA.top.code && [...entry.searchParams.keys()].length === 4, entry.href);
  ok(`${vp.n} 共有: hashtags`, u.searchParams.get('hashtags') === '似合う旅先,どこ行こ', u.searchParams.get('hashtags') + ' / ' + share.slice(share.indexOf('hashtags')));
  ok(`${vp.n} 作った人のXのリンク（結果の画面）`, (await page.getAttribute('#qz-author', 'href')) === 'https://x.com/mori__lab' && (await page.getAttribute('#qz-author', 'rel')) === 'noopener');
  ok(`${vp.n} 結果画面 横スクロールなし`, (await overflow()) <= 0, '差=' + (await overflow()));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${OUT}/shot_${vp.n}_3_result_top.png` });
  await page.screenshot({ path: `${OUT}/shot_${vp.n}_3_result_full.png`, fullPage: true });

  // GA4
  await page.evaluate(() => { for (const id of ['qz-share', 'qz-r-link', 'qz-author']) document.getElementById(id).addEventListener('click', (e) => e.preventDefault(), true); });
  await page.click('#qz-share'); await page.click('#qz-r-link'); await page.click('#qz-author');
  const ev = await page.evaluate(() => window.dataLayer.map((a) => Array.from(a)).filter((a) => a[0] === 'event'));
  const names = ev.map((e) => e[1]); const get = (n) => ev.find((e) => e[1] === n);
  ok(`${vp.n} GA4: quiz_start・quiz_complete・share_click・result_to_destination・author_x_click`, ['quiz_start', 'quiz_complete', 'share_click', 'result_to_destination', 'author_x_click'].every((n) => names.includes(n)), names.join(','));
  ok(`${vp.n} GA4: 送るのは旅先ID・押した場所だけ`, Object.keys(get('share_click')[2]).join() === 'destination_id' && get('share_click')[2].destination_id === expA.top.id && Object.keys(get('author_x_click')[2]).join() === 'place' && get('author_x_click')[2].place === 'result' && Object.keys(get('quiz_start')[2]).length === 0, JSON.stringify([get('share_click')[2], get('author_x_click')[2]]));
  ok(`${vp.n} GA4: 回答の文言・位置を送っていない`, !/静かなところ|どちらでも|1泊で|にぎやか|たくさん歩きたい|latitude|longitude/.test(JSON.stringify(ev)));
  const stor = await page.evaluate(() => ({ ls: Object.keys(localStorage).length, ss: Object.keys(sessionStorage).length }));
  ok(`${vp.n} 保存なし（localStorage・sessionStorage）`, stor.ls === 0 && stor.ss === 0, JSON.stringify(stor));
  ok(`${vp.n} 診断のための送信（POST）・位置情報の要求なし`, reqs.filter((r) => r.startsWith('POST ') && !/google|doubleclick|analytics|gtag/.test(r)).length === 0);
  ok(`${vp.n} ブラウザのエラーなし`, errors.length === 0, errors.slice(0, 2).join(' | '));

  // もう一度 → 戻る
  await page.click('#qz-again'); await page.click('#qz-start'); await page.click('#qz-opts .qz-opt >> nth=0'); await sleep(900); await page.click('#qz-opts .qz-opt >> nth=0'); await sleep(900);
  const before = await page.textContent('#qz-step'); await page.click('#qz-back'); const after = await page.textContent('#qz-step');
  ok(`${vp.n} 「ひとつ前の質問にもどる」`, before.includes('3 / 12') && after.includes('2 / 12'), `${before}→${after}`);

  // 連打・戻る: 同じ答えを連打 / 押した直後に戻る → 最後は同じ結果
  await page.goto(BASE + '/quiz/?qa=1', { waitUntil: 'networkidle' }); await page.click('#qz-start');
  let mashOk = true; const picksM = SETS.B;
  for (let i = 0; i < 12; i++) {
    const idx = () => page.$$('#qz-opts .qz-opt');
    const opts = await idx(); const k = Math.min(picksM[i], opts.length - 1);
    if (i === 2) {                                              // 押した直後に「もどる」: 同じ質問にとどまり、取り消される
      const sBefore = await page.textContent('#qz-step');
      await opts[k].click(); await page.click('#qz-back'); const sAfter = await page.textContent('#qz-step');
      const left = Number((await page.textContent('#qz-left')).replace(/,/g, '')); await sleep(900);
      if (sBefore !== sAfter || Number((await page.textContent('#qz-left')).replace(/,/g, '')) !== expectLeft(answersFor(picksM, 2))) { mashOk = false; }
      const opts2 = await idx(); await opts2[k].click();
    } else {
      for (let m = 0; m < 6; m++) { await opts[k].click({ force: true, noWaitAfter: true }).catch(() => {}); }   // 連打
    }
    if (i < 11) await sleep(950);
  }
  await page.waitForSelector('#qz-result:not([hidden])'); await sleep(1500);
  const expB = result(P, answersFor(picksM));
  const nameB = await page.textContent('#qz-r-name');
  ok(`${vp.n} 連打・押した直後の「もどる」をしても、結果が変わらない`, mashOk && nameB === expB.top.name, `${nameB} / 期待 ${expB.top.name} / 戻る中の状態 ${mashOk}`);
  ok(`${vp.n} 連打のあとも質問は12で終わる（結果が1回だけ出る）`, (await page.$$eval('#qz-r-next li', (l) => l.length)) === 3 && (await page.evaluate(() => window.dataLayer.map((a) => Array.from(a)).filter((a) => a[1] === 'quiz_complete').length)) === 1);
  await ctx.close();
}

// ---- 結果ページ・共有画像（ビルド済み）
const rctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const rp = await rctx.newPage();
const pickCodes = ['kamakura', 'miyakojima', 'chichijima', 'sapporo', 'beppu'].map((id) => DATA.find((d) => d.id === id)).filter(Boolean);
for (const d of pickCodes) {
  const r = await rp.goto(`${BASE}/quiz/r/${d.code}/`, { waitUntil: 'networkidle' });
  const html = await rp.content();
  const meta = (sel, attr) => rp.$eval(sel, (e, a) => e.getAttribute(a), attr).catch(() => null);
  ok(`結果ページ ${d.name}: HTTP 200・noindex,follow・canonical=/quiz/`, r.status() === 200 && (await meta('meta[name=robots]', 'content')) === 'noindex,follow' && (await meta('link[rel=canonical]', 'href')) === 'https://tabidokoiko.com/quiz/');
  const ogi = await meta('meta[property="og:image"]', 'content'); const og = await rp.request.get(`${BASE}/quiz/og/${d.code}.png`);
  ok(`結果ページ ${d.name}: og:image が結果ごと・画像が存在`, ogi === `https://tabidokoiko.com/quiz/og/${d.code}.png` && og.status() === 200 && (await og.body()).length > 3000 && (await og.body()).length < 60000, `${ogi} ${og.status()} ${(await og.body()).length}バイト`);
  ok(`結果ページ ${d.name}: twitter:card・og:title`, (await meta('meta[name="twitter:card"]', 'content')) === 'summary_large_image' && (await meta('meta[property="og:title"]', 'content')).includes(d.name));
  ok(`結果ページ ${d.name}: 旅先ページ・/quiz/・作った人のX`, (await meta('a.go', 'href')) === d.url && (await meta('a.quiz', 'href')) === '/quiz/' && (await meta('#author', 'href')) === 'https://x.com/mori__lab' && (await meta('#author', 'rel')) === 'noopener');
  ok(`結果ページ ${d.name}: 所要時間・料金・送迎・無料が無い`, !/所要|料金|送迎|無料|円/.test(await rp.innerText('body')));
  if (d.id === 'kamakura' || d.id === 'miyakojima') await rp.screenshot({ path: `${OUT}/shot_resultpage_${d.id}.png`, fullPage: true });
}
await rctx.close();
await browser.close();
fs.writeFileSync(OUT + '/browser_test_result.json', JSON.stringify(res, null, 1));
const ng = res.filter((r) => !r.ok);
console.log('\n' + (res.length - ng.length) + '/' + res.length + ' OK');
process.exit(ng.length ? 1 : 0);
