// 文体の書き直しの機械検査（scripts/checkRewrite20261118.mjs）が、違反を本当に検出するかの試験（2026-11-18）。合格している書き直し（suo-oshima.A）に、違反を1つずつ入れて流す。
import fs from 'fs'; import path from 'path'; import { spawnSync } from 'child_process';
const base = JSON.parse(fs.readFileSync('logs/style_trial_20261118/rewrites/suo-oshima.A.json', 'utf8'));
const clone = () => JSON.parse(JSON.stringify(base));
const cases = [
  ['基準（合格している書き直し）', (d) => d, 0],
  ['①数字が増える', (d) => { d.sections[0].body += '\n駐車場は50台。'; return d; }, 1],
  ['①数字が消える（記録なし）', (d) => { d.tips = d.tips.replace('14時には', 'お昼には'); return d; }, 1],
  ['②固有名詞が増える', (d) => { d.sections[1].body += '\n近くにナントカ食堂がある。'; return d; }, 1],
  ['③定型句（ここでしか）', (d) => { d.lead += '\nここでしか見られない。'; return d; }, 1],
  ['③推測語（かもしれない）', (d) => { d.tips += '\n混むかもしれない。'; return d; }, 1],
  ['③体験談の語（行ってみた）', (d) => { d.sections[0].body += '\n行ってみた。'; return d; }, 1],
  ['③体験談の文末（歩いた。）', (d) => { d.sections[1].body += '\n橋の上を歩いた。'; return d; }, 1],
  ['③二人称（あなた）', (d) => { d.lead += '\nあなたに向いている。'; return d; }, 1],
  ['③結論語（おすすめ）', (d) => { d.lead += '\nおすすめの島だ。'; return d; }, 1],
  ['③断定（絶対）', (d) => { d.tips += '\n絶対に早めに動くこと。'; return d; }, 1],
  ['③評価語が増える（絶景）', (d) => { d.lead += '\n絶景の島だ。'; return d; }, 1],
  ['④文字数が大幅に減る', (d) => { d.sections[2].body = d.sections[2].body.slice(0, 40); return d; }, 1],
  ['⑤節の数が変わる', (d) => { d.sections.pop(); return d; }, 1],
  ['⑤余計な欄（見出しを書き換えようとする）', (d) => { d.sections[0].title = '新しい見出し'; return d; }, 1],
  ['⑥同じ文末が3文続く', (d) => { d.sections[0].body = 'ビーチは広いです。\n砂は白いです。\n海は青いです。\n' + d.sections[0].body; return d; }, 1],
];
let ng = 0; let i = 0;
for (const [name, fn, want] of cases) {
  const root = `/private/tmp/claude-501/crw_${i++}`; const dir = path.join(root, 'rewrites'); fs.rmSync(root, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'suo-oshima.A.json'), JSON.stringify(fn(clone())));
  const st = spawnSync('node', ['scripts/checkRewrite20261118.mjs', dir], { encoding: 'utf8' }).status; const ok = want === 0 ? st === 0 : st !== 0; if (!ok) ng++;
  console.log(ok ? (want ? '検出' : '合格') : '不合格', '|', name, '| 終了コード', st); fs.rmSync(root, { recursive: true, force: true });
}
console.log(ng ? `不合格 ${ng}` : `全 ${cases.length}件 想定どおり（基準1件は合格・違反${cases.length - 1}種はすべて検出）`); process.exit(ng ? 1 : 0);
