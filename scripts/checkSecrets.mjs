// コミット前の秘密情報の検査（2026-11-06）。サービスアカウントのキー・秘密鍵がリポジトリに入らないようにする。
//   node scripts/checkSecrets.mjs --staged   ステージ済みのファイルを検査（pre-commit から）
//   node scripts/checkSecrets.mjs --all      追跡されている全ファイルを検査
// 検査: 秘密鍵のヘッダ、サービスアカウントの JSON の型、GSC_KEY_FILE のキー（private_key_id・秘密鍵の本体）そのもの。
// 見つけたファイル名と理由の種類だけを出す。キーの中身は出さない。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';

const mode = process.argv.includes('--all') ? 'all' : 'staged';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 });
const files = (mode === 'all' ? git('ls-files', '-z') : git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z')).split('\0').filter(Boolean);

// 手元のキーの本体（あれば）。ファイルの中にそのまま入っていたら止める
const secrets = [];
try {
  const kf = process.env.GSC_KEY_FILE || path.join(os.homedir(), '.config/morilab/gsc-key.json');
  const k = JSON.parse(fs.readFileSync(kf, 'utf8'));
  if (k.private_key_id) secrets.push(['手元のキーの private_key_id', String(k.private_key_id)]);
  if (k.private_key) for (const line of String(k.private_key).split('\n')) if (line.length > 30 && !line.startsWith('-----')) secrets.push(['手元のキーの秘密鍵の本体', line]);
} catch { /* キーが無ければ形の検査だけ */ }

const PATTERNS = [
  ['秘密鍵のヘッダ', /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['サービスアカウントのJSON', /"type"\s*:\s*"service_account"/],
  ['private_key のフィールド', /"private_key"\s*:\s*"-----BEGIN/],
];
const bad = [];
for (const f of files) {
  if (/(^|\/)(node_modules|dist)\//.test(f)) continue;
  if (f === 'scripts/checkSecrets.mjs') continue;
  if (/(^|\/)[^/]*gsc-key[^/]*$/.test(f)) { bad.push(`${f}（キーのファイル名）`); continue; }
  let t;
  try { const st = fs.statSync(f); if (!st.isFile() || st.size > 20 * 1024 * 1024) continue; t = fs.readFileSync(f, 'utf8'); } catch { continue; }
  for (const [why, re] of PATTERNS) if (re.test(t)) bad.push(`${f}（${why}）`);
  for (const [why, s] of secrets) if (t.includes(s)) bad.push(`${f}（${why}）`);
}
if (bad.length) {
  console.error(`❌ 秘密情報の疑い ${bad.length}件（中身は出しません）:\n` + [...new Set(bad)].map((x) => '  ' + x).join('\n'));
  process.exit(1);
}
console.log(`✅ 秘密情報なし（${mode === 'all' ? '追跡中の全' : 'ステージ済みの'} ${files.length} ファイルを検査）`);
