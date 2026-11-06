// travelTime の補正と、怪しい所要時間の文の削除（2026-11-06）。何度流しても同じ結果になる（補正前の値から計算し直す）。
//   STEP 1: 最短値を1.25倍以上下回る組を最短値に置き換える（元の値は travelTimeOriginal、置き換えた組と式由来の出発地は travelTimeEstimated）
//           公式の区間の合計（OFFICIAL_FLOORS）も下限にする（max(今の値, 下限)）
//   STEP 2: 補正後の値で日帰りの分類（最短の出発地が120分以内）を判定し直す
//   STEP 3: description の所要時間の文のうち、疑わしい組・式由来の出発地・travelTime と一致しない・値がないものを削除する
// 使い方: node scripts/fixTravelTime.mjs [--dry]
import fs from 'fs';
import path from 'path';
import {
  root, ORIGINS, NAME_TO_KEY, FORMULA_ORIGINS, OFFICIAL_FLOORS, lowerBound, lowerBoundOld, ceil5, RATIO, baseValue,
  originTimePattern, minutesOf, splitSentences, isAllowedText,
} from './travelTimeBound.mjs';

const dry = process.argv.includes('--dry');
const FILE = path.join(root, 'src/data/destinations.json');
const dests = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const hubIds = new Set(JSON.parse(fs.readFileSync(path.join(root, 'src/data/hubCities.json'), 'utf8')).map((h) => h.id));
hubIds.add('miyako'); // hub id miyakojima ⇔ travelTime の key miyako
const OUT = path.join(root, 'backup/travelTime_20261106');
fs.mkdirSync(OUT, { recursive: true });

// ── 変更前の退避（すでにあれば上書きしない）──
const backup = (name, obj) => { const f = path.join(OUT, name); if (!fs.existsSync(f)) fs.writeFileSync(f, JSON.stringify(obj, null, 2) + '\n'); };
if (!dry) {
  backup('travelTime.json', Object.fromEntries(dests.map((d) => [d.id, d.travelTimeOriginal ? { ...d.travelTime, ...d.travelTimeOriginal } : d.travelTime])));
  backup('description.json', Object.fromEntries(dests.map((d) => [d.id, d.description])));
  backup('stayAllowed.json', Object.fromEntries(dests.map((d) => [d.id, d.stayAllowed])));
}

const stats = { pairs: 0, oldFlagged: 0, newFlaggedAny: 0, replacedByRule: 0, replacedByOfficial: 0, replacedBoth: 0, ratio100to125: 0, formulaMarked: 0, replacedTotal: 0 };
const changes = [];      // 置き換えた組
const suspect = new Set(); // 'id|key'  疑わしい（前回の869組 ∪ 今回の最短値を下回る組 ∪ 置き換えた組）
const floors = new Map(OFFICIAL_FLOORS.map((f) => [`${f.id}|${f.o}`, f]));
const ratio100 = [];

for (const d of dests) {
  const tt = d.travelTime || {};
  const orig = { ...(d.travelTimeOriginal || {}) };
  const est = {};
  for (const key of Object.keys(tt)) {
    if (!ORIGINS[key] || !Number.isFinite(tt[key]) || tt[key] <= 0) continue;
    stats.pairs++;
    const m0 = baseValue(d, key);
    const o = lowerBoundOld(d, key), n = lowerBound(d, key);
    if (m0 < o.lb - 0.5) { stats.oldFlagged++; suspect.add(`${d.id}|${key}`); }
    if (m0 < n.lb - 0.5) { stats.newFlaggedAny++; suspect.add(`${d.id}|${key}`); }
    let next = m0; const why = [];
    if (n.lb / m0 >= RATIO) { next = Math.max(next, ceil5(n.lb)); why.push('rule'); }
    else if (m0 < n.lb - 0.5) ratio100.push({ id: d.id, key, m0, lb: Math.round(n.lb) });
    const f = floors.get(`${d.id}|${key}`);
    if (f && f.floor > m0) { next = Math.max(next, f.floor); why.push('official'); }
    if (next > m0) {
      orig[key] = m0; tt[key] = next; est[key] = true; suspect.add(`${d.id}|${key}`);
      changes.push({ id: d.id, name: d.name, o: key, from: m0, to: next, dist: Math.round(n.dist), lb: Math.round(n.lb), why: why.join('+') });
      stats.replacedTotal++;
      if (why.length === 2) stats.replacedBoth++; else if (why[0] === 'rule') stats.replacedByRule++; else stats.replacedByOfficial++;
    } else { tt[key] = m0; delete orig[key]; }
    if (FORMULA_ORIGINS[key]) { est[key] = true; stats.formulaMarked++; }
  }
  if (Object.keys(orig).length) d.travelTimeOriginal = orig; else delete d.travelTimeOriginal;
  if (Object.keys(est).length) d.travelTimeEstimated = est; else delete d.travelTimeEstimated;
}
stats.ratio100to125 = ratio100.length;

// ── STEP 2: 日帰りの分類を判定し直す ──
const stayFile = path.join(OUT, 'stayAllowed.json');
const stayBefore = fs.existsSync(stayFile) ? JSON.parse(fs.readFileSync(stayFile, 'utf8')) : Object.fromEntries(dests.map((d) => [d.id, [...(d.stayAllowed || [])]]));
const dayChanges = [];   // 旅先ごと（stayAllowed から daytrip が外れる）
const hubDayChanges = []; // ハブごとの日帰りタブ（120分以内 → 超）
for (const d of dests) {
  const tt = d.travelTime || {};
  const stay = stayBefore[d.id] || [];   // 補正前の分類から判定し直す（何度流しても同じ）
  if (stay.includes('daytrip')) {
    const mn = Math.min(...Object.values(tt));
    if (mn > 120) {
      const next = stay.filter((s) => s !== 'daytrip');
      const was = [...stay];
      d.stayAllowed = next.length ? next : ['1night'];
      dayChanges.push({ id: d.id, name: d.name, was, now: d.stayAllowed, minOrigin: Math.min(...Object.values(tt)) });
    } else d.stayAllowed = [...stay];
  }
}
for (const c of changes) {
  const d = dests.find((x) => x.id === c.id);
  const before = c.from <= 120, after = c.to <= 120;
  if (hubIds.has(c.o) && before && !after && (stayBefore[c.id] || []).includes('daytrip')) hubDayChanges.push({ id: c.id, name: d.name, o: c.o, from: c.from, to: c.to });
}

// ── STEP 3: 本文の所要時間の文 ──
const deleted = [], keptReport = [];
const reasonOf = (d, mt) => {
  const key = NAME_TO_KEY[mt[1]]; const v = baseValue(d, key); const text = minutesOf(mt);
  if (suspect.has(`${d.id}|${key}`)) return '疑わしい組（最短値を下回る・補正した）';
  if (FORMULA_ORIGINS[key]) return '式由来の出発地';
  if (v === undefined || v === null) return 'その出発地の値がない';
  if (v !== text) return `travelTime(${v}分)と一致しない`;
  return null;
};
const judge = (d, sentence) => {
  const re = originTimePattern(); let m, reasons = [];
  while ((m = re.exec(sentence))) { const r = reasonOf(d, m); if (r) reasons.push(`${m[1]}:${r}`); }
  return reasons;
};
const stripped = {};
const descFile = path.join(OUT, 'description.json');
const descBefore = fs.existsSync(descFile) ? JSON.parse(fs.readFileSync(descFile, 'utf8')) : {};  // 流し直しても退避した元の文から削除する
for (const d of dests) {
  const srcDesc = descBefore[d.id] ?? d.description;
  const parts = splitSentences(srcDesc);
  const keep = [];
  for (const s of parts) {
    const reasons = judge(d, s);
    if (reasons.length && !isAllowedText(d.id, s)) deleted.push({ id: d.id, name: d.name, field: 'description', sentence: s, reasons });
    else keep.push(s);
  }
  if (keep.length !== parts.length) { stripped[d.id] = srcDesc; d.description = keep.join(''); } else d.description = srcDesc;
  // メタ・車なしの description は変えず、該当があれば報告
  for (const [field, t] of [['seo.description', d.seo?.description], ['carFree.seo.description', d.carFree?.seo?.description]]) {
    for (const s of splitSentences(t)) { const reasons = judge(d, s); if (reasons.length && !isAllowedText(d.id, s)) keptReport.push({ id: d.id, field, sentence: s, reasons }); }
  }
}
// 記事・spots・featured_stay は削除せず一覧にする
const ART = path.join(root, 'src/data/articles');
const notDeleted = [];
for (const d of dests) {
  const bodies = [];
  const f = path.join(ART, `${d.id}.json`);
  if (fs.existsSync(f)) {
    const a = JSON.parse(fs.readFileSync(f, 'utf8'));
    bodies.push(['記事lead', a.lead]);
    for (const s of a.sections || []) bodies.push(['記事本文', `${s.body || ''}\n${s.info || ''}`]);
  }
  for (const s of d.spots || []) if (s && typeof s === 'object') bodies.push(['spots', s.description || s.desc || '']);
  if (d.featured_stay && typeof d.featured_stay === 'object') bodies.push(['featured_stay', Object.values(d.featured_stay).filter((v) => typeof v === 'string').join(' ')]);
  for (const [field, t] of bodies) for (const s of String(t || '').split(/[。\n]/)) {
    if (!s) continue;
    const reasons = judge(d, s);
    if (reasons.length) notDeleted.push({ id: d.id, name: d.name, field, sentence: s.slice(0, 100), reasons });
  }
}

const summary = {
  stats, dayChanges: dayChanges.length, hubDayChanges: hubDayChanges.length,
  descriptionSentencesDeleted: deleted.length, descriptionsChanged: Object.keys(stripped).length,
  metaOrCarFreeDescriptionHits: keptReport.length, notDeletedInArticles: notDeleted.length,
  notDeletedByField: notDeleted.reduce((a, x) => ((a[x.field] = (a[x.field] || 0) + 1), a), {}),
  deletedByReason: deleted.reduce((a, x) => { for (const r of x.reasons) { const k = r.split(':').slice(1).join(':').replace(/\(\d+分\)/, ''); a[k] = (a[k] || 0) + 1; } return a; }, {}),
};
console.log(JSON.stringify(summary, null, 2));
if (dry) process.exit(0);

fs.writeFileSync(FILE, JSON.stringify(dests, null, 2) + '\n');
const log = (name, obj) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2) + '\n');
log('changes.json', changes);
fs.mkdirSync(path.join(root, 'scripts/data'), { recursive: true });
fs.writeFileSync(path.join(root, 'scripts/data/descTimeTrimmed.json'), JSON.stringify({
  date: '2026-11-06', note: '所要時間の文を削除した description。descStyleCheck は数値・字数・短文の条件を、この一覧には適用しない（数字を作らないため）',
  ids: Object.keys(stripped).sort(),
}, null, 2) + '\n');
log('dayChanges.json', { dests: dayChanges, hubTabs: hubDayChanges });
log('deletedSentences.json', deleted);
log('notDeleted_articles_spots_stay.json', notDeleted);
log('metaDescriptionHits.json', keptReport);
log('ratio100to125_untouched.json', ratio100);
console.log('書き込み: src/data/destinations.json / バックアップ: backup/travelTime_20261106/');
