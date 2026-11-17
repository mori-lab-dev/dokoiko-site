// dist/ を本番配信リポ(mori-lab-dev/dokoiko)の作業ツリーへ反映する。
// DEPLOY.md の「正しいデプロイ経路」手順3に相当。CNAME / .nojekyll / .git は保持する。
// 使い方: node scripts/deployToPages.mjs        （反映のみ・commit/pushは別途）
//         node scripts/deployToPages.mjs --dry  （差分の確認のみ）
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '..', 'dist');
const target = path.resolve(__dirname, '../../dokoiko');

// 保持するもの: gitメタデータ・独自ドメイン設定・Jekyll無効化フラグ・macOSのゴミ
const KEEP = ['.git', '.github', 'CNAME', '.nojekyll', '.DS_Store', 'scripts'];

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html がない。先に `npm run build` を実行すること。');
  process.exit(1);
}
if (!fs.existsSync(path.join(target, '.git'))) {
  console.error(`本番リポが見つからない: ${target}`);
  process.exit(1);
}

// main 以外のブランチからの反映は止める（2026-11-17。本番が fix/status-badge-label から作られていた件の再発防止）。
// 反映するのは、main をチェックアウトして、その main でビルドした dist だけ（dist/build-info.json の branch も main であること）。
// 変更前の版: logs/prevent_20261117/deployToPages.mjs.before
const gitOut = (...a) => execFileSync('git', a, { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
const dry = process.argv.includes('--dry');
if (!dry) {
  const cur = gitOut('rev-parse', '--abbrev-ref', 'HEAD');
  if (cur !== 'main') { console.error(`反映を止めた: いまのブランチは ${cur}（main 以外から本番へは反映しない）。main に切り替えてビルドし直す。`); process.exit(1); }
  let bi = null; try { bi = JSON.parse(fs.readFileSync(path.join(dist, 'build-info.json'), 'utf8')); } catch { /* 無い */ }
  if (!bi) { console.error('反映を止めた: dist/build-info.json が無い。main で npm run build をやり直す（postbuild が書く）。'); process.exit(1); }
  if (bi.branch !== 'main') { console.error(`反映を止めた: dist は ${bi.branch} でビルドされている。main でビルドし直す。`); process.exit(1); }
}
const args = ['-a', '--delete', ...(dry ? ['-n', '-i'] : []),
  ...KEEP.flatMap(k => ['--exclude', `/${k}`]),
  `${dist}/`, `${target}/`];

const out = execFileSync('rsync', args, { encoding: 'utf8' });
if (dry) {
  const lines = out.split('\n').filter(Boolean);
  console.log(`差分 ${lines.length} 件（先頭20件）`);
  console.log(lines.slice(0, 20).join('\n'));
} else {
  console.log(`反映完了 → ${target}`);
}
