// URLを実ブラウザ(Playwright Chromium)で開き、HTTP状態とタイトルを出す。bot遮断(403)のサイトが人には開けるかの確認用。
import { chromium } from 'playwright';
const urls = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
for (const u of urls) {
  const p = await ctx.newPage();
  try {
    const r = await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await p.waitForTimeout(2500);
    console.log(`${r?.status()} ${u}\n   title: ${(await p.title()).slice(0, 80)}\n   body: ${(await p.innerText('body')).replace(/\s+/g, ' ').slice(0, 160)}`);
  } catch (e) { console.log(`ERR ${u} ${String(e).slice(0, 80)}`); }
  await p.close();
}
await b.close();
