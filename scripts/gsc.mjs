// Search Console のデータを API で取得して記録する（2026-11-06）。読み取りのみ。サイトのコード・データは変更しない。
//   npm run gsc                  1〜3 をすべて実行（URL検査 → 検索パフォーマンス → 集計）
//   npm run gsc -- --step inspect|perf|summary
//   npm run gsc -- --limit 20    URL検査を先頭20件だけ（動作確認）
//   npm run gsc -- --date 2026-11-06   記録の日付を指定（途中で止めた続きの再開用）
// 認証: サービスアカウントの JSON キー。環境変数 GSC_KEY_FILE のパス（無ければ ~/.config/morilab/gsc-key.json）。キーの中身は出力しない。
// 保存先: logs/gsc/inspect_<日付>.jsonl・inspect_summary_<日付>.md・perf_<日付>.csv（ほか perf_pages / perf_queries / perf_daily）
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'logs/gsc');
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const STEP = opt('--step', 'all');
const LIMIT = Number(opt('--limit', 0)) || Infinity;
const TODAY = opt('--date', new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date()));
const PERF_START = '2026-08-01';
const DAILY_CAP = 1900;        // URL検査API は 1日2,000件が目安。余裕を持って止める
const WORKERS = 3, GAP_MS = 400; // 毎分 600件の上限に対し、およそ毎分 150〜250件
const SITE = 'https://tabidokoiko.com';
fs.mkdirSync(OUT, { recursive: true });

// ── エラーは「種類」だけ出す（本文・メールアドレス・キーは出さない）──
class GscError extends Error { constructor(stage, status, kind) { super(`${stage}: HTTP ${status} ${kind}`); this.stage = stage; this.status = status; this.kind = kind; } }
const kindOf = (j) => {
  const e = j?.error;
  if (typeof e === 'string') return e;                                   // OAuth: invalid_grant など
  const reasons = (e?.details || []).map((d) => d.reason).filter(Boolean);
  if (reasons.includes('SERVICE_DISABLED') || /has not been used|is disabled/i.test(e?.message || '')) return 'API が有効になっていない（SERVICE_DISABLED）';
  if (/sufficient permission|not have permission|forbidden/i.test(e?.message || '')) return 'サイトへの権限がない（このアカウントがプロパティのユーザーに追加されていない）';
  return [e?.status, ...reasons].filter(Boolean).join('/') || 'unknown';
};

// ── 認証 ──
const keyPath = process.env.GSC_KEY_FILE || path.join(os.homedir(), '.config/morilab/gsc-key.json');
let token = null, tokenExp = 0;
async function accessToken() {
  if (token && Date.now() < tokenExp - 60_000) return token;
  let key;
  try { key = JSON.parse(fs.readFileSync(keyPath, 'utf8')); } catch (e) { throw new GscError('キーの読み込み', 0, e.code === 'ENOENT' ? 'ファイルがない' : '読めない'); }
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: key.token_uri, iat: now, exp: now + 3600 })}`;
  let sig;
  try { sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url'); } catch { throw new GscError('JWT の署名', 0, 'キーの形式が不正'); }
  const r = await fetch(key.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new GscError('アクセストークンの取得', r.status, kindOf(j));
  token = j.access_token; tokenExp = Date.now() + (j.expires_in || 3600) * 1000;
  return token;
}
async function api(stage, url, body, method = body ? 'POST' : 'GET') {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { method, headers: { authorization: `Bearer ${await accessToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 2000 * 2 ** i)); continue; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new GscError(stage, r.status, kindOf(j));
    return j;
  }
  throw new GscError(stage, 429, '再試行しても上限（毎分の上限）');
}

// ── プロパティ（sc-domain: と https:// の両方を試して、権限のある方）──
async function pickProperty() {
  const j = await api('サイト一覧（sites.list）', 'https://www.googleapis.com/webmasters/v3/sites');
  const have = new Map((j.siteEntry || []).map((s) => [s.siteUrl, s.permissionLevel]));
  for (const c of ['sc-domain:tabidokoiko.com', `${SITE}/`]) {
    const lv = have.get(c);
    if (lv && lv !== 'siteUnverifiedUser') return { siteUrl: c, level: lv, tried: [...have.keys()].length };
  }
  // 一覧に出なくても、直接問い合わせて権限を確かめる（両方を試す）
  const probeErr = [];
  for (const c of ['sc-domain:tabidokoiko.com', `${SITE}/`]) {
    try {
      await api('権限の確認（searchAnalytics）', `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(c)}/searchAnalytics/query`, { startDate: PERF_START, endDate: PERF_START, dimensions: ['date'], rowLimit: 1 });
      return { siteUrl: c, level: '（一覧に無いが問い合わせは通る）', tried: have.size };
    } catch (e) { probeErr.push(`${c.startsWith('sc-domain') ? 'sc-domain' : 'https'}: HTTP ${e.status} ${e.kind}`); }
  }
  throw new GscError('プロパティの選択', 403, `権限のあるプロパティがない（サイト一覧 ${have.size}件・直接の問い合わせも ${probeErr.join(' / ')}）`);
}

// ── sitemap（現在の本番）──
async function sitemapUrls() {
  const seen = new Set(), urls = [];
  const walk = async (u) => {
    if (seen.has(u)) return; seen.add(u);
    const t = await (await fetch(`${u}?_=${Date.now()}`, { headers: { 'user-agent': 'Mozilla/5.0 dokoiko-gsc' } })).text();
    for (const m of t.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) { if (/sitemap.*\.xml$/i.test(m[1])) await walk(m[1]); else urls.push(m[1]); }
  };
  await walk(`${SITE}/sitemap.xml`);
  return [...new Set(urls)];
}

// ── 1. URL検査 ──
const INSPECT_FILE = path.join(OUT, `inspect_${TODAY}.jsonl`);
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
async function stepInspect(prop) {
  const urls = (await sitemapUrls()).slice(0, LIMIT);
  const done = new Map(readJsonl(INSPECT_FILE).filter((r) => !r.error).map((r) => [r.url, r]));
  const todo = urls.filter((u) => !done.has(u));
  console.log(`URL検査: sitemap ${urls.length}件 / 取得済み ${done.size}件（スキップ）/ これから ${todo.length}件`);
  // 取得済みの行だけ残して書き直す（エラー行は再試行）
  fs.writeFileSync(INSPECT_FILE, [...done.values()].map((r) => JSON.stringify(r)).join('\n') + (done.size ? '\n' : ''));
  const out = fs.createWriteStream(INSPECT_FILE, { flags: 'a' });
  let n = 0, ok = 0, ng = 0, stop = null; const reasons = {};
  const worker = async () => {
    while (!stop) {
      const u = todo[n++]; if (!u) return;
      if (done.size + ok + ng >= DAILY_CAP) { stop = '1日の上限（目安）に達したため止めた'; return; }
      try {
        const j = await api('URL検査（urlInspection）', 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: u, siteUrl: prop.siteUrl, languageCode: 'ja' });
        const s = j.inspectionResult?.indexStatusResult || {};
        out.write(JSON.stringify({ url: u, inspectedAt: new Date().toISOString(), verdict: s.verdict ?? null, coverageState: s.coverageState ?? null, indexingState: s.indexingState ?? null, robotsTxtState: s.robotsTxtState ?? null, pageFetchState: s.pageFetchState ?? null, lastCrawlTime: s.lastCrawlTime ?? null, googleCanonical: s.googleCanonical ?? null, userCanonical: s.userCanonical ?? null, crawledAs: s.crawledAs ?? null, sitemap: s.sitemap ?? null }) + '\n');
        ok++;
      } catch (e) {
        const kind = e instanceof GscError ? `HTTP ${e.status} ${e.kind}` : e.name;
        reasons[kind] = (reasons[kind] || 0) + 1; ng++;
        out.write(JSON.stringify({ url: u, error: kind }) + '\n');
        if (e instanceof GscError && [401, 403].includes(e.status)) { stop = `${e.stage}: ${kind}`; return; }   // 権限・API無効は続けても同じ
        if (/quota|RESOURCE_EXHAUSTED/i.test(kind)) { stop = `上限（${kind}）`; return; }
      }
      if ((ok + ng) % 100 === 0) console.log(`  … ${ok + ng}/${todo.length}（成功 ${ok}・失敗 ${ng}）`);
      await new Promise((s) => setTimeout(s, GAP_MS));
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));
  await new Promise((r) => out.end(r));
  console.log(`URL検査: 今回 成功 ${ok} / 失敗 ${ng}${Object.keys(reasons).length ? ' ' + JSON.stringify(reasons) : ''}${stop ? ` / 停止: ${stop}` : ''}`);
  if (stop) { console.log('途中で止まった。同じ日付で npm run gsc を流すと、取得済みを飛ばして続きから再開する'); process.exitCode = 2; }
  return { ok, ng, reasons, stop, total: urls.length };
}

// ── 3. 検索パフォーマンス ──
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
async function perfQuery(prop, dimensions) {
  const rows = []; let startRow = 0;
  for (;;) {
    const j = await api('検索パフォーマンス（searchAnalytics）', `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(prop.siteUrl)}/searchAnalytics/query`,
      { startDate: PERF_START, endDate: TODAY, dimensions, rowLimit: 25000, startRow, type: 'web' });
    const r = j.rows || []; rows.push(...r); if (r.length < 25000) break; startRow += r.length;
  }
  return rows;
}
async function stepPerf(prop) {
  const save = (name, dims, rows) => {
    const f = path.join(OUT, name);
    fs.writeFileSync(f, [[...dims, 'clicks', 'impressions', 'ctr', 'position'].join(','), ...rows.map((r) => [...r.keys, r.clicks, r.impressions, r.ctr, r.position].map(csvCell).join(','))].join('\n') + '\n');
    return f;
  };
  const three = await perfQuery(prop, ['date', 'page', 'query']);   // 検索語を含む行（匿名化された検索語は含まれない）
  const byPage = await perfQuery(prop, ['page']);                    // 検索語を含めない（匿名化された分も入る）
  const byQuery = await perfQuery(prop, ['query']);
  const daily = await perfQuery(prop, ['date']);
  save(`perf_${TODAY}.csv`, ['date', 'page', 'query'], three);
  save(`perf_pages_${TODAY}.csv`, ['page'], byPage);
  save(`perf_queries_${TODAY}.csv`, ['query'], byQuery);
  save(`perf_daily_${TODAY}.csv`, ['date'], daily);
  console.log(`検索パフォーマンス: 日別×ページ×検索語 ${three.length}行 / ページ別 ${byPage.length} / 検索語別 ${byQuery.length} / 日別 ${daily.length}`);
  return { three: three.length, pages: byPage.length, queries: byQuery.length, daily: daily.length };
}

// ── 2. 集計 ──
const readCsv = (f) => {
  if (!fs.existsSync(f)) return [];
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n'); const head = lines.shift().split(',');
  return lines.map((l) => { const c = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return Object.fromEntries(head.map((h, i) => [h, c[i]])); });
};
const med = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const f1 = (x) => (x == null ? '—' : Number.isInteger(x) ? String(x) : x.toFixed(1));
const idOf = (u) => { const m = decodeURIComponent(new URL(u).pathname).match(/^\/destinations\/([^/]+)\/?$/); return m ? m[1] : null; };

function stepSummary(prop) {
  const recs = readJsonl(INSPECT_FILE);
  const okRecs = recs.filter((r) => !r.error), errRecs = recs.filter((r) => r.error);
  const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
  const byId = new Map(dests.map((d) => [d.id, d]));
  const ouen = new Set(['ouen-wari', 'kyushu-fukko', ...[...fs.readFileSync(path.join(root, 'src/data/ouenWari.ts'), 'utf8').matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1])]);
  const typeOf = (u) => {
    const p = decodeURIComponent(new URL(u).pathname).replace(/^\/|\/$/g, '');
    const id = idOf(u);
    if (id) { const d = byId.get(id); if (d?.carFree) return '旅先（車なしガイドあり）'; if (id.startsWith('gen_')) return '旅先 gen_系'; if (id.startsWith('niche_')) return '旅先 niche_系'; return '旅先（通常）'; }
    if (p.startsWith('hub/')) return 'ハブ';
    if (ouen.has(p.split('/')[0])) return '応援割';
    return '固定ページ';
  };
  const L = [];
  const state = (r) => r.coverageState ?? '（coverageState なし）';
  L.push(`# Search Console URL検査の集計 ${TODAY}`, '', `- プロパティ: ${prop ? prop.siteUrl : '（集計のみ実行）'}　取得 ${okRecs.length}件 / 失敗 ${errRecs.length}件`);
  if (errRecs.length) { const c = {}; for (const r of errRecs) c[r.error] = (c[r.error] || 0) + 1; L.push(`- 失敗の理由: ${Object.entries(c).map(([k, v]) => `${k} ${v}件`).join('、')}`); }
  L.push('', '保存した値だけで集計している。原因は決めつけない。', '');

  const cs = {}; for (const r of okRecs) cs[state(r)] = (cs[state(r)] || 0) + 1;
  L.push('## coverageState ごとの件数', '', '| coverageState | 件数 |', '|---|---:|', ...Object.entries(cs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), '');
  const vd = {}; for (const r of okRecs) vd[r.verdict ?? 'なし'] = (vd[r.verdict ?? 'なし'] || 0) + 1;
  L.push(`verdict: ${Object.entries(vd).map(([k, v]) => `${k} ${v}`).join(' / ')}`, '');

  const canon = okRecs.filter((r) => r.googleCanonical && r.userCanonical && r.googleCanonical !== r.userCanonical);
  L.push(`## googleCanonical が userCanonical と違うページ: ${canon.length}件`, '', ...(canon.length ? ['| URL | userCanonical | googleCanonical |', '|---|---|---|', ...canon.slice(0, 200).map((r) => `| ${r.url} | ${r.userCanonical} | ${r.googleCanonical} |`), ...(canon.length > 200 ? [`（ほか ${canon.length - 200}件。jsonl を参照）`] : [])] : ['なし']), '');
  const noGc = okRecs.filter((r) => !r.googleCanonical).length, noUc = okRecs.filter((r) => !r.userCanonical).length;
  L.push(`参考: googleCanonical が空 ${noGc}件 / userCanonical が空 ${noUc}件`, '');

  const never = okRecs.filter((r) => !r.lastCrawlTime);
  L.push(`## lastCrawlTime が無い（一度も見に来ていない）ページ: ${never.length}件`, '');
  const months = {}; for (const r of okRecs) if (r.lastCrawlTime) { const m = r.lastCrawlTime.slice(0, 7); months[m] = (months[m] || 0) + 1; }
  L.push('## 最後にクロールされた日の分布（月ごと）', '', '| 月 | 件数 |', '|---|---:|', ...Object.entries(months).sort().map(([k, v]) => `| ${k} | ${v} |`), '');

  const types = ['旅先（通常）', '旅先 gen_系', '旅先 niche_系', '旅先（車なしガイドあり）', 'ハブ', '応援割', '固定ページ'];
  const states = Object.keys(cs).sort((a, b) => cs[b] - cs[a]);
  const grid = {}; for (const r of okRecs) { const t = typeOf(r.url), s = state(r); (grid[t] ||= {})[s] = (grid[t][s] || 0) + 1; }
  L.push('## ページの種類 × coverageState', '', `| 種類 | 計 | ${states.join(' | ')} |`, `|---|---:|${states.map(() => '---:').join('|')}|`,
    ...types.filter((t) => grid[t]).map((t) => `| ${t} | ${Object.values(grid[t]).reduce((a, b) => a + b, 0)} | ${states.map((s) => grid[t][s] || 0).join(' | ')} |`), '');

  // 登録済み と クロール済み-未登録 の旅先の比較
  const isIdx = (r) => r.verdict === 'PASS';
  const isCrawledNot = (r) => /クロール済み|Crawled/.test(r.coverageState || '') && !isIdx(r);
  const destRecs = okRecs.filter((r) => idOf(r.url) && byId.has(idOf(r.url)));
  const A = destRecs.filter(isIdx), Bg = destRecs.filter(isCrawledNot);
  // 内部リンク（dist の旅先ページへの被リンク数）
  const inl = new Map();
  const dist = path.join(root, 'dist');
  if (fs.existsSync(dist)) {
    const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name.endsWith('.html')) { const self = path.relative(dist, path.dirname(f)); const t = fs.readFileSync(f, 'utf8'); const seen = new Set(); for (const m of t.matchAll(/href="\/destinations\/([^"/#?]+)\/?[#?"]/g)) { const id = decodeURIComponent(m[1]); if (self !== `destinations/${id}`) seen.add(id); } for (const id of seen) inl.set(id, (inl.get(id) || 0) + 1); } } };
    walk(dist);
  }
  const feat = (r) => {
    const d = byId.get(idOf(r.url));
    const hero = fs.existsSync(path.join(root, 'public/images', d.id, 'main.jpg')) || fs.existsSync(path.join(root, 'public/images', `${d.id}.jpg`));
    return { desc: [...(d.description || '')].length, hero: hero ? 1 : 0, spots: (d.spots || []).length, stay: d.featured_stay ? 1 : 0, inl: inl.get(d.id) || 0, seoTitle: (d.seo?.title ?? d.carFree?.seo?.title) ? 1 : 0, pref: d.prefecture };
  };
  const fa = A.map(feat), fb = Bg.map(feat);
  L.push('## 旅先ページ: 登録済み と クロール済み-未登録 の比較', '', `登録済み（verdict PASS） ${A.length}件 / クロール済み-未登録 ${Bg.length}件。` + (Math.min(A.length, Bg.length) < 30 ? '**どちらかが30件未満なので、少ないので断定できない。**' : '件数は比べられる程度にある。ただし関連を示すだけで、原因は決めない。'), '');
  if (A.length && Bg.length) {
    const row = (name, f) => `| ${name} | ${f1(med(fa.map(f)))} / ${f1(mean(fa.map(f)))} | ${f1(med(fb.map(f)))} / ${f1(mean(fb.map(f)))} |`;
    const pct = (a, f) => (a.length ? `${(a.filter((x) => f(x)).length / a.length * 100).toFixed(0)}%（${a.filter((x) => f(x)).length}/${a.length}）` : '—');
    L.push('| 項目 | 登録済み 中央値 / 平均 | クロール済み-未登録 中央値 / 平均 |', '|---|---|---|', row('description の字数', (x) => x.desc), row('spots の数', (x) => x.spots), row('内部リンク（dist内の被リンクページ数）', (x) => x.inl), '',
      '| 項目 | 登録済み | クロール済み-未登録 |', '|---|---|---|', `| ヒーロー画像あり | ${pct(fa, (x) => x.hero)} | ${pct(fb, (x) => x.hero)} |`, `| featured_stay あり | ${pct(fa, (x) => x.stay)} | ${pct(fb, (x) => x.stay)} |`, `| 個別に書いた title（seo） | ${pct(fa, (x) => x.seoTitle)} | ${pct(fb, (x) => x.seoTitle)} |`, `| title の型「おすすめ観光スポット」 | ${pct(fa, (x) => !x.seoTitle)} | ${pct(fb, (x) => !x.seoTitle)} |`, '');
    const prefs = {}; for (const x of fa) (prefs[x.pref] ||= [0, 0])[0]++; for (const x of fb) (prefs[x.pref] ||= [0, 0])[1]++;
    L.push('都道府県別（登録済み / クロール済み-未登録。計10件未満の県は少ないので断定できない）', '', '| 県 | 登録済み | クロール済み-未登録 | 備考 |', '|---|---:|---:|---|',
      ...Object.entries(prefs).sort((a, b) => (b[1][0] + b[1][1]) - (a[1][0] + a[1][1])).map(([k, [a, b]]) => `| ${k} | ${a} | ${b} | ${a + b < 10 ? '少ないので断定できない' : ''} |`), '');
  } else L.push('どちらかが0件のため比較できない。', '');

  // 前回との差分
  const prevFile = fs.readdirSync(OUT).filter((f) => /^inspect_\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && f < `inspect_${TODAY}.jsonl`).sort().at(-1);
  L.push('## 前回との差分', '');
  if (!prevFile) L.push('初回の記録のため、前回との差分はない。', '');
  else {
    const prev = new Map(readJsonl(path.join(OUT, prevFile)).filter((r) => !r.error).map((r) => [r.url, r]));
    const cur = new Map(okRecs.map((r) => [r.url, r]));
    const tr = {}; const changed = [];
    for (const [u, r] of cur) { const p = prev.get(u); const a = p ? state(p) : '（前回なし）', b = state(r); if (a !== b) { const k = `${a} → ${b}`; tr[k] = (tr[k] || 0) + 1; changed.push(`${u}: ${k}`); } }
    for (const u of prev.keys()) if (!cur.has(u)) { const k = `${state(prev.get(u))} → （今回なし）`; tr[k] = (tr[k] || 0) + 1; }
    L.push(`前回: ${prevFile}（${prev.size}件）。coverageState が変わった URL: ${changed.length}件`, '', ...(Object.keys(tr).length ? ['| 変化 | 件数 |', '|---|---:|', ...Object.entries(tr).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`)] : ['変化なし']), '', ...changed.slice(0, 50).map((x) => `- ${x}`), '');
    const pf = fs.readdirSync(OUT).filter((f) => /^perf_daily_\d{4}-\d{2}-\d{2}\.csv$/.test(f) && f < `perf_daily_${TODAY}.csv`).sort().at(-1);
    const nowD = readCsv(path.join(OUT, `perf_daily_${TODAY}.csv`));
    if (pf && nowD.length) {
      const sum = (rows, k) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);
      const pd = readCsv(path.join(OUT, pf));
      L.push(`検索パフォーマンスの合計（${PERF_START}〜）: 前回 ${pf} 表示 ${sum(pd, 'impressions')}・クリック ${sum(pd, 'clicks')} → 今回 表示 ${sum(nowD, 'impressions')}・クリック ${sum(nowD, 'clicks')}`, '');
    }
  }

  // title・description を変えたページの効果（logs/seo_changes_<日付>.json。変更日の前後で同じ日数を、同じ元データ perf_<日付>.csv から比べる）
  for (const cf of fs.readdirSync(path.join(root, 'logs')).filter((f) => /^seo_changes_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
    const ch = JSON.parse(fs.readFileSync(path.join(root, 'logs', cf), 'utf8'));
    const three = readCsv(path.join(OUT, `perf_${TODAY}.csv`));
    if (!three.length) continue;
    const lastDate = three.reduce((m, r) => (r.date > m ? r.date : m), '');
    const dayMs = 86400000, t = (d) => Date.parse(d + 'T00:00:00Z'), ds = (ms) => new Date(ms).toISOString().slice(0, 10);
    const afterFrom = ds(t(ch.date) + dayMs); // 変更日の翌日から
    const n = Math.round((t(lastDate) - t(afterFrom)) / dayMs) + 1;
    L.push(`## title・description を変えたページの前後比較（${cf}・変更日 ${ch.date}）`, '');
    if (n < 14) { L.push(`変更の翌日から最新データ（${lastDate}）まで ${Math.max(n, 0)}日。14日に満たないので、まだ比べない（2週間後に再実行）。`, ''); continue; }
    const beforeFrom = ds(t(afterFrom) - n * dayMs), beforeTo = ds(t(afterFrom) - dayMs);
    const agg = (id, a, b) => { let i = 0, c = 0, pw = 0; for (const r of three) { if (decodeURIComponent(r.page).split('/destinations/')[1]?.replace(/\/$/, '') !== id || r.date < a || r.date > b) continue; const im = Number(r.impressions); i += im; c += Number(r.clicks); pw += Number(r.position) * im; } return { i, c, pos: i ? pw / i : null }; };
    L.push(`前: ${beforeFrom}〜${beforeTo} / 後: ${afterFrom}〜${lastDate}（各${n}日）。検索語つきの行だけの集計（匿名化された検索語は含まない）。`, '', '| ページ | 表示 前→後 | クリック 前→後 | 平均順位 前→後 |', '|---|---|---|---|');
    let tb = [0, 0], ta = [0, 0];
    for (const it of ch.items) { const b = agg(it.id, beforeFrom, beforeTo), a = agg(it.id, afterFrom, lastDate); tb[0] += b.i; tb[1] += b.c; ta[0] += a.i; ta[1] += a.c; L.push(`| ${it.name} | ${b.i}→${a.i} | ${b.c}→${a.c} | ${b.pos?.toFixed(1) ?? '—'}→${a.pos?.toFixed(1) ?? '—'} |`); }
    L.push(`| 合計 | ${tb[0]}→${ta[0]} | ${tb[1]}→${ta[1]} | |`, '', `クリック率 前 ${tb[0] ? (tb[1] / tb[0] * 100).toFixed(2) : '—'}% → 後 ${ta[0] ? (ta[1] / ta[0] * 100).toFixed(2) : '—'}%。件数が少ないので、関連を示すだけで原因は決めない。`, '');
  }

  // 検索パフォーマンス
  const pages = readCsv(path.join(OUT, `perf_pages_${TODAY}.csv`)), qs = readCsv(path.join(OUT, `perf_queries_${TODAY}.csv`)), daily = readCsv(path.join(OUT, `perf_daily_${TODAY}.csv`));
  L.push(`## 検索パフォーマンス（${PERF_START}〜${TODAY}）`, '');
  if (!daily.length) L.push('未取得（--step perf で取得）', '');
  else {
    const tot = (k) => daily.reduce((a, r) => a + Number(r[k]), 0);
    L.push(`合計: 表示 ${tot('impressions')}回・クリック ${tot('clicks')}回・日数 ${daily.length}日（日別の行がある日）`, '');
    const top = (rows, key, n) => [...rows].sort((a, b) => Number(b.impressions) - Number(a.impressions)).slice(0, n).map((r, i) => `| ${i + 1} | ${r[key]} | ${r.impressions} | ${r.clicks} | ${Number(r.position).toFixed(1)} |`);
    L.push('表示回数のあるページ 上位50', '', '| 順 | ページ | 表示 | クリック | 平均掲載順位 |', '|---:|---|---:|---:|---:|', ...top(pages, 'page', 50), '', '検索語 上位50（表示回数順）', '', '| 順 | 検索語 | 表示 | クリック | 平均掲載順位 |', '|---:|---|---:|---:|---:|', ...top(qs, 'query', 50), '');
    L.push(`表示回数のあるページ数: ${pages.length}（sitemap の URL のうち）/ 検索語の種類: ${qs.length}。検索語別は、プライバシーのため匿名化された検索語を含まない。`, '');
  }
  const sf = path.join(OUT, `inspect_summary_${TODAY}.md`);
  fs.writeFileSync(sf, L.join('\n') + '\n');
  console.log(`集計: ${path.relative(root, sf)}`);
  return { cs, canon: canon.length, never: never.length, A: A.length, B: Bg.length };
}

// ── 実行 ──
try {
  let prop = null;
  if (STEP !== 'summary') { prop = await pickProperty(); console.log(`プロパティ: ${prop.siteUrl}（権限 ${prop.level}）`); }
  if (STEP === 'all' || STEP === 'inspect') { const r = await stepInspect(prop); if (r.stop && STEP === 'all') { console.log('（URL検査が途中のため、集計は取得済みの分で作る）'); } }
  if (STEP === 'all' || STEP === 'perf') await stepPerf(prop);
  if (STEP === 'all' || STEP === 'summary') stepSummary(prop);
} catch (e) {
  if (e instanceof GscError) { console.error(`❌ 止まった: ${e.stage} → HTTP ${e.status} ${e.kind}`); process.exit(1); }
  console.error(`❌ 想定外のエラー: ${e.name}`); process.exit(1);
}
