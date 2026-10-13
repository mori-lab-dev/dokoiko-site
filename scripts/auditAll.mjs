#!/usr/bin/env node
/**
 * auditAll.mjs — 既存の監査スクリプト群を1コマンドで回し、結果を logs/audit_report_<日付>.md に残す（2026-10-13）。
 *
 *   npm run audit:all                 静的（データだけ）＋ dist（ビルド済みHTML）の監査。ネットワーク不要・約15秒
 *   npm run audit:all -- --live       上に加えて、ネットワークを使う監査（楽天リンクの全段追跡・県境・宿リンク・main画像の抜き取り）
 *   npm run audit:all -- --build      先に npm run build してから dist の監査をする（dist が古いときに）
 *   npm run audit:all -- --only qa,desc,indexability     指定した監査だけ
 *   npm run audit:all -- --update-baseline               今回の指標をベースラインとして固定する（改善を確定させるとき）
 *   npm run audit:all -- --list                          監査の一覧
 *
 * 判定のしかた（指標ごと）
 *   zero    … 0 でなければ失敗（noindex・アフィリID欠落・クレジット不一致など、1件でもあってはならないもの）
 *   ratchet … ベースライン（logs/audit_baseline.json）より悪化したら失敗。同じか改善なら合格。
 *             既知の問題（座標重複・同名ペア・画像の欠け など）を抱えたまま、**新しく増えたものだけ**を止めるための仕組み
 *   info    … 参考値。合否に影響しない
 * 監査スクリプト自体が非0で終わった・出力が読めなかったときも失敗（スクリプトが壊れて黙って通るのを防ぐ）。
 * 終了コード: 失敗が1つでもあれば 1。
 *
 * 各監査は元のスクリプトをそのまま子プロセスで呼ぶ（ここに判定ロジックを書き写さない）。
 */
import fs from 'fs';
import path from 'path';
import { spawn, execFileSync } from 'child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.chdir(ROOT);
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => (args.includes(f) ? args[args.indexOf(f) + 1] : null);
const BASELINE = 'logs/audit_baseline.json';
const DATE = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD（ローカル日付）

const num = (re, text, d = null) => { const m = text.match(re); return m ? Number(m[1].replace(/,/g, '')) : d; };
const count = (re, text) => (text.match(re) || []).length;
const Z = (value) => ({ value, mode: 'zero' });
const R = (value) => ({ value, mode: 'ratchet' });
const I = (value) => ({ value, mode: 'info' });

/** 監査の一覧。tier: static=データだけ / dist=ビルド済みHTML / live=ネットワーク */
const AUDITS = [
  { id: 'qa', tier: 'static', title: 'データの整合（hub・stayAllowed・travelTime 等 17,000項目）',
    cmd: ['node', 'scripts/qa.js'],
    parse: (o) => ({ 'FAIL': Z(num(/FAIL:\s*(\d+)/, o)), 'PASS': I(num(/PASS:\s*(\d+)/, o)) }) },
  { id: 'desc', tier: 'static', title: 'description が新基準（禁止句・五感・数値・文長・字数）を満たすか',
    cmd: ['node', 'scripts/descStyleCheck.mjs'],
    parse: (o) => { const p = num(/通過\s*(\d+)\s*\/\s*\d+/, o), t = num(/通過\s*\d+\s*\/\s*(\d+)/, o);
      return { '基準に落ちる件数': R(p == null ? null : t - p), '全件数': I(t) }; } },
  { id: 'seo', tier: 'static', title: 'メタ description・タグ・ヒーロー alt の欠落と重複',
    cmd: ['node', 'scripts/auditSeoLinks.mjs'],
    parse: (o) => { let j; try { j = JSON.parse(o.slice(o.indexOf('{'), o.lastIndexOf('}') + 1)); } catch { return {}; }
      const sum = ['metaEmptyOrGeneric', 'descMissing', 'descShort', 'metaDuplicateGroups', 'tagsZero', 'reasonChipsZero', 'heroAltGeneric_noMainSpot']
        .reduce((a, k) => a + (j[k] || 0), 0);
      return { '欠落・重複の合計': Z(sum) }; } },
  { id: 'missing-images', tier: 'static', title: '宣言した画像の実体があるか（ヒーロー画像が出ないページ）',
    cmd: ['node', 'scripts/auditMissingImages.mjs'],
    parse: (o) => ({ 'ヒーロー画像が出ないページ': R(num(/うちページにヒーロー画像が出ない\s*(\d+)/, o)),
      'spot画像だけ欠けているページ': R(num(/うちspot画像だけが欠けている\s*(\d+)/, o)) }) },
  { id: 'same-name-stay', tier: 'static', title: '同名異所の混同・離島タグ・滞在日数の妥当性',
    cmd: ['node', 'scripts/auditSameNameStay.mjs'],
    parse: (o) => ({ '確度high': R(count(/^\[high\]/gm, o)), '確度mid': R(count(/^\[mid\]/gm, o)) }) },
  { id: 'duplicates', tier: 'static', title: '座標・名称の重複 destination',
    cmd: ['node', 'scripts/detectDuplicates.js'],
    parse: (o) => ({ '座標重複': R(num(/座標重複:\s*(\d+)件/, o, 0)), '名称の重複・包含': R(num(/計\s*(\d+)件/, o, 0)) }) },
  { id: 'contamination', tier: 'static', title: '他 destination のデータ混入（hotelArea・鉄道会社・駅・画像出典の共有・地理矛盾）',
    cmd: ['node', 'scripts/auditContamination2.mjs'],
    parse: (o) => ({ '新規検出': R(num(/新規検出\s*(\d+)\s*件/, o)),
      '画像出典の共有(F)': R(num(/F:credit共有=(\d+)/, o, 0)), '地理矛盾(H)': R(num(/H:地理矛盾=(\d+)/, o, 0)) }) },

  { id: 'ouen-wari', tier: 'static', title: '応援割の表示が日付に対して古くなっていないか（終了日・開始日・確認日・公式リンク）',
    cmd: ['node', 'scripts/auditOuenWari.mjs'], exitMeansFail: true,
    parse: (o) => ({ '終了日を過ぎても受付中のまま': Z(num(/終了日を過ぎているのに受付中・開始前のまま:\s*(\d+)件/, o)),
      '開始日を過ぎても「まもなく」のまま': Z(num(/開始日を過ぎているのに「まもなく」のまま:\s*(\d+)件/, o)),
      '確認日が古い': Z(num(/確認日が\d+日より古い:\s*(\d+)件/, o)),
      '公式リンクの不備': Z(num(/公式リンクが無い・https でない:\s*(\d+)件/, o)) }) },

  { id: 'structured-data', tier: 'dist', title: '構造化データ（TouristAttraction・LodgingBusiness・BreadcrumbList）が画面の内容と合っているか',
    cmd: ['node', 'scripts/auditStructuredData.mjs'], exitMeansFail: true,
    parse: (o) => { const ns = [...o.matchAll(/^[^\n:]+:\s*(\d+)件/gm)].map((m) => Number(m[1]));
      return { '構造化データの不備（合計）': Z(ns.length >= 7 ? ns.reduce((a, b) => a + b, 0) : null), 'LodgingBusiness のあるページ': I(num(/LodgingBusiness あり (\d+) 件/, o)) }; } },
  { id: 'internal-links', tier: 'dist', title: '旅先ページどうしの内部リンク（少ないページ・孤立ページ）',
    cmd: ['node', 'scripts/auditInternalLinks.mjs'],
    parse: (o) => ({ 'リンクが10本未満のページ': Z(num(/リンクが\d+本未満のページ:\s*(\d+)件/, o)),
      'どこからもリンクされない孤立ページ': Z(num(/孤立）:\s*(\d+)件/, o)),
      '他の旅先へのリンク平均': I(num(/平均\s*([0-9.]+)本/, o)) }) },

  { id: 'indexability', tier: 'dist', title: '検索に載るか（noindex・{id}.html スタブ・sitemap・canonical）',
    cmd: ['node', 'scripts/auditIndexability.mjs'],
    parse: (o) => ({ 'noindex のページ': Z(num(/noindex が付いているページ:\s*(\d+)/, o)),
      '正規ページを隠すスタブ': Z(num(/正規ページを隠しているもの:\s*(\d+)/, o)),
      'sitemapに無い destination': Z(num(/sitemapに無いdestination:\s*(\d+)/, o)),
      'sitemapにあるが実体が無い': Z(num(/sitemapにあるが実体が無い:\s*(\d+)/, o)),
      'sitemapに載るのに noindex': Z(num(/sitemapに載っているのにnoindex:\s*(\d+)/, o)),
      'canonical が無い': Z(num(/canonicalが無い\s*(\d+)/, o)) }) },
  { id: 'jalan-app-links', tier: 'dist', title: 'じゃらんリンクが許可リスト形式だけか（アプリ起動の防止）',
    cmd: ['node', 'scripts/auditJalanAppLinks.mjs', '--dist'],
    parse: (o) => ({ '許可リスト外のURL': Z(num(/許可リスト外のユニークURL:\s*(\d+)/, o)) }) },
  { id: 'affiliate', tier: 'dist', title: 'アフィリリンクの形式とID（楽天・じゃらん）',
    cmd: ['node', 'scripts/auditAffiliate.mjs'],
    parse: (o) => ({ 'アフィリID不正・欠落': Z(count(/^\s*[1-9]\d*\s*件\s+❌ アフィリID不正/gm, o)),
      '汎用トップ相当の楽天リンク': Z(count(/^\s*[1-9]\d*\s*件\s+⚠️ 汎用トップ相当/gm, o)),
      '楽天リンクが無いページ': R(num(/楽天リンクが無いページ:\s*(\d+)/, o, 0)),
      'じゃらんリンクが無いページ': R(num(/じゃらんリンクが無いページ:\s*(\d+)/, o, 0)) }) },
  { id: 'stay-links', tier: 'dist', title: '宿の検索リンク全件: ラッパー・アプリ起動・検索語の文字コード（Shift_JIS）・注目の宿・レンタカー',
    cmd: ['node', 'scripts/auditStayLinksFull.mjs', '--out', 'logs/stay_links_static.json'], exitMeansFail: true,
    parse: (o) => ({ 'ラッパー不備・素リンク': Z(num(/S1 ラッパー不備・素リンク:\s*(\d+)/, o)), 'アプリ起動の恐れ': Z(num(/S2 アプリ起動の恐れ:\s*(\d+)/, o)),
      '検索語の文字コード不備': Z(num(/S3 文字コード不備:\s*(\d+)/, o)), '注目の宿の宿名検索なし': Z(num(/S4 注目の宿の宿名検索が無い:\s*(\d+)/, o)),
      'レンタカー不備': Z(num(/S5 レンタカー不備:\s*(\d+)/, o)), '一意な検索リンク': I(num(/一意な検索リンク\s*(\d+)/, o)) }) },
  { id: 'spot-credits', tier: 'dist', title: 'spot 画像のクレジットが実ファイルと一致するか',
    cmd: ['node', 'scripts/verifySpotCredits.mjs'],
    parse: (o) => ({ 'クレジット不一致': Z(num(/リンク先が画像と不一致\s+(\d+)/, o)) }) },

  { id: 'rakuten-app-links', tier: 'live', title: '楽天リンクが楽天アプリを起動しないか（リダイレクト全段を AASA と照合）',
    cmd: ['node', 'scripts/auditRakutenAppLinks.mjs'], timeout: 600,
    parse: (o) => ({ 'アプリを起動する形': Z(num(/アプリを起動する形\s*(\d+)\s*\//, o)), '追跡した形の数': I(num(/アプリを起動する形\s*\d+\s*\/\s*(\d+)/, o)) }), exitMeansFail: true },
  { id: 'stay-links-live', tier: 'live', title: '宿の検索リンクを全件実取得: 検索語の読まれ方（文字化け）・リダイレクト・アプリ起動・0件',
    cmd: ['node', 'scripts/auditStayLinksFull.mjs', '--live', '--fresh', '--conc', '4', '--delay', '600', '--out', 'logs/stay_links_full.json'], timeout: 3600, exitMeansFail: true,
    parse: (o) => { const g = (site, label) => num(new RegExp(`${site}\\s+一意 \\d+本[^\\n]*?${label}\\s*(\\d+)`), o);
      return { '楽天: 文字化け': Z(g('楽天', '文字化け')), 'じゃらん: 文字化け': Z(g('じゃらん', '文字化け')),
        '楽天: HTTP異常・輪・アプリ起動': Z((g('楽天', 'HTTP異常') || 0) + (g('楽天', '輪') || 0) + (g('楽天', 'アプリ起動の恐れ') || 0)),
        'じゃらん: HTTP異常・輪・アプリ起動': Z((g('じゃらん', 'HTTP異常') || 0) + (g('じゃらん', '輪') || 0) + (g('じゃらん', 'アプリ起動の恐れ') || 0)),
        '楽天: 検索語が読めない': Z(g('楽天', '検索語が読めない')), 'じゃらん: 検索語が読めない': Z(g('じゃらん', '検索語が読めない')),
        '楽天: 0件': R(g('楽天', '0件')), 'じゃらん: 0件': R(g('じゃらん', '0件')), '判定不可': I((g('楽天', '判定不可') || 0) + (g('じゃらん', '判定不可') || 0)) }; } },
  { id: 'pref-box', tier: 'live', title: '座標が宣言した都道府県に入っているか（国土地理院の逆ジオコーディング）',
    cmd: ['node', 'scripts/auditAllPrefBox.mjs', '--out', 'logs/pref_box_audit_latest.json'], timeout: 1500,
    parse: (o) => ({ '県が違う座標': R(num(/県が違う\s*(\d+)\s*件/, o)), '引けなかった座標': I(num(/引けなかった\s*(\d+)\s*件/, o)) }) },
  { id: 'main-images', tier: 'live', title: 'main 画像と出典の照合（画素・所在地）。毎回60件ずつ巡回して全件を一周する',
    cmd: () => { const total = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')).length; const step = 60;
      const skip = (Math.floor(Date.now() / 86400000) * step) % total;
      return ['node', 'scripts/auditDestMainImages.mjs', '--skip', String(skip), '--limit', String(step), '--out', 'logs/dest_image_audit_sample.json']; },
    timeout: 900,
    parse: (o) => ({ '出典と画素が一致しない': R(num(/credit-mismatch\s+(\d+)/, o, 0)), '所在地が別': R(num(/place-ng\s+(\d+)/, o, 0)) }) },
];

if (has('--list')) {
  for (const a of AUDITS) console.log(`${a.tier.padEnd(7)} ${a.id.padEnd(18)} ${a.title}`);
  process.exit(0);
}

// ── 実行 ──────────────────────────────────────────────────────────────
const only = val('--only') ? new Set(val('--only').split(',')) : null;
const tiers = new Set(['static', 'dist', ...(has('--live') ? ['live'] : [])]);
const selected = AUDITS.filter((a) => (only ? only.has(a.id) : tiers.has(a.tier)));
if (!selected.length) { console.error('対象の監査が無い（--list で一覧）'); process.exit(2); }

const run = (cmd, timeoutSec) => new Promise((resolve) => {
  const t0 = Date.now();
  const p = spawn(cmd[0], cmd.slice(1), { cwd: ROOT });
  let out = '';
  const cap = (b) => { out += b.toString(); if (out.length > 400000) out = out.slice(-300000); };
  p.stdout.on('data', cap); p.stderr.on('data', cap);
  const timer = setTimeout(() => { out += `\n⏱ ${timeoutSec}秒で打ち切り`; p.kill('SIGTERM'); }, timeoutSec * 1000);
  p.on('close', (code, sig) => { clearTimeout(timer); resolve({ out, code: sig ? -1 : code, sec: (Date.now() - t0) / 1000 }); });
});

const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return '?'; } };
if (has('--build')) {
  console.log('■ npm run build ...');
  const b = await run(['npm', 'run', 'build'], 900);
  if (b.code !== 0) { console.error(b.out.slice(-2000)); console.error('ビルド失敗'); process.exit(1); }
}

// dist が古くないか（dist の監査は dist の中身を見るので、データより古いと現状を見ていない）
const distIdx = path.join(ROOT, 'dist/index.html');
const distAge = fs.existsSync(distIdx) ? fs.statSync(distIdx).mtimeMs : 0;
const dataAge = fs.statSync(path.join(ROOT, 'src/data/destinations.json')).mtimeMs;
const distStale = selected.some((a) => a.tier === 'dist' || a.id === 'rakuten-app-links') && distAge < dataAge;

const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
const results = [];
for (const a of selected) {
  process.stdout.write(`▶ ${a.id.padEnd(18)} `);
  const cmd = typeof a.cmd === 'function' ? a.cmd() : a.cmd;
  const r = await run(cmd, a.timeout || 300);
  let metrics = {};
  try { metrics = a.parse(r.out) || {}; } catch { metrics = {}; }
  const rows = [];
  let status = 'PASS';
  const why = [];
  const scriptFailed = r.code !== 0 && (a.exitMeansFail || ['qa', 'jalan-app-links', 'spot-credits'].includes(a.id) || r.code === -1);
  if (scriptFailed) { status = 'FAIL'; why.push(r.code === -1 ? 'スクリプトが打ち切られた／異常終了' : `スクリプトが終了コード ${r.code} で終了`); }
  if (!Object.keys(metrics).length || Object.values(metrics).some((m) => m.value == null)) {
    status = 'FAIL'; why.push('出力から指標を読み取れなかった（スクリプトの出力形式が変わった可能性）');
  }
  for (const [name, m] of Object.entries(metrics)) {
    const base = baseline[a.id]?.[name];
    let verdict = '参考';
    if (m.value != null) {
      if (m.mode === 'zero') { verdict = m.value === 0 ? 'OK' : '失敗'; if (m.value !== 0) { status = 'FAIL'; why.push(`${name} が ${m.value}（0であるべき）`); } }
      else if (m.mode === 'ratchet') {
        if (base == null) verdict = '新規（ベースライン無し）';
        else if (m.value > base) { verdict = `悪化（基準 ${base}）`; status = 'FAIL'; why.push(`${name} が ${base} → ${m.value} に悪化`); }
        else if (m.value < base) verdict = `改善（基準 ${base}）`;
        else verdict = '基準どおり';
      }
    }
    rows.push({ name, ...m, base, verdict });
  }
  const sec = r.sec.toFixed(1);
  console.log(`${status === 'PASS' ? '✅' : '❌'} ${sec}s ${why.join(' / ')}`);
  results.push({ a, r, rows, status, why });
}

// ── ベースライン更新 ─────────────────────────────────────────────────
if (has('--update-baseline')) {
  for (const x of results) {
    baseline[x.a.id] = baseline[x.a.id] || {};
    for (const m of x.rows) if (m.mode === 'ratchet' && m.value != null) baseline[x.a.id][m.name] = m.value;
  }
  fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`ベースラインを更新 → ${BASELINE}`);
}

// ── レポート ─────────────────────────────────────────────────────────
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const inv = {
  '目的地': dests.length,
  'featured_stay あり': dests.filter((d) => d.featured_stay).length,
  'description 新基準を満たす': null,
  '画像クレジットあり': dests.filter((d) => d.imageCredit?.url).length,
  'images が空': dests.filter((d) => !d.images?.length).length,
};
const descRes = results.find((x) => x.a.id === 'desc');
if (descRes) { const t = descRes.rows.find((m) => m.name === '全件数')?.value, f = descRes.rows.find((m) => m.name === '基準に落ちる件数')?.value; inv['description 新基準を満たす'] = `${t - f} / ${t}`; }
else delete inv['description 新基準を満たす'];

const failed = results.filter((x) => x.status === 'FAIL');
const L = [];
L.push(`# 監査レポート ${DATE}`, '');
L.push(`- 実行: ${new Date().toLocaleString('ja-JP')}　コミット: ${git('rev-parse', '--short', 'HEAD')}（未コミットの変更 ${git('status', '--short').split('\n').filter(Boolean).length} 件）`);
L.push(`- 範囲: ${[...tiers].join('・')}${only ? `（--only ${[...only].join(',')}）` : ''}`);
L.push(`- 結果: ${failed.length ? `**失敗 ${failed.length}**` : '**すべて合格**'}（${results.length} 監査中 ${results.length - failed.length} 合格）`);
if (distStale) L.push(`- ⚠ dist が src/data より古い。dist の監査は古いビルドを見ている → \`npm run audit:all -- --build\``);
L.push('', '## 現在の件数', '');
for (const [k, v] of Object.entries(inv)) L.push(`- ${k}: ${typeof v === 'number' ? v.toLocaleString() : v}`);
L.push('', '## 結果', '');
for (const x of results) L.push(`- ${x.status === 'PASS' ? '✅' : '❌'} **${x.a.id}** — ${x.a.title}（${x.r.sec.toFixed(1)}秒）${x.why.length ? '\n  - 理由: ' + x.why.join(' / ') : ''}`);
L.push('', '## 指標', '');
for (const x of results) {
  L.push(`### ${x.a.id}`);
  for (const m of x.rows) L.push(`- ${m.name}: ${m.value ?? '読み取れず'}　［${m.mode === 'zero' ? '0であるべき' : m.mode === 'ratchet' ? 'ベースライン比較' : '参考'}］ ${m.verdict}`);
  L.push('');
}
if (failed.length) {
  L.push('## 失敗した監査の出力（末尾30行）', '');
  for (const x of failed) { L.push(`### ${x.a.id}`, '```', ...x.r.out.trim().split('\n').slice(-30), '```', ''); }
}
L.push('## 使い方', '',
  '- `npm run audit:all` … 静的＋dist（約15秒）／`-- --live` … ネットワーク監査も／`-- --build` … 先にビルド',
  '- 悪化を直した・既知の問題を減らしたら `-- --update-baseline` でベースラインを固定する（`logs/audit_baseline.json`）',
  '- 各監査は既存のスクリプトをそのまま呼ぶ。個別に見たいときはそのスクリプトを直接実行する（`--list` で一覧）', '');
const outPath = val('--report') || `logs/audit_report_${DATE}.md`;
fs.writeFileSync(outPath, L.join('\n'));
console.log(`\n${failed.length ? `❌ 失敗 ${failed.length}: ${failed.map((x) => x.a.id).join(', ')}` : '✅ すべて合格'}  → ${outPath}`);
process.exit(failed.length ? 1 : 0);
