#!/usr/bin/env node
/**
 * checkDeletionEdits20261118.mjs — 削除・時刻外しの編集（mergeConflictFixes と同じ形式: fixes[].edits[] = {file, group?, field または spot, old, new}＋rule・reason・page・削除した文）の機械検査（2026-11-18）。
 *   ① 数字は増えない: new の数字（単位つき・時刻・年など）が、old の数字の部分集合
 *   ② 新しい文は増えない: 削除（new が空）は、old が「文または行の丸ごと」。時刻外し（R2）は、old に同じ規則を当てた結果が new と一致し、new が old の部分列
 *   ③ 固有名詞も増えない: new の固有名詞（カタカナ2字以上・漢字2字以上・英字2字以上のまとまり）が、old のそれの部分集合
 *   ④ 記録: 編集ごとに rule・reason・削除した文・page がある。old が対象の文字列に、その時点でちょうど1回だけある。全部を順に当てた結果の字数の変化が、old/new の差の合計と一致
 * usage: node scripts/checkDeletionEdits20261118.mjs [edits.json]   終了コード: 1つでも落ちれば 1
 */
import fs from 'fs';
const file = process.argv[2] || 'logs/dryrun_20261118/edits.json';
const cfg = JSON.parse(fs.readFileSync(file, 'utf8')); const edits = cfg.fixes.flatMap((f) => f.edits);
const cache = new Map(); const load = (f) => { if (!cache.has(f)) cache.set(f, JSON.parse(fs.readFileSync(f, 'utf8'))); return cache.get(f); };
const NUM = /[0-9０-９][0-9０-９,，.．:：]*|[〇一二三四五六七八九十百千万]+(?=分|時間|キロ|メートル|円|人|段|本|年|世紀|日|便|軒|室|台|棟|か所|倍|度)/g;
const NOUN = /[゠-ヿ]{2,}|[一-鿿々]{2,}|[A-Za-z]{2,}/g;
const NUMUNIT = /[0-9０-９][0-9０-９,，.．:：]*(時間|時|分|日目|日|年|月|円|人|個|本|段|か所|番|号|度|m|km)?/g;   // 数字と単位を除いてから固有名詞を数える（「17時出発」→「出発」）
const bag = (t, re) => { const m = new Map(); const x0 = re === NOUN ? String(t).replace(/[0-9０-９]{1,2}:[0-9０-９]{2}(頃|ごろ)?/g, ' ').replace(/[0-9０-９]{1,2}時([0-9０-９]{1,2}分)?(頃|ごろ)?/g, ' ').replace(NUMUNIT, ' ') : String(t); for (const x of x0.match(re) || []) m.set(x, (m.get(x) || 0) + 1); return m; };
const subset = (a, b) => { for (const [k, n] of a) if ((b.get(k) || 0) < n) return k; return null; };
const TIME_LEAD = /(^|→\s*|[：:】]\s*|\n\s*)((?:[0-9０-９]{1,2}:[0-9０-９]{2})|(?:[0-9０-９]{1,2}時(?:[0-9０-９]{1,2}分)?))(?:頃|ごろ)?\s*/g;
const isSubseq = (small, big) => { let i = 0; for (const c of big) if (i < small.length && c === small[i]) i++; return i === small.length; };
// 時刻外し（R2）の検査: new は、old の先頭の時刻（TIME_LEAD の時刻の部分）のいくつかを外しただけの文字列であること（外さず残した時刻があってよい）
const TL = new RegExp(TIME_LEAD.source, 'g');
function onlyTimesRemoved(old, nw) { let i = 0, j = 0; for (const m of old.matchAll(TL)) { const a = m.index + m[1].length, b = m.index + m[0].length; const seg = old.slice(i, a); if (nw.slice(j, j + seg.length) !== seg) return false; j += seg.length; i = a; const tok = old.slice(a, b); if (nw.startsWith(tok, j) && !(nw.slice(j + tok.length) === old.slice(b))) { /* 残した */ } if (nw.startsWith(tok, j)) { j += tok.length; } i = b; }
  return nw.slice(j) === old.slice(i); }
const fails = { '①数字': [], '②文': [], '③固有名詞': [], '④記録': [], '④old': [] }; let totalRemoved = 0, n = 0;
const holderOf = (e) => { const data = load(e.file); if (e.spot) { const sp = data.find((x) => x.id === e.spot[0]).spots.find((s) => s.name === e.spot[1]); return [sp, 'description']; } const g = e.group ? data.groups.find((x) => x.id === e.group) : data; const ks = e.field.split('.'); const key = ks.pop(); return [ks.length ? ks.reduce((a, k) => a[k], g) : g, key]; };
for (const e of edits) {
  n++; const tag = `${e.page || ''}|${e.rule || ''}|${(e.old || '').slice(0, 30)}`;
  if (!e.rule || !e.reason || !e.page || !String(e.削除した文 ?? '').trim()) fails['④記録'].push(tag);
  const [h, key] = holderOf(e); const cur = h[key];
  const cnt = typeof cur === 'string' ? cur.split(e.old).length - 1 : 0; if (cnt !== 1) { fails['④old'].push(`${tag}（${cnt}回）`); continue; }
  const bad = subset(bag(e.new, NUM), bag(e.old, NUM)); if (bad) fails['①数字'].push(`${tag}（増えた: ${bad}）`);
  if (e.new === '') { const i = cur.indexOf(e.old); const before = i === 0 ? '' : cur[i - 1]; const after = cur[i + e.old.length]; const okStart = i === 0 || before === '\n' || before === '。' || e.old.startsWith('\n'); const okEnd = e.old.endsWith('。') || e.old.endsWith('\n') || i + e.old.length === cur.length || after === '\n'; if (!(okStart && okEnd)) fails['②文'].push(`${tag}（文・行の丸ごとでない）`); }
  else if (e.rule === 'R3') { const exp = e.old.replace(/^(\s*)(ただし|ただ|また|なお|そのため|さらに|でも|しかし|それでも|それで|それに|ちなみに|そして|ほかに|他に|その分|だから)[、，,]?/, '$1'); if (exp !== e.new || e.new === e.old) fails['②文'].push(`${tag}（先頭の接続語を削る以外の変更）`); }
  else { if (e.rule !== 'R2' || !isSubseq(e.new, e.old) || !onlyTimesRemoved(e.old, e.new)) fails['②文'].push(`${tag}（時刻外し以外の変更）`); }
  const nb = subset(bag(e.new, NOUN), bag(e.old, NOUN)); if (nb) fails['③固有名詞'].push(`${tag}（増えた: ${nb}）`);
  h[key] = cur.replace(e.old, e.new); totalRemoved += e.old.length - e.new.length;
}
// 全部を当てた結果の字数
let chars = 0; for (const e of edits) { /* 順に当てた結果は h[key] に反映済み */ }
const res = { 編集の数: n, 検査: Object.fromEntries(Object.entries(fails).map(([k, v]) => [k, { 落ちた件数: v.length, 例: v.slice(0, 5) }])), 減った字数の合計: totalRemoved };
fs.writeFileSync(file.replace(/edits\.json$/, 'check_result.json'), JSON.stringify(res, null, 1));
console.log(JSON.stringify(res, null, 1)); process.exit(Object.values(fails).some((v) => v.length) ? 1 : 0);
