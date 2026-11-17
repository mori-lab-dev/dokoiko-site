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

const dry = process.argv.includes('--dry');
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
