// 週1の自動点検（2026-11-09）。読み取りのみ。ビルドしない・デプロイしない・サイトのコード/データを変えない。
//   npm run audit:all → npm run baseline → npm run gsc を順に流し、logs/weekly/<日付>.log に残す（途中で失敗しても残りは流す）。
//   次のときだけ macOS の通知を出す:
//     1. audit:all が失敗  2. 応援割の確認日が14日を超えた  3. npm run gsc がエラー（403 など）で止まった
//     4. gsc の差分で、登録済み（URL検査 verdict=PASS）の件数が前回より減った
// 起動: launchd（~/Library/LaunchAgents/com.morilab.dokoiko-weekly.plist・毎週火曜 21:00）。手動: node scripts/weeklyCheck.mjs
// 使い方: node scripts/weeklyCheck.mjs [--notify-test]   通知が出ることだけ確かめる
// GSC のキーは環境変数 GSC_KEY_FILE のパスだけを使う。キーの中身・client_email はここでは読まない・出さない。
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { spawn, execFile } from 'child_process';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATE = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const dir = path.join(root, 'logs/weekly');
fs.mkdirSync(dir, { recursive: true });
const notify = (msg) => new Promise((res) => execFile('/usr/bin/osascript', ['-e', `display notification ${JSON.stringify(msg)} with title "dokoiko 週次点検" sound name "Glass"`], () => res()));
if (process.argv.includes('--notify-test')) { await notify('通知のテストです（異常ではありません）'); console.log('通知を出した'); process.exit(0); }

const logFile = path.join(dir, `${DATE}.log`);
const out = fs.createWriteStream(logFile, { flags: 'a' });
const w = (s) => out.write(s.endsWith('\n') ? s : s + '\n');
const stamp = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' });

// 二重起動を防ぐ（自分の PID だけを見る。古いロックは PID が死んでいれば無視）
const lock = path.join(dir, '.lock');
if (fs.existsSync(lock)) { const pid = Number(fs.readFileSync(lock, 'utf8')); let alive = false; try { process.kill(pid, 0); alive = true; } catch { /* 無い */ } if (alive) { w(`[${stamp()}] 別の実行が動いている（PID ${pid}）ので何もしない`); process.exit(0); } }
fs.writeFileSync(lock, String(process.pid));
const cleanup = () => { try { fs.unlinkSync(lock); } catch { /* ok */ } };
process.on('exit', cleanup);

const run = (label, cmd, args) => new Promise((res) => {
  w(`\n===== [${stamp()}] ${label}: ${cmd} ${args.join(' ')} =====`);
  const p = spawn(cmd, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  w(`(PID ${p.pid})`);
  let buf = '';
  p.stdout.on('data', (d) => { buf += d; out.write(d); });
  p.stderr.on('data', (d) => { buf += d; out.write(d); });
  p.on('close', (code) => { w(`----- ${label} 終了コード ${code} [${stamp()}]`); res({ code, buf }); });
  p.on('error', (e) => { w(`----- ${label} 起動できない: ${e.code}`); res({ code: -1, buf }); });
});

w(`########## 週次点検 ${DATE} 開始 [${stamp()}] PID ${process.pid} ##########`);
const alerts = [];
const npm = '/opt/homebrew/bin/npm';
const audit = await run('audit:all', npm, ['run', 'audit:all']);
if (audit.code !== 0) alerts.push('audit:all が失敗した（logs/weekly のログを見る）');
const ouen = await run('応援割の確認日', '/opt/homebrew/bin/node', ['scripts/auditOuenWari.mjs']);
const om = ouen.buf.match(/確認日が(\d+)日より古い:\s*(\d+)件/);
if (!om) alerts.push('応援割の確認日の検査が読めなかった');
else if (Number(om[2]) > 0) alerts.push(`応援割の確認日が${om[1]}日を超えた（${om[2]}件）`);
await run('baseline', npm, ['run', 'baseline']);

// gsc の前に、前回の登録済み件数を控える（今回の記録ファイルより前の最新）
const gscDir = path.join(root, 'logs/gsc');
const inspFiles = () => fs.readdirSync(gscDir).filter((f) => /^inspect_\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort();
const readRecs = (f) => fs.readFileSync(path.join(gscDir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error);
const passOf = (f) => readRecs(f).filter((r) => r.verdict === 'PASS').length;
const prevFile = inspFiles().filter((f) => f < `inspect_${DATE}.jsonl`).at(-1);
const prevPass = prevFile ? passOf(prevFile) : null;
if (!process.env.GSC_KEY_FILE) w('(GSC_KEY_FILE が環境変数に無い。既定の場所を使う)');
const gsc = await run('gsc', npm, ['run', 'gsc']);
if (gsc.code !== 0) alerts.push(`npm run gsc がエラーで止まった（終了コード ${gsc.code}。${(gsc.buf.match(/❌[^\n]*|停止: [^\n]*/) ?? [''])[0].slice(0, 80)}）`);
else {
  const cur = `inspect_${DATE}.jsonl`;
  if (fs.existsSync(path.join(gscDir, cur)) && prevPass != null) {
    const nowPass = passOf(cur);
    w(`登録済み（PASS）: 前回 ${prevFile} ${prevPass}件 → 今回 ${nowPass}件`);
    if (nowPass < prevPass) alerts.push(`GSC の登録済みが前回より減った（${prevPass}→${nowPass}）`);
  } else w('登録済み件数の比較: 前回の記録なし、または今回の記録なし');
}
w(`\n########## 週次点検 ${DATE} 終了 [${stamp()}] ##########`);
if (alerts.length) { w('通知: ' + alerts.join(' / ')); await notify(alerts.join('\n').slice(0, 240)); } else w('通知: なし（異常なし）');
out.end();
await new Promise((r) => out.on('finish', r));
process.exit(alerts.length ? 1 : 0);
