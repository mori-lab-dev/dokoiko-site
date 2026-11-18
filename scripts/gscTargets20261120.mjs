// 対象ページの Search Console（表示・クリック・インデックス状態）と内部リンクの数（読み取りのみ）。usage: node scripts/gscTargets20261120.mjs id1 id2 ...
import fs from 'fs'; import os from 'os'; import path from 'path'; import crypto from 'crypto';
const ids = process.argv.slice(2); const OUT = 'logs/identity_20261120';
const keyPath = process.env.GSC_KEY_FILE || path.join(os.homedir(), '.config/morilab/gsc-key.json');
const key = JSON.parse(fs.readFileSync(keyPath, 'utf8')); const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const now = Math.floor(Date.now() / 1000);
const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: key.token_uri, iat: now, exp: now + 3000 })}`;
const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
const tj = await (await fetch(key.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) })).json(); const tok = tj.access_token;
const site = 'sc-domain:tabidokoiko.com'; const H = { authorization: `Bearer ${tok}`, 'content-type': 'application/json' };
const iso = (d) => d.toISOString().slice(0, 10); const end = iso(new Date(Date.now() - 2 * 864e5));
// 内部リンク: ビルド結果（dist）の全HTMLで /destinations/<id>/ への href を数える（自分のページを除く）
const files = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.html')) files.push(p); } }; walk('dist');
const html = files.map((f) => [f, fs.readFileSync(f, 'utf8')]);
const out = {};
for (const id of ids) {
  const url = `https://tabidokoiko.com/destinations/${encodeURIComponent(id)}/`; const r = { url };
  for (const [name, s] of [['累計', '2026-08-01'], ['直近28日', iso(new Date(Date.now() - 30 * 864e5))]]) {
    const j = await (await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { method: 'POST', headers: H, body: JSON.stringify({ startDate: s, endDate: end, dimensions: ['page'], dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: url }] }] }) })).json();
    const row = (j.rows || [])[0]; r[name] = row ? { 表示: row.impressions, クリック: row.clicks, 平均順位: +row.position.toFixed(1) } : { 表示: 0, クリック: 0 };
  }
  const ij = await (await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { method: 'POST', headers: H, body: JSON.stringify({ inspectionUrl: url, siteUrl: site, languageCode: 'ja' }) })).json();
  const ir = ij.inspectionResult?.indexStatusResult; r.インデックス = ir ? { 判定: ir.verdict, 状態: ir.coverageState, 最終クロール: ir.lastCrawlTime } : { エラー: JSON.stringify(ij).slice(0, 160) };
  const pats = [`/destinations/${id}/`, `/destinations/${encodeURIComponent(id)}/`]; let n = 0; const from = [];
  for (const [f, t] of html) { if (f.includes(`/destinations/${id}/`)) continue; if (pats.some((p) => t.includes(`href="${p}`) || t.includes(`href='${p}`))) { n++; if (from.length < 8) from.push(f.replace('dist/', '')); } }
  r.内部リンクの入る数 = n; r.内部リンク元の例 = from; out[id] = r; console.log(id, JSON.stringify({ 累計: r.累計, 直近28日: r.直近28日, イ: r.インデックス.状態 || r.インデックス.エラー, リンク: n }));
}
fs.writeFileSync(`${OUT}/gsc_targets.json`, JSON.stringify(out, null, 1));
