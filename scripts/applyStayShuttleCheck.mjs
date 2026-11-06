// featured_stay の送迎情報を、宿の公式サイトの記載に合わせる（2026-11-06）。
// 入力: backup/stay_shuttle_20261106/stay_shuttle_check.json（192宿・宿ごとに公式サイトのアクセスページを読んだ記録）
// 規則:
//   ・公式サイトを開けて送迎の記載を読めた宿（status=verified）だけ書き換える。現在の文が公式と合っていれば触らない。
//   ・書き換えは「公式の記載だけから作った1行」。「無料」は公式に書いてあるときだけ（記録の free_word_on_official が true のときだけ許す）
//   ・公式が「送迎なし」と書く／公式に当該の送迎が無い宿は、送迎の文を消して hasShuttle を false にする
//   ・公式サイトを特定できない／開けない／アクセスページに送迎の記載がない宿は触らない（一覧に残す）
//   ・日付で内容が変わる等で公式の記載の食い違いが残る宿（谷地温泉）は触らず一覧に残す
// 出力: backup/stay_shuttle_20261106/{before.json,changes.json,untouched.json}、scripts/data/stayShuttleChecked.json（監査用）
// 使い方: node scripts/applyStayShuttleCheck.mjs [--dry]   何度流しても同じ結果になる
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';

const dry = process.argv.includes('--dry');
const OUT = path.join(root, 'backup/stay_shuttle_20261106');
const rows = JSON.parse(fs.readFileSync(path.join(OUT, 'stay_shuttle_check.json'), 'utf8'));
const byName = new Map(rows.map((r) => [r.name, r]));
const FILE = path.join(root, 'src/data/destinations.json');
const dests = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// 公式の記載から人が決めた例外
const REMOVE = new Set(['五島リトリート ray by 温故知新', '奈良屋', '角館山荘 侘桜']); // 公式は送迎なし／当該の送迎（バスターミナル・駅発）が公式に無い
const SKIP = new Map([['谷地温泉', '切替日が公式ページ間で食い違う（今日時点は公式アクセスページが八戸駅発）。要再確認のため触らない']]);
const OVERRIDE = new Map([['百名伽藍', '那覇空港発のハイヤーの手配あり（有料・前日19時までに要予約）']]);
const norm = (s) => s.replace(/\(/g, '（').replace(/\)/g, '）');

const beforeFile = path.join(OUT, 'before.json');
const before = fs.existsSync(beforeFile) ? JSON.parse(fs.readFileSync(beforeFile, 'utf8')) : {};   // 初回の値を保持する（流し直しても元の値を失わない）
const changes = [], untouched = [], kept = [];
for (const d of dests) {
  const f = d.featured_stay; if (!f) continue;
  const r = byName.get(f.name); if (!r) continue;
  const hasAny = !!f.shuttleInfo || !!f.hasShuttle;
  if (!(d.id in before) && hasAny) before[d.id] = { name: f.name, shuttleInfo: f.shuttleInfo ?? null, hasShuttle: !!f.hasShuttle };
  const orig = before[d.id] ?? { shuttleInfo: f.shuttleInfo ?? null, hasShuttle: !!f.hasShuttle };
  const rec = { destId: d.id, dest: d.name, stay: f.name, status: r.status, match: r.matches_current, official_url: r.official_url, access_page_url: r.access_page_url };
  if (r.status !== 'verified') { if (hasAny) untouched.push({ ...rec, reason: { official_not_found: '公式サイトを特定できず', official_unreachable: '公式サイトが開けず', no_shuttle_info_on_official: '公式のアクセスページに送迎の記載を読めず（読み漏れの可能性があるため消さない）' }[r.status] || r.status, shuttleInfo: orig.shuttleInfo }); continue; }
  if (SKIP.has(f.name)) { untouched.push({ ...rec, reason: SKIP.get(f.name), shuttleInfo: orig.shuttleInfo }); continue; }
  let next;
  if (REMOVE.has(f.name)) next = { shuttleInfo: null, hasShuttle: false };
  else if (OVERRIDE.has(f.name)) next = { shuttleInfo: OVERRIDE.get(f.name), hasShuttle: true };
  else if (r.matches_current === 'yes') { kept.push(rec); continue; }
  else if (r.proposed_shuttleInfo && hasAny) next = { shuttleInfo: norm(r.proposed_shuttleInfo), hasShuttle: true };
  else { untouched.push({ ...rec, reason: '公式の記載から掲載用の文を作れず', shuttleInfo: orig.shuttleInfo }); continue; }
  if (next.shuttleInfo && /無料/.test(next.shuttleInfo) && r.free_word_on_official !== true && !/有料/.test(next.shuttleInfo)) throw new Error(`${f.name}: 公式に「無料」の記載が無いのに「無料」を入れようとした`);
  const cur = { shuttleInfo: f.shuttleInfo ?? null, hasShuttle: !!f.hasShuttle };
  if (cur.shuttleInfo !== next.shuttleInfo || cur.hasShuttle !== next.hasShuttle) {
    changes.push({ ...rec, from: orig.shuttleInfo, to: next.shuttleInfo, hasShuttle: next.hasShuttle, free_on_official: r.free_word_on_official, quote: r.quote, notes: r.notes });
    if (next.shuttleInfo) f.shuttleInfo = next.shuttleInfo; else delete f.shuttleInfo;
    f.hasShuttle = next.hasShuttle;
  } else kept.push(rec);
}
// 監査用の記録（宿ごと）
const checked = Object.fromEntries(rows.map((r) => [r.name, { status: r.status, free_on_official: r.free_word_on_official, official_url: r.official_url, access_page_url: r.access_page_url }]));
const summary = { 宿: rows.length, 書き換え: changes.length, 公式と合っていて触らない: kept.length, 触らず一覧に残す: untouched.length, 無料を消した件: changes.filter((c) => /無料/.test(c.from || '') && !/無料/.test(c.to || '')).length, 無料を足した件: changes.filter((c) => !/無料/.test(c.from || '') && /無料/.test(c.to || '')).length, 送迎の文を消した件: changes.filter((c) => !c.to).length };
console.log(JSON.stringify(summary, null, 1));
if (dry) process.exit(0);
fs.writeFileSync(FILE, JSON.stringify(dests, null, 2) + '\n');
const w = (n, o) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(o, null, 2) + '\n');
w('before.json', before); w('changes.json', changes); w('untouched.json', untouched);
fs.writeFileSync(path.join(root, 'scripts/data/stayShuttleChecked.json'), JSON.stringify({ date: '2026-11-06', note: 'featured_stay の送迎を宿の公式サイトで確認した記録。status=verified だけが「公式で確認」。free_on_official が true の宿だけ「無料」と書いてよい', stays: checked }, null, 2) + '\n');
console.log('書き込み完了');
