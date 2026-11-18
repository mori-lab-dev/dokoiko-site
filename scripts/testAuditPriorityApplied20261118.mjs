// 優先ページの適用確認（auditPriorityApplied20261118.mjs）が違反を検出するかの試験（2026-11-18）。小さな偽の作業ツリー（--root）を作って流す。
import fs from 'fs'; import path from 'path'; import { spawnSync } from 'child_process';
const mk = (o = {}) => {
  const root = `/private/tmp/claude-501/pa_${Math.random().toString(36).slice(2, 8)}`; const w = (p, d) => { fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }); fs.writeFileSync(path.join(root, p), typeof d === 'string' ? d : JSON.stringify(d)); };
  const body = o.body ?? '静かな公園だ。\n入園料は無料。';
  w('src/data/destinations.json', [{ id: 'x', name: 'テスト公園', description: o.description ?? 'テスト公園の説明。', ...(o.seo ? { seo: { title: 'タイトル', description: o.seo } } : {}), spots: [{ name: '公園', description: o.spot ?? '広い公園。' }] }]);
  w('src/data/articles/x.json', { lead: 'リード。', sections: [{ title: o.title ?? 't', body, info: o.info ?? '■ 公園\n料金：無料' }], tips: '' });
  const D = 'logs/priority_fix_20261118'; w(`${D}/inputs/page_x.json`, { 文: [{ 番号: 1, 種類: '料金', 場所: '節1 body', 文: '入園料は大人500円で、子どもは無料である。' }, { 番号: 2, 種類: '料金', 場所: '節1 body', 文: '朝8時に着いたら、もう並んでいた。' }] });
  w(`${D}/results/x.json`, { 判定: [{ n: 1, g: 1, 判定: o.judge ?? '食い違い', 理由: o.reason ?? '', 修正: { 種類: '置換', old: '500円', new: '無料' } }, { n: 2, g: 1, 判定: '確認できず', 理由: '体験談・行程案' }], グループ: [] });
  w('scripts/data/mergeFactFixes20261118d.json', { fixes: [{ edits: [{ page: 'x', rule: 'P1', 種類: '料金', old: '500円', new: '無料', 旧文: '入園料は大人500円で、子どもは無料である。' }] }] });
  if (o.allow) w('logs/priority_gap_20261118/allowlist.json', o.allow);
  if (o.distRaw) { w('dist/destinations/x/index.html', o.distRaw); }
  if (o.dist) { w('dist/destinations/x/index.html', `<p>${o.dist}</p>`); }
  return root; };
const run = (root) => spawnSync('node', ['scripts/auditPriorityApplied20261118.mjs', '--root', root], { encoding: 'utf8', cwd: process.cwd() }).status;
const cases = [
  ['基準（適用済み・旧値なし）', {}, 0],
  ['①対象の文が本文に残っている（食い違い）', { body: '入園料は大人500円で、子どもは無料である。\n静かな公園だ。' }, 1],
  ['①理由の文言が条件と一致しなくても、区分で検出（確認できず・公式に記載なし）', { body: '入園料は大人500円で、子どもは無料である。', judge: '確認できず', reason: '公式に記載なし' }, 1],
  ['①体験談・行程案の判定の文は対象外（残っていても合格）', { body: '朝8時に着いたら、もう並んでいた。\n入園料は無料。' }, 0],
  ['①見どころの説明に残っている', { spot: '入園料は大人500円で、子どもは無料である。' }, 1],
  ['①dist に残っている（description に無い文）', { dist: '入園料は大人500円で、子どもは無料である。' }, 1],
  ['②置換した値の旧値が info に残っている', { info: '■ 公園\n料金：500円' }, 1],
  ['②旧値が description（メタに出る欄）に残っている', { description: '入園料は500円です。' }, 1],
  ['②旧値が seo.description に残っている', { seo: '入園料は500円です。' }, 1],
  ['②旧値が節の見出しに残っている', { title: '入園料500円の公園' }, 1],
  ['②旧値が dist のメタ（description）に残っている', { distRaw: '<meta name="description" content="入園料500円の公園">' }, 1],
  ['例外（allowlist）に載っていれば合格', { info: '■ 公園\n料金：500円', allow: { a: [], b: [{ page: 'x', 置換: '500円 → 無料', 残っている文: '料金：500円', 理由: '試験' }] } }, 0],
];
let ng = 0; for (const [name, o, want] of cases) { const root = mk(o); const st = run(root); const ok = want === 0 ? st === 0 : st !== 0; if (!ok) ng++; console.log(ok ? (want ? '検出' : '合格') : '不合格', '|', name, '| 終了コード', st); fs.rmSync(root, { recursive: true, force: true }); }
console.log(ng ? `不合格 ${ng}` : `全 ${cases.length}件 想定どおり`); process.exit(ng ? 1 : 0);
