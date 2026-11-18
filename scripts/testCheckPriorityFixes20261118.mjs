// 優先ページの機械検査（scripts/checkPriorityFixes20261118.mjs）が、違反を本当に検出するかの試験（2026-11-18）。
import fs from 'fs'; import { spawnSync } from 'child_process';
// 小さな偽の記事と写しを作って試す（本番のデータは適用後なので使わない）
const FX = '/private/tmp/claude-501/fx_article.json'; const SN = 'logs/priority_fix_20261118/snapshots/_fx_test.txt';
fs.writeFileSync(FX, JSON.stringify({ sections: [{ title: 't', body: '入園料は大人500円。静かな公園だ。\n夜は暗い。', info: '■ 公園\n料金：500円\n営業時間：9:00〜17:00' }], modelCourse: { day: '8:30 公園着 → 昼食' } }));
fs.writeFileSync(SN, 'URL: https://www.example.lg.jp/park\n確認日: 2026-11-18\n入園料 中学生以上700円 小学生以下無料 開園 9:00');
const FXD = '/private/tmp/claude-501/fx_dests.json'; fs.writeFileSync(FXD, JSON.stringify([{ id: 'd1', description: '入園料は大人500円で、静かな公園です。', seo: { description: '入園料は大人500円の公園。' } }]));
const base = { page: 'fx', reason: '試験', 確認日: '2026-11-18', file: FX, 出典URL: ['https://www.example.lg.jp/park'], snapshot: 'snapshots/_fx_test.txt', 公式の値: '中学生以上700円' };
const p1 = { ...base, rule: 'P1', field: 'sections.0.body', old: '500円', new: '700円', 値: ['700円'] };
const p2 = { ...base, rule: 'P2', field: 'sections.0.info', old: '料金：500円\n', new: '', 値: [], 削除した文: '料金：500円', 出典URL: [] };
const p3 = { ...base, rule: 'P3', field: 'modelCourse.day', old: '8:30 公園着', new: '公園着', 値: ['9:00'], 公式の値: '開園9:00' };
const mk = (i, e) => { const f = `/private/tmp/claude-501/cpf_${i}.json`; fs.writeFileSync(f, JSON.stringify({ fixes: [{ id: 'x', edits: [e] }] })); return f; };
const run = (f) => { const D = 'logs/priority_fix_20261118'; const keep = fs.existsSync(`${D}/fail_keys.json`) ? fs.readFileSync(`${D}/fail_keys.json`, 'utf8') : null; const r = spawnSync('node', ['scripts/checkPriorityFixes20261118.mjs', f], { encoding: 'utf8' }).status; const keep2 = keep; if (keep2 !== null) fs.writeFileSync(`${D}/fail_keys.json`, keep2); const rc = `${D}/check_result.json`; return r; };
const bak = fs.readFileSync('logs/priority_fix_20261118/check_result.json', 'utf8');
const pd = { ...base, file: FXD, dest: 'd1', field: 'description', rule: 'P1', old: '500円', new: '700円', 値: ['700円'] };
const pc = { ...base, rule: 'P2', field: 'sections.0.info', old: '料金：500円\n営業時間：9:00〜17:00', new: '料金：500円', 値: [], 出典URL: [], 削除した文: '営業時間', 削除する部分: '\n営業時間：9:00〜17:00' };
const cases = [
  ['文脈つきの削除（削除する部分）の基準', pc, 0], ['文脈つきの削除: new が違う（別の数字に変える）', { ...pc, new: '料金：600円' }, 1],
  ['基準（dest の description の置換）', pd, 0], ['dest: seo.description の置換', { ...pd, field: 'seo.description' }, 0], ['dest: 新しい数字が増える（description）', { ...pd, new: '700円と88888円' }, 1], ['dest: 旧文がその欄に無い', { ...pd, old: '999円' }, 1],
  ['基準（P1）', p1, 0], ['基準（P2）', p2, 0], ['基準（P3）', p3, 0],
  ['①値が写しに無い（値に存在しない文字列）', { ...p1, 値: ['99,999円'] }, 1],
  ['①snapshot が無い', { ...p1, snapshot: 'snapshots/ない.txt' }, 1],
  ['②記録が無い（reason なし）', { ...p2, reason: '' }, 1],
  ['②出典URLが無い（P1）', { ...p1, 出典URL: [] }, 1],
  ['②old が対象に無い', { ...p2, old: 'この文は存在しない。' }, 1],
  ['③新しい数字（記録に無い数字を new に入れる）', { ...p1, new: p1.new + '88888円' }, 1],
  ['③新しい文が増える（P1 の new に文を足す）', { ...p1, new: p1.new + '。また新しい説明文です。' }, 1],
  ['③削除なのに new がある', { ...p2, new: '新しい文。' }, 1],
  ['④固有名詞が増える（記録に無い語を new に入れる）', { ...p1, new: p1.new + 'ナントカ温泉' }, 1],
];
let ng = 0; cases.forEach(([name, e, want], i) => { const st = run(mk(i, e)); const good = want === 0 ? st === 0 : st !== 0; if (!good) ng++; console.log(good ? '想定どおり' : '不合格', '|', name, '| 終了コード', st); });
fs.writeFileSync('logs/priority_fix_20261118/check_result.json', bak);
console.log(ng ? `不合格 ${ng}` : `全 ${cases.length}件 想定どおり`); fs.rmSync(SN, { force: true }); process.exit(ng ? 1 : 0);
