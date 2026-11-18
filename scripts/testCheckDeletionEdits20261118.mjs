// 削除の機械検査（scripts/checkDeletionEdits20261118.mjs）が、違反を本当に検出するかの試験（2026-11-18）。
import fs from 'fs';
import { spawnSync } from 'child_process';
const all = JSON.parse(fs.readFileSync('logs/dryrun_20261118/edits.json', 'utf8')).fixes.flatMap((f) => f.edits);
const r1 = all.find((e) => e.rule === 'R1' && e.old.endsWith('。')); const r2 = all.find((e) => e.rule === 'R2');
const mk = (name, e) => { const f = `/private/tmp/claude-501/chk_${name}_edits.json`; fs.writeFileSync(f, JSON.stringify({ fixes: [{ id: 'x', edits: [e] }] })); return f; };
const run = (f) => spawnSync('node', ['scripts/checkDeletionEdits20261118.mjs', f], { encoding: 'utf8' }).status;
const cases = [
  ['基準（R1の削除）', r1, 0], ['基準（R2の時刻外し）', r2, 0],
  ['①数字が増える（new に9999円を足す）', { ...r2, new: r2.new + '9999円' }, 1],
  ['②新しい文が増える（R1 の new に別の文を入れる）', { ...r1, new: '新しい説明文です。' }, 1],
  ['②文の途中だけを削る（old を文の前半だけにする）', { ...r1, old: r1.old.slice(0, Math.max(2, Math.floor(r1.old.length / 2))), new: '' }, 1],
  ['③固有名詞が増える（R2 の new にカタカナの語を足す）', { ...r2, new: r2.new.replace('→', '→ナントカ→') }, 1],
  ['④記録が無い（reason なし）', { ...r1, reason: '' }, 1],
  ['④old が対象に無い', { ...r1, old: 'この文は存在しない。' }, 1],
];
let ng = 0; for (const [name, e, want] of cases) { const got = run(mk(String(cases.indexOf(cases.find((c) => c[0] === name))), e)); const ok = want === 0 ? got === 0 : got !== 0; if (!ok) ng++; console.log(ok ? '検出/合格' : '見逃し/不合格', '|', name, '| 終了コード', got); }
console.log(ng ? `不合格 ${ng}` : `全 ${cases.length}件 想定どおり`); process.exit(ng ? 1 : 0);
