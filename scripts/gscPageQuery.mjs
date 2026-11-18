// Search Console の「ページ × 検索語」を取る（2026-11-18）。読み取りのみ。サイトのファイルは変えない。統合の調査（logs/merge_20261118/）用。
//   usage: node scripts/gscPageQuery.mjs   出力: logs/merge_20261118/gsc_page_query_<期間>.json・gsc_page_<期間>.json
//   期間: 直近28日（取れる最新の日まで）と、公開からの累計（2026-08-01〜）。認証は scripts/gsc.mjs と同じ（~/.config/morilab/gsc-key.json）。キーの中身は出力しない。
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
const OUT = 'logs/merge_20261118'; fs.mkdirSync(OUT, { recursive: true });
const keyPath = process.env.GSC_KEY_FILE || path.join(os.homedir(), '.config/morilab/gsc-key.json');
let token = null;
async function accessToken() {
  if (token) return token;
  const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: key.token_uri, iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  const r = await fetch(key.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
  const j = await r.json(); if (!r.ok) throw new Error('token ' + r.status); token = j.access_token; return token;
}
async function q(site, body) {
  const rows = [];
  for (let start = 0; ; start += 25000) {
    let j;
    for (let i = 0; i < 5; i++) {
      const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { method: 'POST', headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' }, body: JSON.stringify({ ...body, rowLimit: 25000, startRow: start, type: 'web' }) });
      if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 2000 * 2 ** i)); continue; }
      j = await r.json(); if (!r.ok) throw new Error('query ' + r.status); break;
    }
    rows.push(...(j.rows || [])); if ((j.rows || []).length < 25000) break;
  }
  return rows;
}
const site = 'sc-domain:tabidokoiko.com';
// 取れる最新の日を探す（日付ごとの表示がある最後の日）
const today = new Date(); const iso = (d) => d.toISOString().slice(0, 10);
const daily = await q(site, { startDate: iso(new Date(today - 10 * 864e5)), endDate: iso(today), dimensions: ['date'] });
const last = daily.map((r) => r.keys[0]).sort().pop();
const start28 = iso(new Date(new Date(last) - 27 * 864e5));
const windows = { '直近28日': [start28, last], '累計': ['2026-08-01', last] };
const meta = { 取得日: iso(today), 最新の日: last, 期間: windows };
for (const [name, [s, e]] of Object.entries(windows)) {
  const pq = await q(site, { startDate: s, endDate: e, dimensions: ['page', 'query'] });
  const pg = await q(site, { startDate: s, endDate: e, dimensions: ['page'] });
  fs.writeFileSync(`${OUT}/gsc_page_query_${name}.json`, JSON.stringify(pq.map((r) => ({ page: r.keys[0], query: r.keys[1], clicks: r.clicks, impressions: r.impressions, position: +r.position.toFixed(1) }))));
  fs.writeFileSync(`${OUT}/gsc_page_${name}.json`, JSON.stringify(pg.map((r) => ({ page: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: +r.position.toFixed(1) }))));
  console.log(name, s, '〜', e, 'ページ×検索語', pq.length, '行 / ページ', pg.length);
}
fs.writeFileSync(`${OUT}/gsc_meta.json`, JSON.stringify(meta, null, 1));
