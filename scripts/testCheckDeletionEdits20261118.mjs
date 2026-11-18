// 削除の機械検査（scripts/checkDeletionEdits20261118.mjs）が、違反を本当に検出するかの試験（2026-11-18）。小さな偽の記事で試す（本番のデータは適用後なので使わない）。
import fs from 'fs';
import { spawnSync } from 'child_process';
const FX = '/private/tmp/claude-501/fxd_article.json';
fs.writeFileSync(FX, JSON.stringify({ sections: [{ title: 't', body: '静かな公園だ。\n入園料は500円。\n夜は暗い。', info: '■ 公園\n料金：500円\n営業時間：9:00〜17:00' }], modelCourse: { day: '9:00 公園着 → 11:30 昼食 → 13:00 発の電車' } }));
const base = { page: 'fx', reason: '試験', file: FX, 削除した文: 'x' };
const r1 = { ...base, rule: 'R1', 種類: '料金', field: 'sections.0.body', old: '入園料は500円。\n', new: '' };
const r2 = { ...base, rule: 'R2', 種類: '時刻', field: 'modelCourse.day', old: '9:00 公園着 → 11:30 昼食 → 13:00 発の電車', new: '公園着 → 昼食 → 13:00 発の電車' };
const r3 = { ...base, rule: 'R3', 種類: '接続語', field: 'sections.0.body', old: '静かな公園だ。', new: '静かな公園だ。' };
const mk = (i, e) => { const f = `/private/tmp/claude-501/chk2_${i}_edits.json`; fs.writeFileSync(f, JSON.stringify({ fixes: [{ id: 'x', edits: [e] }] })); return f; };
const run = (f) => spawnSync('node', ['scripts/checkDeletionEdits20261118.mjs', f], { encoding: 'utf8' }).status;
const cases = [
  ['基準（R1の削除）', r1, 0], ['基準（R2の時刻外し・13:00 は発の前なので残す）', r2, 0],
  ['①数字が増える（new に9999円を足す）', { ...r2, new: r2.new + '9999円' }, 1],
  ['②新しい文が増える（R1 の new に別の文を入れる）', { ...r1, new: '新しい説明文です。\n' }, 1],
  ['②文の途中だけを削る（old を文の前半だけにする）', { ...r1, old: '入園料は', new: '' }, 1],
  ['②時刻外し以外の変更（R2 で別の語を消す）', { ...r2, new: '公園着 → 昼食 → 13:00 発の' }, 1],
  ['③固有名詞が増える（R2 の new にカタカナの語を足す）', { ...r2, new: r2.new.replace('→', '→ナントカ→') }, 1],
  ['④記録が無い（reason なし）', { ...r1, reason: '' }, 1],
  ['④old が対象に無い', { ...r1, old: 'この文は存在しない。' }, 1],
  ['R3 の変更が接続語の削除でない', { ...r3, old: '静かな公園だ。', new: '静かな園だ。' }, 1],
];
let ng = 0; cases.forEach(([name, e, want], i) => { const got = run(mk(i, e)); const ok = want === 0 ? got === 0 : got !== 0; if (!ok) ng++; console.log(ok ? '検出/合格' : '見逃し/不合格', '|', name, '| 終了コード', got); });
console.log(ng ? `不合格 ${ng}` : `全 ${cases.length}件 想定どおり`); process.exit(ng ? 1 : 0);
