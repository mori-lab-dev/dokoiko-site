#!/usr/bin/env node
/** visionReport20261120.mjs — Vision 検査の集計（読むだけ）: 内訳・使用額・2回とも同じ判定のものの一覧（疑いの強い順）・上位30の確認用の一覧を出す */
import fs from 'fs';
const O = 'logs/vision_20261120'; const rd = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const H = rd(`${O}/haiku.jsonl`), S = rd(`${O}/sonnet.jsonl`), N = rd(`${O}/name.jsonl`); const sMap = new Map(S.map((x) => [x.key, x]));
const cnt = (a, f) => a.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});
const both = H.filter((h) => (h.判定 === '別の場所' || h.判定 === '無関係') && sMap.get(h.key)?.判定 === h.判定).map((h) => ({ ...h, sonnet主題: sMap.get(h.key).主題, sonnet理由: sMap.get(h.key).理由 }));
// 疑いの強さ: 見どころ（旅先名とは別物）> ヒーロー。「別の場所」> 「無関係」。Haiku・Sonnet の主題が地名・施設名を含むものを上に
const score = (x) => (x.種類 === '見どころ' ? 2 : 0) + (x.判定 === '別の場所' ? 1 : 0) + (/[城寺神社塔橋]|大阪|京都|東京|富士|松島|東尋坊/.test(x.sonnet主題 || '') ? 0.5 : 0);
both.sort((a, b) => score(b) - score(a));
const usd = (a) => a.reduce((s, x) => s + (x.usd || 0), 0);
const out = { 枚数: { Haiku判定: H.length, Sonnet再判定: S.length, ファイル名のみ判定: N.length }, Haiku内訳: cnt(H, (x) => x.判定), Haiku種類別: cnt(H, (x) => `${x.種類}:${x.判定}`), Sonnet内訳: cnt(S, (x) => x.判定), '2回とも同じ判定': both.length, ファイル名内訳: cnt(N, (x) => x.判定),
  使用額_USD: { Haiku: +usd(H).toFixed(2), Sonnet: +usd(S).toFixed(2), ファイル名のみ: +usd(N).toFixed(2), 合計_known除く: +(usd(H) + usd(S) + usd(N)).toFixed(2) }, 上位: both.slice(0, 60).map((x) => ({ key: x.key, 種類: x.種類, 判定: x.判定, 旅先: x.旅先, 見どころ: x.見どころ, haiku: x.主題, sonnet: x.sonnet主題, 画像: x.画像 })) };
fs.writeFileSync(`${O}/report.json`, JSON.stringify(out, null, 1)); fs.writeFileSync(`${O}/both_all.json`, JSON.stringify(both, null, 1));
const nm = N.filter((x) => x.判定 === '別の場所'); fs.writeFileSync(`${O}/name_flagged.json`, JSON.stringify(nm, null, 1));
console.log(JSON.stringify({ ...out, 上位: undefined, ファイル名で別の場所: nm.length }, null, 1));
