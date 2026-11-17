// 本番（tabidokoiko.com）が main の先頭から作られているかの検査（2026-11-17）。読み取りのみ（git の参照を読むだけ・fetch しない）。
//   本番の /build-info.json の sha と、ローカルの main の先頭を比べる。
//   終了コード 0 = 一致（または、ビルドに関わるファイルの差分が無い）／ 1 = 食い違い・main 以外のブランチ・読めない
// usage: node scripts/checkProdSha.mjs
import path from 'path'; import { fileURLToPath } from 'url'; import { execFileSync } from 'child_process';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
let prod;
try {
  const r = await fetch('https://tabidokoiko.com/build-info.json', { headers: { 'user-agent': 'dokoiko-weekly-check' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) { console.log(`❌ 本番の build-info.json が読めない（HTTP ${r.status}）。本番がこの仕組みの入ったビルドか確かめる`); process.exit(1); }
  prod = await r.json();
} catch (e) { console.log(`❌ 本番の build-info.json が読めない（${String(e.message).slice(0, 80)}）`); process.exit(1); }
const mainSha = git('rev-parse', 'main');
console.log(`本番: ${prod.branch} ${String(prod.sha).slice(0, 8)} / main の先頭: ${mainSha.slice(0, 8)}`);
if (prod.branch !== 'main') { console.log(`❌ 本番が main 以外のブランチ（${prod.branch}）から作られている`); process.exit(1); }
if (prod.sha === mainSha) { console.log('✅ 本番は main の先頭と一致'); process.exit(0); }
let known = true; try { git('cat-file', '-e', `${prod.sha}^{commit}`); } catch { known = false; }
if (!known) { console.log('❌ 本番の SHA がこのリポジトリに無い'); process.exit(1); }
let ancestor = true; try { git('merge-base', '--is-ancestor', prod.sha, 'main'); } catch { ancestor = false; }
if (!ancestor) { console.log('❌ 本番の SHA が main の履歴に含まれていない（別の系統から作られている）'); process.exit(1); }
// src/data/jalanWatch.json は見張りが書き換えるデータ（2026-11-17 に対象から外した。ページ側が取得時刻で古さを判定し、24時間を超えると「確認できません」と出す）。
// 変更前の版: logs/quiz_20261117/checkProdSha.mjs.before
const diff = git('diff', '--name-only', prod.sha, 'main', '--', 'src', 'public', 'package.json', 'package-lock.json', 'astro.config.mjs', 'scripts/copyData.js', ':(exclude)src/data/jalanWatch.json').split('\n').filter(Boolean);
if (diff.length) { console.log(`❌ 本番は main より古い（ビルドに関わるファイルの差分 ${diff.length}件。例: ${diff.slice(0, 3).join(', ')}）`); process.exit(1); }
console.log('✅ 本番の SHA は main の先頭と違うが、ビルドに関わるファイルの差分は無い');
process.exit(0);
