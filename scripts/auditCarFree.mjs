// 「車なしで行く」ガイド（destinations.json の carFree）の検査（2026-11-04 試作）。
// 規則:
//  - 各項目に https の出典URLと、日付形式の確認日がある（無ければ書かない）
//  - 本文に応援割・割引率の数字を書かない（このページには応援割の数字を載せない）
//  - バスの時刻・便数を書かない（「〇時〇分発」「1日〇便」「〇往復」）
//  - 時刻表リンクは https。確認できなかったことの一覧がある（空でもよいが配列であること）
//  - 確認日が MAX_AGE（14日）より古いものは再確認が要る
//  - ビルド済み dist に #carfree があり、項目数が一致する
// 使い方: node scripts/auditCarFree.mjs [--today YYYY-MM-DD]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argToday = process.argv.includes('--today') ? process.argv[process.argv.indexOf('--today') + 1] : null;
const today = argToday || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const MAX_AGE = 14;
const toIso = (j) => { const m = String(j ?? '').match(/(\d{4})年(\d{1,2})月(\d{1,2})日/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const targets = dests.filter((d) => d.carFree);

const noSource = [], noDate = [], banned = [], timeTable = [], oldCheck = [], noList = [], noDist = [];
const BANNED = /応援割|ふっこう|割引率|[0-9０-９]\s*[%％]/;
const TIMETABLE = /[0-9０-９]{1,2}[:：][0-9０-９]{2}\s*発|[0-9０-９]{1,2}時[0-9０-９]{0,2}分?\s*発|1日\s*[0-9０-９]+\s*(便|本|往復)|毎時\s*[0-9０-９]+\s*本/;

for (const d of targets) {
  const cf = d.carFree;
  if (!Array.isArray(cf.items) || !cf.items.length) noList.push(`${d.id}（項目なし）`);
  if (!Array.isArray(cf.unconfirmed)) noList.push(`${d.id}（確認できなかったことの一覧なし）`);
  for (const t of cf.timetable ?? []) if (!/^https:\/\//.test(t.url ?? '')) noSource.push(`${d.id}「${t.label}」の時刻表URL`);
  for (const it of cf.items ?? []) {
    const tag = `${d.id}「${it.label}」`;
    if (!/^https:\/\//.test(it.source?.url ?? '') || !it.source?.label) noSource.push(tag);
    const iso = toIso(it.checked);
    if (!iso) noDate.push(tag);
    else if (days(iso, today) > MAX_AGE) oldCheck.push(`${tag}（${it.checked}）`);
    const text = `${it.label} ${it.body}`;
    if (BANNED.test(text)) banned.push(`${tag}: ${text.match(BANNED)[0]}`);
    if (TIMETABLE.test(text)) timeTable.push(`${tag}: ${text.match(TIMETABLE)[0]}`);
  }
  // dist
  const f = path.join(root, 'dist', 'destinations', d.id, 'index.html');
  if (fs.existsSync(f)) {
    const html = fs.readFileSync(f, 'utf8');
    const n = (html.match(/data-carfree-item/g) || []).length;
    if (!/id="carfree"/.test(html) || n !== (cf.items ?? []).length) noDist.push(`${d.id}（画面 ${n} / データ ${(cf.items ?? []).length}）`);
    const sec = html.match(/<div class="carfree-section"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? '';
    if (BANNED.test(sec.replace(/<[^>]+>/g, ' '))) banned.push(`${d.id}（画面）`);
  } else noDist.push(`${d.id}（dist が無い）`);
}

const fmt = (a) => (a.length ? ' ' + a.join(', ') : '');
console.log(`車なしガイド ${targets.length} 件（${targets.map((d) => d.id).join(', ')}）・基準日 ${today}`);
console.log(`出典URL（https）が無い: ${noSource.length}件${fmt(noSource)}`);
console.log(`確認日が無い・日付形式でない: ${noDate.length}件${fmt(noDate)}`);
console.log(`確認日が${MAX_AGE}日より古い: ${oldCheck.length}件${fmt(oldCheck)}`);
console.log(`応援割・割引率の記述: ${banned.length}件${fmt(banned)}`);
console.log(`バスの時刻・便数の記述: ${timeTable.length}件${fmt(timeTable)}`);
console.log(`項目・一覧の不備: ${noList.length}件${fmt(noList)}`);
console.log(`画面（dist）との不一致: ${noDist.length}件${fmt(noDist)}`);
process.exit(noSource.length + noDate.length + oldCheck.length + banned.length + timeTable.length + noList.length + noDist.length ? 1 : 0);
