#!/usr/bin/env node
/**
 * buildStayKeywordFallback.mjs — 宿の検索リンクのうち「検索語は正しく読まれたが 0 件」のものに、結果が出る代替の検索語を探す（2026-10-13）。
 *
 * 入力: logs/stay_links_full.json（auditStayLinksFull.mjs --live の結果）の zero-hits
 * 出力: src/data/stayKeywordFallback.json  {"rakuten": {元の語: 代替の語}, "jalan": {...}}
 *       logs/stay_keyword_fallback_report.json（代替が見つからなかったもの）
 * 代替の候補（上から順に、実際に取得して 1 件以上ヒットした最初のものを採用）
 *   1. 括弧とその中身を除く（例: Ento（エントウ）→ Ento）／括弧の中身だけ（エントウ）
 *   2. 空白区切りの語を後ろから減らす（例: 猪苗代 磐梯山麓温泉 静楓亭 → 猪苗代 磐梯山麓温泉 → 猪苗代）、最後の語・先頭の語
 *   3. 旅先の拠点（hubCity・hubName）・旅先名・県庁所在地（ページの文脈。広い語なので最後）
 * 反映は scripts/rakutenUrl.js・jalanUrl.js の resolveStayKeyword が、ビルド時にこの表を引く。
 * usage: node scripts/buildStayKeywordFallback.mjs [--conc 3] [--delay 600]
 */
import fs from 'fs';
import iconv from 'iconv-lite';
import { encodeSjisParam } from './jalanUrl.js';

const args = process.argv.slice(2);
const val = (f, d) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const CONC = Number(val('--conc', 3)), DELAY = Number(val('--delay', 600));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FILE = 'src/data/stayKeywordFallback.json';

const res = JSON.parse(fs.readFileSync('logs/stay_links_full.json', 'utf8'));
const zero = res.live.rows.filter((r) => ['zero-hits', 'http-error'].includes(r.verdict));
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));
const CAPITAL = { 北海道: '札幌', 青森県: '青森', 岩手県: '盛岡', 宮城県: '仙台', 秋田県: '秋田', 山形県: '山形', 福島県: '福島', 茨城県: '水戸', 栃木県: '宇都宮', 群馬県: '前橋', 埼玉県: 'さいたま', 千葉県: '千葉', 東京都: '東京', 神奈川県: '横浜', 新潟県: '新潟', 富山県: '富山', 石川県: '金沢', 福井県: '福井', 山梨県: '甲府', 長野県: '長野', 岐阜県: '岐阜', 静岡県: '静岡', 愛知県: '名古屋', 三重県: '津', 滋賀県: '大津', 京都府: '京都', 大阪府: '大阪', 兵庫県: '神戸', 奈良県: '奈良', 和歌山県: '和歌山', 鳥取県: '鳥取', 島根県: '松江', 岡山県: '岡山', 広島県: '広島', 山口県: '山口', 徳島県: '徳島', 香川県: '高松', 愛媛県: '松山', 高知県: '高知', 福岡県: '福岡', 佐賀県: '佐賀', 長崎県: '長崎', 熊本県: '熊本', 大分県: '大分', 宮崎県: '宮崎', 鹿児島県: '鹿児島', 沖縄県: '那覇' };

function candidates(k, pageRel) {
  const out = [];
  const noParen = k.replace(/[（(][^）)]*[）)]/g, '').replace(/[「」『』]/g, '').trim();
  if (noParen && noParen !== k) out.push(noParen);
  const inParen = (k.match(/[（(]([^）)]+)[）)]/) || [])[1];
  if (inParen) out.push(inParen);
  const toks = noParen.split(/[\s・]+/).filter(Boolean);
  for (let n = toks.length - 1; n >= 1; n--) out.push(toks.slice(0, n).join(' '));
  if (toks.length > 1) { out.push(toks[toks.length - 1]); out.push(toks[0]); }
  const id = pageRel?.match(/destinations\/([^/]+)\//)?.[1];
  const d = byId.get(id);
  if (d) {
    for (const c of [d.hubCity, d.hubName, d.name, CAPITAL[(d.prefecture || '').split(/[・,、／/]/)[0]]]) if (c) out.push(c);
  }
  return [...new Set(out)].filter((c) => c && c !== k && c.length >= 2);
}

async function hits(site, kw) {
  const url = site === 'rakuten'
    ? `https://kw.travel.rakuten.co.jp/keyword/Search.do?f_query=${encodeSjisParam(kw)}`
    : `https://www.jalan.net/uw/uwp2011/uww2011init.do?keyword=${encodeSjisParam(kw)}`;
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ja' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
      const html = iconv.decode(Buffer.from(await r.arrayBuffer()), 'Shift_JIS');
      const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
      if (r.status === 429 || r.status === 503 || /アクセスしにくい|混雑/.test(title)) { await sleep(6000 * (a + 1)); continue; }
      if (r.status !== 200) return -1;
      return /見つかりませんでした/.test(html) ? 0 : 1;
    } catch { await sleep(2500 * (a + 1)); }
  }
  return -1;
}

const map = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { rakuten: {}, jalan: {} };
const none = [];
let next = 0, done = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < zero.length) {
    const r = zero[next++];
    if (map[r.site][r.keyword]) continue;
    let found = null;
    for (const c of candidates(r.keyword, r.pages[0])) {
      const h = await hits(r.site, c); await sleep(DELAY);
      if (h === 1) { found = c; break; }
    }
    if (found) map[r.site][r.keyword] = found; else none.push({ site: r.site, keyword: r.keyword, page: r.pages[0] });
    if (++done % 50 === 0) { process.stderr.write(`  ${done}/${zero.length}\n`); fs.writeFileSync(FILE, JSON.stringify(map, null, 1)); }
  }
}));
fs.writeFileSync(FILE, JSON.stringify(map, null, 1));
fs.writeFileSync('logs/stay_keyword_fallback_report.json', JSON.stringify({ unresolved: none }, null, 1));
console.log(`0件 ${zero.length} 本 → 代替あり 楽天 ${Object.keys(map.rakuten).length} / じゃらん ${Object.keys(map.jalan).length}、代替なし ${none.length} 本`);
