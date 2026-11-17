#!/usr/bin/env node
/**
 * じゃらん「九州ふっこう応援割」の受付停止の表示を、見張り（com.morilab.ops.jalan_kyushu_watch）の保存データから
 * src/data/jalanWatch.json に書き出す（2026-11-09）。通信しない。ページの文章は写さない（停止の表示の有無と「◯月◯日更新」だけ）。
 *
 *   node scripts/genJalanWatch.mjs            書き出す
 *   node scripts/genJalanWatch.mjs --check    書かずに中身を出す
 *
 * 保存データの場所は環境変数 JALAN_WATCH_DIR（既定 ~/.private/jalan_kyushu_watch）。
 * 読めないときは何も書かずに終了コード 1（前の jalanWatch.json がそのまま使われ、ページ側が取得時刻で古さを判定する）。
 */
import { readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

const DIR = process.env.JALAN_WATCH_DIR || path.join(homedir(), '.private', 'jalan_kyushu_watch');
const OUT = new URL('../src/data/jalanWatch.json', import.meta.url);
const STOP_RE = /受付を停止|受付停止|受付を終了|受付終了|完売|予算上限|終了しました/;
const UPDATED_RE = /（(\d{4}年\d{1,2}月\d{1,2}日)更新）/;

function load() {
  const snap = JSON.parse(readFileSync(path.join(DIR, 'snapshot.json'), 'utf8'));
  const times = JSON.parse(readFileSync(path.join(DIR, 'fetch_times.json'), 'utf8'));
  if (!Array.isArray(times) || times.length === 0) throw new Error('取得時刻の記録が空');
  const fetchedAt = new Date(Math.max(...times) * 1000);
  const pages = {};
  for (const [key, label] of [['stay', '国内宿・ホテル'], ['pack', 'じゃらんパック']]) {
    const p = snap[key] || {};
    const miy = p.miyazaki || [];
    // 宮崎県欄だけ行を持っている（見張りの保存の形）。第1期の【完売】だけでは「第2期の停止」にしない
    const stopLine = miy.find((x) => STOP_RE.test(x) && !/^【完売】$/.test(x.trim()));
    pages[key] = {
      label,
      found: (p.prefs_found || []).includes('宮崎県'),
      stopShown: Boolean(stopLine),
      updated: stopLine ? (stopLine.match(UPDATED_RE) || [])[1] || null : null,
    };
  }
  // 停止の表示がある県の一覧（宮崎以外の県は行を持たないので、県名の一覧だけ）
  const stopped = { stay: snap.stay?.stopped || [], pack: snap.pack?.stopped || [] };
  return { fetchedAt: fetchedAt.toISOString(), source: 'じゃらん公式の案内「九州ふっこう応援割」の宮崎県欄（自動取得）', miyazaki: pages, stopped };
}

let data;
try {
  data = load();
} catch (e) {
  console.error(`✗ 見張りの保存データを読めない（${e.constructor.name}）。jalanWatch.json は書き換えない`);
  process.exit(1);
}
const text = JSON.stringify(data, null, 1) + '\n';
if (process.argv.includes('--check')) {
  process.stdout.write(text);
} else {
  writeFileSync(OUT, text);
  console.log(`✅ jalanWatch.json（取得 ${data.fetchedAt}・国内宿 停止の表示=${data.miyazaki.stay.stopShown}・パック=${data.miyazaki.pack.stopShown}）`);
}
