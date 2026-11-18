#!/usr/bin/env node
// 抜き取り調査の標本を選ぶ（2026-11-18・読み取りのみ）。入力: logs/audit_sample_20261118/units.json（scripts/extractFactSentences20261118.mjs）。
// 選び方: 種類（7層）ごとに同数をそろえる（50件を7層に割り、料金だけ8件・ほかは7件）。各層の中は、乱数固定（mulberry32・seed 20261118）で無作為に選ぶ。
//         同じ旅先ページから2件以上選ばない（選ばれたページは、その後の層で候補から外す）。層の順は 料金→休館日→営業時間→時刻→標高・距離→年号→その他の数値。
import fs from 'fs';
const OUT = 'logs/audit_sample_20261118';
const units = JSON.parse(fs.readFileSync(`${OUT}/units.json`, 'utf8'));
const SEED = 20261118; let a = SEED >>> 0;
const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const KINDS = ['料金', '休館日', '営業時間', '時刻', '標高・距離', '年号', 'その他の数値'];
const quota = { 料金: 8, 休館日: 7, 営業時間: 7, 時刻: 7, '標高・距離': 7, 年号: 7, その他の数値: 7 };
const usedPages = new Set(); const picked = [];
for (const k of KINDS) {
  const pool = units.filter((u) => u.種類 === k && !usedPages.has(u.page));
  for (let i = 0; i < quota[k]; i++) { const j = Math.floor(rnd() * pool.length); const u = pool.splice(j, 1)[0]; usedPages.add(u.page); for (let x = pool.length - 1; x >= 0; x--) if (pool[x].page === u.page) pool.splice(x, 1); picked.push(u); }
}
picked.forEach((u, i) => { u.標本番号 = i + 1; });
fs.writeFileSync(`${OUT}/sample50.json`, JSON.stringify({ 乱数: 'mulberry32', seed: SEED, 層: quota, 件数: picked.length, 標本: picked }, null, 1));
for (const u of picked) console.log(`${u.標本番号}|${u.種類}|${u.page}|${u.name}|${u.where}|${u.文}`);
