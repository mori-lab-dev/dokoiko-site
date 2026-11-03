#!/usr/bin/env node
/**
 * baseline.mjs — サイトの「ある日の状態」を同じ物差しで記録し、日付をまたいで比べられるようにする（2026-11-04）。
 *
 *   npm run baseline                      速い検査だけ（データ＋ビルド済みHTML。約20秒）→ logs/baseline/<今日>.md と .json
 *   npm run baseline:full                 上に加えて、外部へ実取得する検査（別枠・所要時間つき。30分前後）
 *   npm run baseline -- --diff 2026-11-01 2026-11-04     保存済みの2日分を並べて logs/baseline/diff_<A>_vs_<B>.md を作る
 *
 * 毎週1回 `npm run baseline:full` を回し、前回との差分表（diff_*.md）を見る運用。
 * 実行のたびに、直前の記録（無ければ何もしない）との差分表も自動で出す。
 *
 * 何もしないこと: サイトのコード・データ・設定を書き換えない／ビルドしない（--build を付けたときだけ）／デプロイしない。
 *   書くのは logs/baseline/ の下だけ。ただし中で呼ぶ既存の監査スクリプトは、それぞれ自分の logs/*.json を書き直す（従来どおり）。
 *
 * 過去の再現（11/1 時点を作ったときの手順）
 *   git worktree add --detach <別ディレクトリ> <その日以前の最後のコミット>
 *   cp -Rc node_modules <別ディレクトリ>/node_modules
 *   (cd <別ディレクトリ> && npm run build)
 *   node scripts/baseline.mjs --root <別ディレクトリ> --sync-scripts --date 2026-11-01 --out logs/baseline --label '再現'
 *   git worktree remove --force <別ディレクトリ>
 *   --sync-scripts は「今の検査スクリプト」を古いツリーへ上書きコピーする（当時無かった検査も使える）。
 *   --date は記録の日付、--asof は日付で状態が変わる検査（応援割の確認日の古さ）の基準日（既定は --date）。
 *   --live を付けない記録では、外部へ実取得する指標は「取得不可」（過去は再現できない）と書く。
 *
 * オプション
 *   --root DIR        測る対象のツリー（既定: このリポジトリ）
 *   --out DIR         出力先（既定: <root>/logs/baseline）
 *   --date YYYY-MM-DD 記録の日付（既定: 今日 JST）　--asof YYYY-MM-DD 基準日（既定: --date）
 *   --label TEXT      見出しに入れる注記　--live 外部へ実取得する検査も回す　--build 先に npm run build
 *   --sync-scripts    今の scripts/ を --root のツリーへ上書きコピーする（--root が別ツリーのとき）
 *
 * 各検査は scripts/auditAll.mjs と既存の監査スクリプトをそのまま呼ぶ（判定ロジックをここに書き写さない）。
 * ここで読むのは、それぞれの出力に出ている数字だけ。
 */
import fs from 'fs';
import path from 'path';
import { spawn, execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

const SELF = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d = null) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const jstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const ROOT = path.resolve(val('--root', SELF));
const OUT = path.resolve(val('--out', path.join(ROOT, 'logs/baseline')));
const DATE = val('--date', jstToday());
const ASOF = val('--asof', DATE);
const LABEL = val('--label', '');
const LIVE = has('--live');
fs.mkdirSync(path.join(OUT, 'raw'), { recursive: true });

// ── 指標の定義 ───────────────────────────────────────────────────────────
// better: lower=小さいほど良い / higher=大きいほど良い / none=増減に良し悪しは無い（件数など）
const GROUPS = {
  size: '規模', affiliate: 'アフィリエイトのリンク', charset: '楽天・じゃらん検索リンクの文字コードと0件', image: '画像',
  desc: 'description', links: '内部リンク', seo: '構造化データ・canonical・noindex・sitemap', ouen: '応援割ページ', data: 'データの整合',
};
const M = [];  // 出力順
const def = (key, group, label, better = 'lower', unit = '') => M.push({ key, group, label, better, unit });
def('dest_count', 'size', '目的地の件数', 'none');
def('featured_stay_count', 'size', 'featured_stay のある目的地', 'none');
def('ouen_schemes', 'size', '応援割の制度数', 'none');
def('ouen_pages', 'size', '応援割ページの数（制度ページ＋まとめ・九州ふっこう・鹿児島のエリア）', 'none');
def('qa_fail', 'data', 'データ整合 qa の FAIL', 'lower');
def('aff_id_bad', 'affiliate', 'アフィリID不正・欠落（パターン数）', 'lower');
def('aff_generic_rakuten', 'affiliate', '汎用トップ相当の楽天リンク（パターン数）', 'lower');
def('aff_no_rakuten', 'affiliate', '楽天リンクが無いページ', 'lower');
def('aff_no_jalan', 'affiliate', 'じゃらんリンクが無いページ', 'lower');
def('stay_wrapper_bad', 'affiliate', '宿リンク: ラッパー不備・素リンク', 'lower');
def('stay_app_launch', 'affiliate', '宿リンク: アプリ起動の恐れ', 'lower');
def('stay_featured_no_search', 'affiliate', '注目の宿の宿名検索が無い', 'lower');
def('stay_rentacar_bad', 'affiliate', 'レンタカーリンクの不備', 'lower');
def('jalan_not_allowed', 'affiliate', 'じゃらんリンク: 許可リスト外のURL（アプリ起動の防止）', 'lower');
def('stay_unique_links', 'affiliate', '一意な宿の検索リンク', 'none');
def('stay_charset_bad', 'charset', '検索語の文字コード不備（静的: Shift_JIS）', 'lower');
def('rakuten_app_launch', 'charset', '楽天リンクがアプリを起動する形（実取得）', 'lower', '', true);
def('live_rakuten_garbled', 'charset', '楽天: 検索語の文字化け（実取得）', 'lower', '', true);
def('live_jalan_garbled', 'charset', 'じゃらん: 検索語の文字化け（実取得）', 'lower', '', true);
def('live_rakuten_zero', 'charset', '楽天: 0件になるリンク（実取得）', 'lower', '', true);
def('live_jalan_zero', 'charset', 'じゃらん: 0件になるリンク（実取得）', 'lower', '', true);
def('live_rakuten_http', 'charset', '楽天: HTTP異常・輪・アプリ起動（実取得）', 'lower', '', true);
def('live_jalan_http', 'charset', 'じゃらん: HTTP異常・輪・アプリ起動（実取得）', 'lower', '', true);
def('live_unreadable', 'charset', '検索語が読めない（楽天＋じゃらん・実取得）', 'lower', '', true);
def('live_undecidable', 'charset', '判定不可（実取得で結論が出なかった数）', 'none', '', true);
def('img_hero_missing', 'image', 'ヒーロー画像が出ないページ', 'lower');
def('img_spot_missing', 'image', 'spot 画像だけ欠けているページ', 'lower');
def('img_credit_mismatch', 'image', 'spot 画像: クレジットのリンク先が実ファイルと不一致', 'lower');
def('img_credit_shared', 'image', '同じ写真（出典）を複数の目的地で共有（contamination F）', 'lower');
def('img_geo_conflict', 'image', '地理矛盾（contamination H）', 'lower');
def('contam_new', 'image', '他の目的地のデータ混入・新規検出', 'lower');
def('img_main_credit_ng', 'image', 'main 画像: 出典と画素が一致しない（実取得・毎回60件の抜き取り）', 'lower', '', true);
def('img_main_place_ng', 'image', 'main 画像: 所在地が別（Commons・毎回60件の抜き取り）', 'lower', '', true);
def('desc_total', 'desc', 'description の全件数', 'none');
def('desc_fail', 'desc', '新基準に落ちる件数', 'lower');
def('desc_pass_rate', 'desc', '新基準の通過率', 'higher', '%');
def('desc_ng_phrase', 'desc', '禁止句が残っている件数', 'lower');
def('desc_hedge', 'desc', '推測表現が残っている件数', 'lower');
def('links_avg', 'links', '他の旅先へのリンク平均（本）', 'higher');
def('links_min', 'links', '他の旅先へのリンク最少（本）', 'higher');
def('links_lt10', 'links', 'リンクが10本未満のページ', 'lower');
def('links_orphan', 'links', 'どこからもリンクされない孤立ページ', 'lower');
def('sd_bad', 'seo', '構造化データの不備（合計）', 'lower');
def('sd_lodging', 'seo', 'LodgingBusiness のあるページ', 'none');
def('idx_noindex', 'seo', 'noindex のページ', 'lower');
def('idx_stub', 'seo', '正規ページを隠す {id}.html スタブ', 'lower');
def('idx_sitemap_missing', 'seo', 'sitemap に無い destination', 'lower');
def('idx_sitemap_ghost', 'seo', 'sitemap にあるが実体が無い', 'lower');
def('idx_sitemap_noindex', 'seo', 'sitemap に載るのに noindex', 'lower');
def('idx_no_canonical', 'seo', 'canonical が無い', 'lower');
def('seo_meta_bad', 'seo', 'メタ description・タグ・ヒーロー alt の欠落と重複（合計）', 'lower');
def('ouen_expired_open', 'ouen', '終了日を過ぎても受付中・開始前のまま', 'lower');
def('ouen_started_soon', 'ouen', '開始日を過ぎても「まもなく」のまま', 'lower');
def('ouen_stale_check', 'ouen', '確認日が古い制度（14日より前）', 'lower');
def('ouen_max_age', 'ouen', '確認日からの最大経過日数', 'lower', '日');
def('ouen_official_bad', 'ouen', '公式リンクの不備', 'lower');
// live=true の指標は --live の記録にだけ入る。過去の再現では「取得不可」。

const LIVE_KEYS = new Set();
// def の6番目の引数（live）を後付けで拾う（上の def は5引数なので、live 指標の key をここで固定する）
for (const k of ['rakuten_app_launch', 'live_rakuten_garbled', 'live_jalan_garbled', 'live_rakuten_zero', 'live_jalan_zero', 'live_rakuten_http', 'live_jalan_http', 'live_unreadable', 'live_undecidable', 'img_main_credit_ng', 'img_main_place_ng']) LIVE_KEYS.add(k);

// ── 実行の道具 ───────────────────────────────────────────────────────────
const run = (cmd, timeoutSec = 600) => new Promise((resolve) => {
  const t0 = Date.now();
  const p = spawn(cmd[0], cmd.slice(1), { cwd: ROOT });
  let out = '';
  p.stdout.on('data', (b) => { out += b; }); p.stderr.on('data', (b) => { out += b; });
  const timer = setTimeout(() => { out += `\n打ち切り(${timeoutSec}秒)`; p.kill('SIGTERM'); }, timeoutSec * 1000);
  p.on('close', (code) => { clearTimeout(timer); resolve({ out, code, sec: (Date.now() - t0) / 1000 }); });
});
const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return '?'; } };
const num = (re, text) => { const m = text.match(re); return m ? Number(m[1].replace(/,/g, '')) : null; };

// ── 差分表（--diff A B） ───────────────────────────────────────────────
function loadRec(d) { return JSON.parse(fs.readFileSync(path.join(OUT, `${d}.json`), 'utf8')); }
function fmt(m) {
  if (!m) return '—';
  if (m.status === 'unavailable') return '取得不可';
  if (m.status === 'not-run') return '未実行';
  if (m.value == null) return '読み取れず';
  return `${typeof m.value === 'number' ? m.value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : m.value}${m.unit || ''}`;
}
function writeDiff(a, b) {
  const A = loadRec(a), B = loadRec(b);
  const L = [`# 差分表 ${a} → ${b}`, '',
    `- ${a}: コミット ${A.commit}（${A.commitDate}）　基準日 ${A.asof}　${A.label || ''}`,
    `- ${b}: コミット ${B.commit}（${B.commitDate}）　基準日 ${B.asof}　${B.label || ''}`,
    `- 増減の印: ▲悪化 ／ ▽改善 ／ ＝変化なし ／ 〜 件数の増減（良し悪しなし）／ 比較不可（片方が取得不可・未実行）`, ''];
  let changed = 0, comparable = 0, notComparable = 0;
  const rows = {};
  for (const m of M) {
    const x = A.metrics[m.key], y = B.metrics[m.key];
    let delta = '比較不可';
    if (x && y && typeof x.value === 'number' && typeof y.value === 'number' && x.status === 'ok' && y.status === 'ok') {
      comparable++;
      const d = Math.round((y.value - x.value) * 100) / 100;
      if (d === 0) delta = '＝';
      else { changed++; const s = (d > 0 ? '+' : '') + d; delta = m.better === 'none' ? `〜 ${s}` : ((d > 0) === (m.better === 'higher') ? `▽ ${s}` : `▲ ${s}`); }
    } else notComparable++;
    (rows[m.group] ||= []).push(`| ${m.label} | ${fmt(x)} | ${fmt(y)} | ${delta} |`);
  }
  L.push(`- 比較できた指標 ${comparable} 件のうち、変化があったのは ${changed} 件。比較不可 ${notComparable} 件。`, '');
  for (const [g, name] of Object.entries(GROUPS)) {
    if (!rows[g]) continue;
    L.push(`## ${name}`, '', `| 指標 | ${a} | ${b} | 増減 |`, '|---|---:|---:|---|', ...rows[g], '');
  }
  const la = (A.lanes || {}), lb = (B.lanes || {});
  L.push('## 所要時間', '', `| 検査 | ${a} | ${b} |`, '|---|---:|---:|');
  const ids = new Set([...Object.keys(la), ...Object.keys(lb)]);
  for (const id of ids) L.push(`| ${id} | ${la[id] != null ? la[id].toFixed(1) + '秒' : '—'} | ${lb[id] != null ? lb[id].toFixed(1) + '秒' : '—'} |`);
  L.push('');
  const p = path.join(OUT, `diff_${a}_vs_${b}.md`);
  fs.writeFileSync(p, L.join('\n'));
  return p;
}
if (has('--diff')) {
  const i = args.indexOf('--diff');
  console.log('→ ' + writeDiff(args[i + 1], args[i + 2]));
  process.exit(0);
}

// ── 測る ─────────────────────────────────────────────────────────────────
if (ROOT !== SELF && has('--sync-scripts')) {
  fs.cpSync(path.join(SELF, 'scripts'), path.join(ROOT, 'scripts'), { recursive: true, force: true });
  if (fs.existsSync(path.join(SELF, 'logs/audit_baseline.json')) && !fs.existsSync(path.join(ROOT, 'logs/audit_baseline.json'))) fs.copyFileSync(path.join(SELF, 'logs/audit_baseline.json'), path.join(ROOT, 'logs/audit_baseline.json'));
}
// 配信リポジトリ(../dokoiko)を読む検査がある。別ツリーのときは隣に同名の道を通す（読むだけ）
const deployDir = path.resolve(ROOT, '../dokoiko');
if (!fs.existsSync(deployDir)) fs.symlinkSync(path.resolve(SELF, '../dokoiko'), deployDir);
if (has('--build')) {
  const b = await run(['npm', 'run', 'build'], 900);
  if (b.code !== 0) { console.error(b.out.slice(-1500)); process.exit(1); }
}

const rec = { date: DATE, asof: ASOF, label: LABEL, root: ROOT === SELF ? '.' : ROOT, live: LIVE, metrics: {}, lanes: {}, notes: [] };
rec.commit = git('rev-parse', '--short', 'HEAD');
rec.commitDate = git('log', '-1', '--format=%ci');
rec.dirtySourceFiles = git('status', '--short', '--', 'src', 'public').split('\n').filter(Boolean).length;
rec.deployCommit = (() => { try { return execFileSync('git', ['-C', deployDir, 'log', '-1', '--format=%h %ci'], { encoding: 'utf8' }).trim(); } catch { return '?'; } })();
rec.deployDirty = (() => { try { return execFileSync('git', ['-C', deployDir, 'status', '--short'], { encoding: 'utf8' }).split('\n').filter(Boolean).length; } catch { return null; } })();
const distIdx = path.join(ROOT, 'dist/index.html');
rec.distBuiltAt = fs.existsSync(distIdx) ? new Date(fs.statSync(distIdx).mtimeMs).toISOString() : null;
{ // dist が src/data・src/pages より古いと、dist の検査は現状を見ていない
  let newest = 0;
  (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else newest = Math.max(newest, fs.statSync(p).mtimeMs); } })(path.join(ROOT, 'src'));
  rec.distStale = !fs.existsSync(distIdx) || fs.statSync(distIdx).mtimeMs < newest;
  if (rec.distStale) rec.notes.push('dist が src より古い、または無い。dist の検査は古いビルドを見ている（--build で作り直す）');
}
const set = (key, value, extra = {}) => { const m = M.find((x) => x.key === key); rec.metrics[key] = { label: m.label, group: m.group, better: m.better, unit: m.unit, value, status: value == null ? 'unreadable' : 'ok', ...extra }; };

function parseReport(file) {
  const t = fs.readFileSync(file, 'utf8');
  const inv = {}, sec = {}, status = {};
  for (const m of t.matchAll(/^- ([^:\n]+): ([0-9,]+|[^\n]*?)$/gm)) { if (['目的地', 'featured_stay あり', '画像クレジットあり', 'images が空'].includes(m[1])) inv[m[1]] = Number(String(m[2]).replace(/,/g, '')); }
  for (const m of t.matchAll(/^- (✅|❌) \*\*([\w-]+)\*\* — .*?（([0-9.]+)秒）/gm)) { sec[m[2]] = Number(m[3]); status[m[2]] = m[1] === '✅'; }
  const metrics = {};
  for (const blk of t.split(/^### /m).slice(1)) {
    const id = blk.split('\n')[0].trim();
    metrics[id] ||= {};  // 失敗した監査は末尾にも同じ見出しで出力が載る。最初の指標欄を消さない
    for (const m of blk.matchAll(/^- ([^\n]*?): ([0-9.,]+|読み取れず)　［/gm)) metrics[id][m[1]] = m[2] === '読み取れず' ? null : Number(m[2].replace(/,/g, ''));
  }
  return { inv, sec, status, metrics };
}

console.log(`■ baseline ${DATE}（基準日 ${ASOF}）  対象 ${ROOT}  コミット ${rec.commit} ${rec.commitDate}`);

// 1) 速い検査（auditAll の static + dist）
const rawFast = path.join(OUT, 'raw', `${DATE}_auditAll.md`);
const t0 = Date.now();
await run(['node', 'scripts/auditAll.mjs', '--today', ASOF, '--report', rawFast], 900);
rec.lanes.fast_total = (Date.now() - t0) / 1000;
if (!fs.existsSync(rawFast)) { console.error('auditAll のレポートが出なかった'); process.exit(1); }
const F = parseReport(rawFast);
Object.assign(rec.lanes, F.sec);
rec.auditStatus = F.status;
const g = (id, name) => F.metrics[id]?.[name] ?? null;
set('dest_count', F.inv['目的地'] ?? null);
set('featured_stay_count', F.inv['featured_stay あり'] ?? null);
set('qa_fail', g('qa', 'FAIL'));
set('aff_id_bad', g('affiliate', 'アフィリID不正・欠落')); set('aff_generic_rakuten', g('affiliate', '汎用トップ相当の楽天リンク'));
set('aff_no_rakuten', g('affiliate', '楽天リンクが無いページ')); set('aff_no_jalan', g('affiliate', 'じゃらんリンクが無いページ'));
set('stay_wrapper_bad', g('stay-links', 'ラッパー不備・素リンク')); set('stay_app_launch', g('stay-links', 'アプリ起動の恐れ'));
set('stay_featured_no_search', g('stay-links', '注目の宿の宿名検索なし')); set('stay_rentacar_bad', g('stay-links', 'レンタカー不備'));
set('stay_charset_bad', g('stay-links', '検索語の文字コード不備')); set('stay_unique_links', g('stay-links', '一意な検索リンク'));
set('jalan_not_allowed', g('jalan-app-links', '許可リスト外のURL'));
set('img_hero_missing', g('missing-images', 'ヒーロー画像が出ないページ')); set('img_spot_missing', g('missing-images', 'spot画像だけ欠けているページ'));
set('img_credit_mismatch', g('spot-credits', 'クレジット不一致'));
set('img_credit_shared', g('contamination', '画像出典の共有(F)')); set('img_geo_conflict', g('contamination', '地理矛盾(H)')); set('contam_new', g('contamination', '新規検出'));
const dTotal = g('desc', '全件数'), dFail = g('desc', '基準に落ちる件数');
set('desc_total', dTotal); set('desc_fail', dFail);
set('desc_pass_rate', dTotal ? Math.round((dTotal - dFail) / dTotal * 1000) / 10 : null, { unit: '%' });
set('links_avg', g('internal-links', '他の旅先へのリンク平均')); set('links_lt10', g('internal-links', 'リンクが10本未満のページ')); set('links_orphan', g('internal-links', 'どこからもリンクされない孤立ページ'));
set('sd_bad', g('structured-data', '構造化データの不備（合計）')); set('sd_lodging', g('structured-data', 'LodgingBusiness のあるページ'));
set('idx_noindex', g('indexability', 'noindex のページ')); set('idx_stub', g('indexability', '正規ページを隠すスタブ'));
set('idx_sitemap_missing', g('indexability', 'sitemapに無い destination')); set('idx_sitemap_ghost', g('indexability', 'sitemapにあるが実体が無い'));
set('idx_sitemap_noindex', g('indexability', 'sitemapに載るのに noindex')); set('idx_no_canonical', g('indexability', 'canonical が無い'));
set('seo_meta_bad', g('seo', '欠落・重複の合計'));
set('ouen_expired_open', g('ouen-wari', '終了日を過ぎても受付中のまま')); set('ouen_started_soon', g('ouen-wari', '開始日を過ぎても「まもなく」のまま'));
set('ouen_stale_check', g('ouen-wari', '確認日が古い')); set('ouen_official_bad', g('ouen-wari', '公式リンクの不備'));

// 2) auditAll の指標に無い数字（既存スクリプトの出力から読む）
const dsc = await run(['node', 'scripts/descStyleCheck.mjs']);
rec.lanes['desc(禁止句)'] = dsc.sec;
const ind = dsc.out.split('\n').filter((l) => /^\s+\S/.test(l));
set('desc_ng_phrase', ind.filter((l) => l.includes('禁止句')).length);
set('desc_hedge', ind.filter((l) => l.includes('推測表現')).length);
const il = await run(['node', 'scripts/auditInternalLinks.mjs']);
set('links_min', num(/最少\s*([0-9]+)本/, il.out));

// 3) 応援割（制度数・ページ数・確認日の古さ）
try {
  const { SCHEMES } = await import(pathToFileURL(path.join(ROOT, 'src/data/ouenWari.ts')).href);
  set('ouen_schemes', SCHEMES.length);
  const pages = new Set();
  for (const dir of ['ouen-wari', 'kyushu-fukko', ...SCHEMES.map((s) => s.slug)]) {
    (function walk(d) { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (e.name === 'index.html') pages.add(path.relative(path.join(ROOT, 'dist'), p)); } })(path.join(ROOT, 'dist', dir));
  }
  set('ouen_pages', pages.size);
  const iso = (ja) => { const m = String(ja).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null; };
  const ages = SCHEMES.map((s) => (iso(s.checked) ? Math.round((Date.parse(ASOF) - Date.parse(iso(s.checked))) / 86400000) : null));
  set('ouen_max_age', ages.includes(null) ? null : Math.max(...ages), { unit: '日' });
  rec.ouenSchemes = SCHEMES.map((s, i) => ({ slug: s.slug, status: s.status, checked: s.checked, ageDays: ages[i] }));
} catch (e) { rec.notes.push(`応援割データを読めなかった: ${e.message}`); set('ouen_schemes', null); set('ouen_pages', null); set('ouen_max_age', null); }

// 4) 別枠: 外部へ実取得する検査
const LIVE_REASON = '本番サイト・楽天・じゃらん・Wikimedia Commons など外部への実取得が要る。過去の時点は再現できない';
if (LIVE) {
  const rawLive = path.join(OUT, 'raw', `${DATE}_auditAll_live.md`);
  console.log('▶ 別枠（外部へ実取得）… 長い');
  const tl = Date.now();
  await run(['node', 'scripts/auditAll.mjs', '--only', 'rakuten-app-links,stay-links-live,pref-box,main-images', '--today', ASOF, '--report', rawLive], 6000);
  rec.lanes.live_total = (Date.now() - tl) / 1000;
  if (fs.existsSync(rawLive)) {
    const Lv = parseReport(rawLive);
    for (const id of ['rakuten-app-links', 'stay-links-live', 'pref-box', 'main-images']) if (Lv.sec[id] != null) rec.lanes[id] = Lv.sec[id];
    const lg = (id, n) => Lv.metrics[id]?.[n] ?? null;
    set('rakuten_app_launch', lg('rakuten-app-links', 'アプリを起動する形'));
    set('live_rakuten_garbled', lg('stay-links-live', '楽天: 文字化け')); set('live_jalan_garbled', lg('stay-links-live', 'じゃらん: 文字化け'));
    set('live_rakuten_zero', lg('stay-links-live', '楽天: 0件')); set('live_jalan_zero', lg('stay-links-live', 'じゃらん: 0件'));
    set('live_rakuten_http', lg('stay-links-live', '楽天: HTTP異常・輪・アプリ起動')); set('live_jalan_http', lg('stay-links-live', 'じゃらん: HTTP異常・輪・アプリ起動'));
    set('live_unreadable', (lg('stay-links-live', '楽天: 検索語が読めない') ?? 0) + (lg('stay-links-live', 'じゃらん: 検索語が読めない') ?? 0));
    set('live_undecidable', lg('stay-links-live', '判定不可'));
    set('img_main_credit_ng', lg('main-images', '出典と画素が一致しない')); set('img_main_place_ng', lg('main-images', '所在地が別'));
    rec.liveStatus = Lv.status;
  } else rec.notes.push('別枠のレポートが出なかった');
}
for (const m of M) {
  if (rec.metrics[m.key] && rec.metrics[m.key].status !== 'unreadable') continue;
  if (LIVE_KEYS.has(m.key)) {
    rec.metrics[m.key] = { label: m.label, group: m.group, better: m.better, unit: m.unit, value: null, status: LIVE ? 'unreadable' : (ROOT !== SELF || DATE !== jstToday() ? 'unavailable' : 'not-run'), reason: LIVE ? '出力から読み取れなかった' : (ROOT !== SELF || DATE !== jstToday() ? LIVE_REASON : '--live を付けていない（npm run baseline:full）') };
  } else if (!rec.metrics[m.key]) rec.metrics[m.key] = { label: m.label, group: m.group, better: m.better, unit: m.unit, value: null, status: 'unreadable', reason: '出力から読み取れなかった' };
}

// ── 書く ─────────────────────────────────────────────────────────────────
const L = [`# サイトの状態記録 ${DATE}`, ''];
L.push(`- 対象: コミット ${rec.commit}（${rec.commitDate}）${rec.root === '.' ? '' : '　※別ツリーに取り出して再現'}　未コミットの変更（src・public）${rec.dirtySourceFiles} 件`);
L.push(`- 基準日（日付で状態が変わる検査の「今日」）: ${ASOF}${LABEL ? `　／　${LABEL}` : ''}`);
L.push(`- 配信リポジトリ(../dokoiko): ${rec.deployCommit}　未コミット ${rec.deployDirty ?? '?'} 件　（noindex・スタブ・sitemap・canonical の検査はここを読む）`);
L.push(`- ビルド済み dist: ${rec.distBuiltAt ?? 'なし'}${rec.distStale ? '　⚠ src より古い' : ''}`);
L.push(`- 外部へ実取得する検査: ${LIVE ? '実行した（下の別枠）' : '実行していない'}`);
for (const n of rec.notes) L.push(`- ⚠ ${n}`);
L.push('', '指標の「取得不可」は、その時点を再現できない（外部への実取得が要る）もの。「未実行」は今回回していないだけのもの。', '');
for (const [gk, name] of Object.entries(GROUPS)) {
  const ms = M.filter((m) => m.group === gk);
  L.push(`## ${name}`, '', '| 指標 | 値 | 備考 |', '|---|---:|---|');
  for (const m of ms) { const r = rec.metrics[m.key]; L.push(`| ${m.label} | ${fmt(r)} | ${r.reason ?? ''} |`); }
  L.push('');
}
L.push('## 所要時間', '', '| 検査 | 秒 |', '|---|---:|');
for (const [k, v] of Object.entries(rec.lanes)) L.push(`| ${k}${['rakuten-app-links', 'stay-links-live', 'pref-box', 'main-images', 'live_total'].includes(k) ? '（別枠・外部へ実取得）' : ''} | ${v.toFixed(1)} |`);
L.push('', '## 記録のしかた', '', '- `npm run baseline`（速い検査）／`npm run baseline:full`（別枠も）。毎週1回 full を回し、`diff_*.md` で前回と比べる。',
  '- 生の監査レポートは `raw/` に残る。main 画像の照合は毎回60件ずつ巡回する抜き取りなので、週ごとに見る目的地が違う（値の増減は目的地の入れ替わりを含む）。', '');
fs.writeFileSync(path.join(OUT, `${DATE}.md`), L.join('\n'));
fs.writeFileSync(path.join(OUT, `${DATE}.json`), JSON.stringify(rec, null, 1) + '\n');
console.log(`→ ${path.join(OUT, DATE + '.md')}`);

// 直前の記録との差分表
const prev = fs.readdirSync(OUT).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).filter((d) => d < DATE).sort().pop();
if (prev) console.log(`→ ${writeDiff(prev, DATE)}`);
