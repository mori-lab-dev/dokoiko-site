// ビルド元のコミットとブランチを dist/build-info.json に書く（2026-11-17）。入れるのは SHA とブランチ名だけ。
// 本番が main 以外のブランチから作られていた件（11/11〜）の再発防止。npm run build の後（postbuild）に自動で動く。
// 本番の SHA が main の先頭と合っているかは scripts/checkProdSha.mjs（週次点検）が見る。
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { execFileSync } from 'child_process';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const info = { sha: git('rev-parse', 'HEAD'), branch: git('rev-parse', '--abbrev-ref', 'HEAD') };
fs.writeFileSync(path.join(root, 'dist/build-info.json'), JSON.stringify(info) + '\n');
console.log(`dist/build-info.json: ${info.branch} ${info.sha.slice(0, 8)}`);
