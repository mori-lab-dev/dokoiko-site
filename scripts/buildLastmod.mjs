// sitemap の lastmod を、実際の更新日（git の履歴）から作る（2026-11-04）。
//  旅先ページ: destinations.json の「そのページの項目」が最後に変わったコミット日、
//             または public/images/<id>/・public/images/spots/<id>/ の画像が最後に変わったコミット日の新しい方。
//             （テンプレートやCSSだけの変更は、内容の更新ではないので数えない）
//  固定ページ: そのページのファイル（src/pages/*.astro）が最後に変わったコミット日。
//  特設ページ(応援割): SCHEMES 内の「確認日(checked)」のうち最新のもの。
//  日付が出せないページ（ハブなど）は載せない。推測で埋めない。
// 出力: src/data/lastmod.json    使い方: node scripts/buildLastmod.mjs [--check]
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (args, opts = {}) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30, env: { ...process.env, TZ: 'Asia/Tokyo' }, ...opts });
const FMT = '--date=format-local:%Y-%m-%d';

// 1) 旅先: 各コミット時点の destinations.json を順に読み、項目のハッシュが変わった日を記録
const commits = git(['log', '--reverse', '--format=%H %ad', FMT, '--', 'src/data/destinations.json']).trim().split('\n').map((l) => l.split(' '));
const hashOf = (o) => crypto.createHash('md5').update(JSON.stringify(o)).digest('hex');
const prev = new Map(); const changed = {};
for (const [h, date] of commits) {
  let arr; try { arr = JSON.parse(git(['show', `${h}:src/data/destinations.json`])); } catch { continue; }
  for (const d of arr) { const k = hashOf(d); if (prev.get(d.id) !== k) { prev.set(d.id, k); changed[d.id] = date; } }
}
// 2) 画像: パスごとの最終コミット日（1回の走査）
const imgDate = {};
const log = git(['log', '--name-only', '--format=@%ad', FMT, '--', 'public/images']).split('\n');
let cur = '';
for (const line of log) {
  if (line.startsWith('@')) { cur = line.slice(1); continue; }
  const m = line.match(/^public\/images\/(?:spots\/)?([^/]+)\//);
  if (m && cur && (!imgDate[m[1]] || cur > imgDate[m[1]])) imgDate[m[1]] = cur;
}
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const out = { destinations: {}, pages: {} };
for (const d of dests) {
  const a = changed[d.id], b = imgDate[d.id];
  const best = [a, b].filter(Boolean).sort().at(-1);
  if (best) out.destinations[d.id] = best;
}
// 3) 固定ページ
const lastCommit = (rel) => git(['log', '-1', '--format=%ad', FMT, '--', rel]).trim();
for (const [url, rel] of Object.entries({ '/about/': 'src/pages/about.astro', '/contact/': 'src/pages/contact.astro', '/privacy/': 'src/pages/privacy.astro', '/terms/': 'src/pages/terms.astro' })) {
  const d = lastCommit(rel); if (d) out.pages[url] = d;
}
// 4) 応援割: 制度ごとの最新の確認日
//    2026-11-17 修正: 以前は ouenWari.ts 全体の最大の確認日（単引用符のものだけ）を全9ページに付けていたため、共通事項（PARENT_FACTS）の確認日を
//    更新しただけで、内容を取り直していない県ページにも同じ日が付いた。二重引用符の日付（11/10 の更新）も数えられていなかった。
//    今は、各制度のブロック（slug の行から次の slug の行まで）の中の確認日（単引用符・二重引用符を問わない）の最大を、その制度のページに付ける。
//    /ouen-wari/（一覧）は、共通事項と全制度の確認日の最大。変更前の版: logs/ouen_cleanup_20261117/buildLastmod.mjs.before
const src = fs.readFileSync(path.join(root, 'src/data/ouenWari.ts'), 'utf8');
const toIso = (s) => { const m = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
const maxChecked = (text) => [...text.matchAll(/checked:\s*(['"])([^'"]+)\1/g)].map((m) => toIso(m[2])).filter(Boolean).sort().at(-1);
const schemesAt = src.indexOf('export const SCHEMES');
const parentAt = src.indexOf('export const PARENT_FACTS');
const marks = [...src.matchAll(/^ {4}slug:\s*'([^']+)'/gm)].filter((m) => m.index > schemesAt).map((m) => ({ slug: m[1], at: m.index }));
const perScheme = {};
marks.forEach((mk, i) => { perScheme[mk.slug] = maxChecked(src.slice(mk.at, i + 1 < marks.length ? marks[i + 1].at : src.length)); });
const parentMax = maxChecked(src.slice(parentAt, schemesAt));
const hubMax = [parentMax, ...Object.values(perScheme)].filter(Boolean).sort().at(-1);
if (hubMax) out.pages['/ouen-wari/'] = hubMax;
for (const [slug, d] of Object.entries(perScheme)) if (d) out.pages[`/${slug}/`] = d;
// 5) 一覧ページ: 旅先の最新更新日
const latest = Object.values(out.destinations).sort().at(-1);
if (latest) out.pages['/destinations/'] = latest;
out.generatedFrom = 'git log (JST). destinations=項目のハッシュ変化日と画像の最終コミット日の新しい方 / pages=ファイルの最終コミット日・制度の最新確認日';

const file = path.join(root, 'src/data/lastmod.json');
const text = JSON.stringify(out, null, 1) + '\n';
if (process.argv.includes('--check')) { console.log(fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text ? '最新' : '古い（node scripts/buildLastmod.mjs で更新）'); process.exit(0); }
fs.writeFileSync(file, text);
const vals = Object.values(out.destinations);
console.log(`旅先 ${vals.length}/${dests.length} 件に日付 / 固定・特設 ${Object.keys(out.pages).length} 件`);
const hist = {}; for (const v of vals) hist[v] = (hist[v] ?? 0) + 1;
console.log('日付ごとの件数（上位）:', Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join(' '));
console.log('最古', vals.sort()[0], '最新', vals.sort().at(-1));
