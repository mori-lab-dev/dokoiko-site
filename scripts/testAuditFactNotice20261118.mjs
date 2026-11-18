// 注意書きの監査（auditFactNotice20261118.mjs）が違反を検出するかの試験（2026-11-18）。小さな偽の dist を作って流す。
import fs from 'fs'; import path from 'path'; import { spawnSync } from 'child_process';
const T = 'おすすめスポット'; const N = '料金・営業時間・休館日などは変わることがあります。お出かけ前に、各施設の公式サイトでご確認ください。';
const page = (notice, extra = '') => `<html><body><h2 class="spots-heading">Xの${T}</h2>${notice}${extra}</body></html>`;
const ok = `<p class="fact-notice" data-fact-notice>${N}</p>`;
const cases = [
  ['正常', { 'a': page(ok) }, 0],
  ['注意書きが無い', { 'a': page('') }, 1],
  ['注意書きが2つ', { 'a': page(ok, ok) }, 1],
  ['文言が違う', { 'a': page('<p data-fact-notice>変わります。</p>') }, 1],
  ['見出しの直下でない', { 'a': `<html><h2 class="spots-heading">Xの${T}</h2><div>x</div>${ok}</html>` }, 1],
  ['転送ページに注意書き', { 'a': page(ok), 'b': `<meta http-equiv="refresh" content="0;url=/a/">${ok}` }, 1],
  ['転送ページは対象外（注意書き無し）', { 'a': page(ok), 'b': '<meta http-equiv="refresh" content="0;url=/a/">' }, 0],
  ['診断ページに注意書き', { 'a': page(ok) }, 1, { 'quiz/x/index.html': ok }],
];
let ng = 0; let i = 0;
for (const [name, pages, want, extra] of cases) {
  const d = `/private/tmp/claude-501/fn_test_${i++}`; fs.rmSync(d, { recursive: true, force: true });
  for (const [id, h] of Object.entries(pages)) { fs.mkdirSync(path.join(d, 'destinations', id), { recursive: true }); fs.writeFileSync(path.join(d, 'destinations', id, 'index.html'), h); }
  for (const [f, h] of Object.entries(extra || {})) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), h); }
  const st = spawnSync('node', ['scripts/auditFactNotice20261118.mjs', d], { encoding: 'utf8' }).status; const good = want === 0 ? st === 0 : st !== 0; if (!good) ng++;
  console.log(good ? '想定どおり' : '不合格', '|', name, '| 終了コード', st);
  fs.rmSync(d, { recursive: true, force: true });
}
console.log(ng ? `不合格 ${ng}` : `全 ${cases.length}件 想定どおり`); process.exit(ng ? 1 : 0);
