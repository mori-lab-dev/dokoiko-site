#!/usr/bin/env node
/**
 * extractFactSentences20261118.mjs — 旅先ページの本文から「料金・休館日・営業時間・時刻・標高/距離・年号・その他の数値」の文を機械的に抜き出す（2026-11-18・読み取りのみ。サイトのファイルは変えない）。
 *   対象の本文: 記事の節（body・info）・見どころ（spots）の説明・モデルコース・tips。統合ページは article.groups（各見出しの節・モデルコース・tips）。
 *   除外: 応援割ページ・data-fact の枠（旅先ページには無い）・所要時間だけの数値（11/9に点検済み）・ページ冒頭の description・lead・bestSeason。
 *   単位: 文（「。」で区切る）または info の1行（「ラベル：値」）。
 *   種類（先に当たったものにする）: 料金 → 休館日 → 営業時間 → 時刻 → 標高・距離 → 年号 → その他の数値。
 * 出力: logs/audit_sample_20261118/units.json（全件）・counts.json（種類ごとの件数・含まれるページ数と割合）
 */
import fs from 'fs';
const OUT = 'logs/audit_sample_20261118'; fs.mkdirSync(OUT, { recursive: true });
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
import { RULES, sents, kindOf } from './lib/factRules20261118.mjs';
// 所要時間だけの文は対象外（分・時間・泊・日の数字しか無い）。種類の規則に当たらなければ、そもそも対象にならない
const units = [];
const add = (d, where, text) => { for (const s of sents(text)) { if (/^■/.test(s)) continue; const k = kindOf(s); if (k) units.push({ page: d.id, name: d.name, url: `/destinations/${d.id}/`, where, 種類: k, 文: s }); } };
for (const d of dests) {
  const f = `src/data/articles/${d.id}.json`; const a = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  if (a && a.groups) {
    for (const g of a.groups) { (g.sections || []).forEach((s, i) => { add(d, `${g.title}/節${i + 1}「${(s.title || '').split('｜')[0]}」body`, s.body); add(d, `${g.title}/節${i + 1}「${(s.title || '').split('｜')[0]}」info`, s.info); }); if (g.modelCourse) for (const v of Object.values(g.modelCourse)) add(d, `${g.title}/モデルコース`, v); add(d, `${g.title}/tips`, typeof g.tips === 'string' ? g.tips : (g.tips || []).join('\n')); }
  } else if (a) {
    (a.sections || []).forEach((s, i) => { add(d, `節${i + 1}「${(s.title || '').split('｜')[0]}」body`, s.body); add(d, `節${i + 1}「${(s.title || '').split('｜')[0]}」info`, s.info); });
    if (a.modelCourse) for (const v of Object.values(a.modelCourse)) add(d, 'モデルコース', v);
    add(d, 'tips', typeof a.tips === 'string' ? a.tips : (a.tips || []).join('\n'));
  }
  for (const sp of d.spots || []) add(d, `見どころ「${sp.name}」`, sp.description);
}
// 同じ文が同じページ内で重複する場合（節の本文と見どころの説明が同文など）は1件にする
const seen = new Set(); const uniq = units.filter((u) => { const k = `${u.page}|${u.文}`; if (seen.has(k)) return false; seen.add(k); return true; });
uniq.forEach((u, i) => { u.n = i + 1; });
fs.writeFileSync(`${OUT}/units.json`, JSON.stringify(uniq, null, 1));
const total = dests.length; const kinds = RULES.map((r) => r[0]);
const counts = { 旅先ページの総数: total, 抜き出した文の総数: uniq.length, 重複を除く前: units.length, 種類ごと: {} };
const pagesAny = new Set(uniq.map((u) => u.page));
counts.何らかの種類を含むページ = pagesAny.size; counts.何らかの種類を含むページの割合 = +(pagesAny.size / total * 100).toFixed(1);
for (const k of kinds) { const us = uniq.filter((u) => u.種類 === k); const pg = new Set(us.map((u) => u.page)); counts.種類ごと[k] = { 件数: us.length, 含むページ数: pg.size, ページの割合: +(pg.size / total * 100).toFixed(1) }; }
fs.writeFileSync(`${OUT}/counts.json`, JSON.stringify(counts, null, 1));
console.log(JSON.stringify(counts, null, 1));
