#!/usr/bin/env node
/**
 * auditOuenBodies.mjs — 応援割（src/data/ouenWari.ts）の更新で、「更新対象でない項目の本文が、更新の前後で変わっていない」ことを確かめる（2026-11-17）。
 *
 * 背景: 11/10 の更新スクリプトが、対象の項目だけでなく後ろの項目の本文も同じ文で上書きし、5県の7項目の本文が別の項目の文になった
 *       （確認日は新しいまま。画面の検査も通っていた）。更新の前後を比べる検査が無かったため、6日間気づけなかった。
 *
 * しくみ（前後の比較）
 *   ・logs/ouen_bodies_snapshot.json   … 前回「確定」した時点の、全項目（制度の state・booking・channels・facts・共通事項）の本文のハッシュ
 *   ・logs/ouen_update_targets.json    … 今回の更新が本文を変えるつもりの項目の一覧。更新スクリプトが書く（無ければ「変える項目なし」）
 *   検査: スナップショットと今の本文を比べ、更新対象に無い項目の本文が変わっていたら失敗。
 *   あわせて、同じ制度の中で本文が同じ別の項目（コピーされた症状）があっても失敗。
 *   確定: 更新を確かめたあとに `node scripts/auditOuenBodies.mjs --accept`（スナップショットを今の状態に更新し、更新対象を空にする）。
 *   項目の鍵: <slug>|state / <slug>|booking / <slug>|ch:<name> / <slug>|fact:<label> / PARENT|<label>（同名は #2, #3…）
 *
 * usage: node scripts/auditOuenBodies.mjs [--file <ouenWari.ts>] [--accept]
 *   --file   別の版のデータを読む（過去の版の検査・スナップショットの作成用）
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const val = (f, d = null) => (args.includes(f) ? args[args.indexOf(f) + 1] : d);
const FILE = path.resolve(val('--file', path.join(ROOT, 'src/data/ouenWari.ts')));
const SNAP = path.resolve(ROOT, val('--snapshot', 'logs/ouen_bodies_snapshot.json'));
const TARGETS = path.resolve(ROOT, val('--targets', 'logs/ouen_update_targets.json'));
const { SCHEMES, PARENT_FACTS } = await import(pathToFileURL(FILE).href);
const sha = (s) => crypto.createHash('sha1').update(String(s ?? '')).digest('hex').slice(0, 12);

/** 全項目 { 鍵 → { body, scheme } } */
function collect() {
  const m = new Map();
  const put = (k, body, scheme) => { let key = k, n = 2; while (m.has(key)) key = `${k}#${n++}`; m.set(key, { body: String(body ?? ''), scheme }); };
  for (const f of PARENT_FACTS) put(`PARENT|${f.label}`, f.body, 'PARENT');
  for (const s of SCHEMES) {
    put(`${s.slug}|state`, s.state, s.slug); put(`${s.slug}|booking`, s.booking, s.slug);
    for (const c of s.channels || []) put(`${s.slug}|ch:${c.name}`, c.body, s.slug);
    for (const f of s.facts || []) put(`${s.slug}|fact:${f.label}`, f.body, s.slug);
  }
  return m;
}
const items = collect();

if (args.includes('--accept')) {
  const snap = Object.fromEntries([...items].map(([k, v]) => [k, sha(v.body)]));
  fs.writeFileSync(SNAP, JSON.stringify(snap, null, 1) + '\n');
  fs.writeFileSync(TARGETS, JSON.stringify({ note: '更新スクリプトが、本文を変えるつもりの項目の鍵を書く。確定（--accept）で空に戻る', targets: [] }, null, 1) + '\n');
  console.log(`スナップショットを更新: ${Object.keys(snap).length}項目（更新対象は空に戻した）`);
  process.exit(0);
}
if (!fs.existsSync(SNAP)) { console.log('スナップショットが無い（' + path.relative(ROOT, SNAP) + '）。更新の前の状態で --accept して作る'); process.exit(1); }
const snap = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
const targets = new Set(fs.existsSync(TARGETS) ? (JSON.parse(fs.readFileSync(TARGETS, 'utf8')).targets || []) : []);

const changed = [], removed = [], added = [];
for (const [k, v] of items) { if (!(k in snap)) added.push(k); else if (snap[k] !== sha(v.body)) changed.push(k); }
for (const k of Object.keys(snap)) if (!items.has(k)) removed.push(k);
const unintended = [...changed, ...removed].filter((k) => !targets.has(k));
const dup = []; const byScheme = new Map();
for (const [k, v] of items) {
  if (v.body.length < 20 || /\|(state|booking)$/.test(k)) continue;
  const g = byScheme.get(v.scheme) ?? new Map(); const l = g.get(v.body) ?? []; l.push(k); g.set(v.body, l); byScheme.set(v.scheme, g);
}
for (const g of byScheme.values()) for (const l of g.values()) if (l.length > 1) dup.push(l.join(' = '));

console.log(`項目 ${items.size}（スナップショット ${Object.keys(snap).length}）・本文が変わった ${changed.length}・削除 ${removed.length}・新規 ${added.length}・更新対象 ${targets.size}`);
console.log(`更新対象でない項目の本文が変わっている: ${unintended.length}件`);
for (const k of unintended.slice(0, 20)) console.log('  ・' + k);
console.log(`同じ制度の中で本文が同じ別の項目: ${dup.length}件`);
for (const d of dup.slice(0, 20)) console.log('  ・' + d);
const targetsUnchanged = [...targets].filter((k) => !changed.includes(k) && !removed.includes(k));
console.log(`（参考）更新対象に挙げたが本文が変わっていない項目: ${targetsUnchanged.length}件`);
process.exit(unintended.length || dup.length ? 1 : 0);
