#!/usr/bin/env node
/**
 * checkPriorityFixes20261118.mjs — 優先ページの修正・削除（scripts/data/mergeFactFixes20261118d.json）の機械検査（2026-11-18）。適用前のファイルに、全部を順に当てて調べる。
 *   ① 公式の値への修正（P1・P3）: 記録した「値」が、snapshots の該当ファイルの本文に実在する（空白・全角半角・波ダッシュをそろえて比べる）。snapshot が無い・URL行が無いものは落ちる
 *   ② 修正と削除のすべてに記録（ページ・旧文・新文・規則・理由・確認日。P1・P1d・P3 は出典URLも）がある。旧文が、その時点の対象の欄に1回だけ当たる
 *   ③ 新しい数字は、記録した公式の値の数字だけ。新しい文は増えない（P1: 新文に「。」が増えない・長さが旧文+40字以内・旧文の「。」の数を超えない／P2・P1d: new が空／P3: 旧文から先頭の時刻を外しただけ）
 *   ④ 固有名詞が増えない（新しく出た語は、公式の値・値の中の語だけ）
 * usage: node scripts/checkPriorityFixes20261118.mjs [edits.json]   終了コード: 落ちれば 1
 */
import fs from 'fs';
const file = process.argv[2] || 'scripts/data/mergeFactFixes20261118d.json';
const D = 'logs/priority_fix_20261118';
const cfg = JSON.parse(fs.readFileSync(file, 'utf8')); const edits = cfg.fixes.flatMap((f) => f.edits);
const cache = new Map(); const load = (f) => { if (!cache.has(f)) cache.set(f, JSON.parse(fs.readFileSync(f, 'utf8'))); return cache.get(f); };
const norm = (s) => String(s).normalize('NFKC').replace(/[\s　]/g, '').replace(/[～〜~－ー−–—]/g, '〜').replace(/[,，]/g, '');
const NUM = /[0-9]+:[0-9]{2}|[0-9]+(?:\.[0-9]+)?/g;
const NOUN = /[゠-ヿ]{2,}|[一-鿿々]{2,}|[A-Za-z]{2,}/g;
const bag = (t, re) => { const m = new Map(); const x0 = String(t).normalize('NFKC'); for (const x of x0.match(re) || []) m.set(x, (m.get(x) || 0) + 1); return m; };
const missing = (a, b) => { for (const [k, n] of a) if ((b.get(k) || 0) < n) return k; return null; };
const TIME_LEAD = /(^|→\s*|[：:】]\s*|\n\s*)((?:[0-9０-９]{1,2}:[0-9０-９]{2})|(?:[0-9０-９]{1,2}時(?:[0-9０-９]{1,2}分)?))(?:頃|ごろ)?\s*/;
const failKeys = [];
const F = { '①値がsnapshotに無い': [], '②記録・一意': [], '③数字・文が増える': [], '④固有名詞が増える': [] };
const holderOf = (e) => { const data = load(e.file); if (e.dest) { const d = data.find((x) => x.id === e.dest); const ks = e.field.split('.'); const key = ks.pop(); return [ks.length ? ks.reduce((a, k) => a[k], d) : d, key]; } if (e.spot) { const sp = data.find((x) => x.id === e.spot[0]).spots.find((s) => s.name === e.spot[1]); return [sp, 'description']; } const g = e.group ? data.groups.find((x) => x.id === e.group) : data; const ks = e.field.split('.'); const key = ks.pop(); return [ks.length ? ks.reduce((a, k) => a[k], g) : g, key]; };
const snapCache = new Map(); const snap = (p) => { if (!snapCache.has(p)) snapCache.set(p, fs.existsSync(`${D}/${p}`) ? fs.readFileSync(`${D}/${p}`, 'utf8') : null); return snapCache.get(p); };
let removed = 0;
for (const e of edits) {
  const tag = `${e.page}|${e.rule}|${String(e.old).slice(0, 28)}`;
  // ②
  const need = ['page', 'rule', 'reason', '確認日', 'old']; const miss = need.filter((k) => !e[k]); if (typeof e.new !== 'string') miss.push('new');
  if (['P1', 'P1d', 'P3'].includes(e.rule) && !(e.出典URL && e.出典URL.length)) miss.push('出典URL');
  if (e.確認日 !== '2026-11-18') miss.push('確認日の値');
  if (miss.length) F['②記録・一意'].push(`${tag}（記録なし: ${miss.join(',')}）`);
  let cur; try { const [h, key] = holderOf(e); cur = h[key]; var H = h, K = key; } catch { F['②記録・一意'].push(`${tag}（対象の欄が無い）`); continue; }
  const cnt = typeof cur === 'string' ? cur.split(e.old).length - 1 : 0; if (cnt !== 1) { F['②記録・一意'].push(`${tag}（old が${cnt}回）`); continue; }
  // ①
  if (e.rule === 'P1' || e.rule === 'P3') {
    const vals = e.値 || []; const sn = e.snapshot ? snap(e.snapshot) : null;
    if (!vals.length) F['①値がsnapshotに無い'].push(`${tag}（値が空）`);
    else if (sn === null) F['①値がsnapshotに無い'].push(`${tag}（snapshot が無い）`);
    else { const nsn = norm(sn); if (!/^URL:\s*http/m.test(sn)) F['①値がsnapshotに無い'].push(`${tag}（URL行なし）`); for (const v of vals) if (!nsn.includes(norm(v))) F['①値がsnapshotに無い'].push(`${tag}（値「${v}」が写しに無い）`); }
  }
  // ③
  const valText = [e.公式の値 || '', ...(e.値 || [])].join(' ');
  if (e.rule === 'P1') {
    const added = missing(bag(e.new, NUM), bag(e.old + ' ' + (e.値 || []).join(' '), NUM)); if (added) F['③数字・文が増える'].push(`${tag}（新しい数字 ${added}）`);
    if ((e.new.match(/。/g) || []).length > (e.old.match(/。/g) || []).length) F['③数字・文が増える'].push(`${tag}（文が増える）`);
    if (e.new.length > e.old.length + 40) F['③数字・文が増える'].push(`${tag}（新文が長い）`);
  } else if (e.rule === 'P3') {
    if (e.old.replace(TIME_LEAD, '$1') !== e.new) F['③数字・文が増える'].push(`${tag}（時刻外し以外）`);
  } else if (e.new !== '') F['③数字・文が増える'].push(`${tag}（削除なのに new がある）`);
  // ④
  const nb = missing(bag(e.new, NOUN), new Map([...bag(e.old, NOUN)].concat([...bag(valText, NOUN)]).reduce((m, [k, n]) => (m.set(k, (m.get(k) || 0) + n), m), new Map()))); if (nb) F['④固有名詞が増える'].push(`${tag}（増えた: ${nb}）`);
  H[K] = cur.replace(e.old, e.new); removed += e.old.length - e.new.length;
}
const FK = []; for (const [k, v] of Object.entries(F)) if (!k.startsWith('②')) for (const m of v) { const [page, rule, old] = m.split('|'); if (rule === 'P1' || rule === 'P3') FK.push({ page, rule, old: old.replace(/（.*$/, '') }); }
const prev = fs.existsSync(`${D}/fail_keys.json`) ? JSON.parse(fs.readFileSync(`${D}/fail_keys.json`, 'utf8')) : [];
const allFK = [...prev]; for (const k of FK) if (!allFK.some((x) => x.page === k.page && x.rule === k.rule && x.old === k.old)) allFK.push(k);
fs.writeFileSync(`${D}/fail_keys.json`, JSON.stringify(allFK, null, 1));   // 機械検査に落ちた置換・時刻外しの記録（build が削除・見送りに回す。累積）
const res = { 編集の数: edits.length, 検査: Object.fromEntries(Object.entries(F).map(([k, v]) => [k, { 落ちた件数: v.length, 例: v.slice(0, 8) }])), 減った字数の合計: removed };
fs.writeFileSync(`${D}/check_result.json`, JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); process.exit(Object.values(F).some((v) => v.length) ? 1 : 0);
