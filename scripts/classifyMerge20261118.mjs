#!/usr/bin/env node
/**
 * classifyMerge20261118.mjs — 集まりごとの判定案（2026-11-18）。読み取りのみ。入力は surveyMerge20261118.mjs の出力。
 * 判定の基準（表示の下限などは、実測の分布から決めた提案値。変えるときはここの定数）:
 *   保留    : 1つ以上が「登録済み かつ 表示（累計）が1以上」／自分の名前の検索語でクリックがある／ページのクリックが1以上
 *   条件付き: 保留の条件に当たるが、登録済みで表示があるページが1つだけ・集まり全体の表示（累計）が LOW_IMPR 以下・クリック0 → その登録済みページのURLを代表に残せば統合できる
 *   統合候補: 保留でなく、(全ページが未登録) または (集まり全体の表示（累計）が LOW_IMPR 以下 かつ 全ページの本文が SHORT 字未満)
 *   独立のまま: 集まりに入らない旅先（近くに同じ県の旅先が無い）・手で決めた「別の需要がある」もの
 *   上のどれにも当たらない（登録済みだが表示0で本文が長い）ものは「保留（弱）」
 */
import fs from 'fs';
const OUT = 'logs/merge_20261118';
const LOW_IMPR = 2, SHORT = 600;
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const pages = J(`${OUT}/pages.json`); const P = new Map(pages.map((p) => [p.id, p]));
const registered = (p) => p.インデックス === '登録済み';
const cat = (ms) => {
  const hold = ms.some((p) => (registered(p) && p.表示_累計 >= 1) || p.自分の名前の検索語_クリック > 0 || p.クリック_累計 > 0);
  if (hold) { const imp = ms.reduce((n, p) => n + p.表示_累計, 0), clk = ms.reduce((n, p) => n + p.クリック_累計 + p.自分の名前の検索語_クリック, 0); return ms.filter((p) => registered(p) && p.表示_累計 >= 1).length <= 1 && imp <= LOW_IMPR && clk === 0 ? '条件付き（登録済みを代表に）' : '保留'; }
  const allUnreg = ms.every((p) => !registered(p));
  const low = ms.reduce((s, p) => s + p.表示_累計, 0) <= LOW_IMPR && ms.every((p) => p.本文字数 < SHORT);
  if (allUnreg || low) return '統合候補';
  return '保留（弱）';
};
const rep = (ms) => [...ms].sort((a, b) => (registered(b) - registered(a)) || b.表示_累計 - a.表示_累計 || b.内部リンク_入る - a.内部リンク_入る || b.本文字数 - a.本文字数)[0];
const out = {};
for (const T of [5, 10, 15]) {
  const gs = J(`${OUT}/clusters_${T}km.json`).map((g) => { const ms = g.ids.map((id) => P.get(id)); const r = rep(ms); return { ...g, 判定: cat(ms), 代表: r.id, 表示_累計: ms.reduce((s, p) => s + p.表示_累計, 0), 表示_28日: ms.reduce((s, p) => s + p.表示_28日, 0), クリック_累計: ms.reduce((s, p) => s + p.クリック_累計, 0), 登録済み: ms.filter(registered).length, 本文字数合計: ms.reduce((s, p) => s + p.本文字数, 0), 画像なし: ms.filter((p) => p.ヒーロー画像なし).length, 同名: ms.filter((p) => p.同名の重複).length }; });
  const by = {}; for (const g of gs) { const b = (by[g.判定] ||= { 集まり: 0, ページ: 0, 消えるページ: 0, 消えるページの表示_累計: 0, 消えるページのクリック_累計: 0 }); b.集まり++; b.ページ += g.件数; b.消えるページ += g.件数 - 1; for (const id of g.ids) if (id !== g.代表) { b.消えるページの表示_累計 += P.get(id).表示_累計; b.消えるページのクリック_累計 += P.get(id).クリック_累計; } }
  out[T] = { 判定ごと: by, 集まり: gs };
  fs.writeFileSync(`${OUT}/clusters_${T}km_judged.json`, JSON.stringify(gs, null, 1));
}
fs.writeFileSync(`${OUT}/classify_summary.json`, JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.判定ごと])), null, 1));
console.log(JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.判定ごと])), null, 1));
