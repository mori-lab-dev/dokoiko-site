#!/usr/bin/env node
/**
 * islandsMerge20261118.mjs — 島の「手で決めるリスト」と、その実測・判定案（2026-11-18）。読み取りのみ。
 *   島の所属は、既存の旅先の名前と、公的な区分（市町村・諸島の名称）で判断できるものだけ入れた。迷うもの（所属が地域によって違う・総称ページ）は notSure に書き、まとめない。
 *   判定は scripts/classifyMerge20261118.mjs と同じ基準（保留／統合候補／保留（弱））。出力: logs/merge_20261118/islands.json
 */
import fs from 'fs';
const OUT = 'logs/merge_20261118';
const pages = JSON.parse(fs.readFileSync(`${OUT}/pages.json`, 'utf8')); const P = new Map(pages.map((p) => [p.id, p]));
const LOW_IMPR = 2, SHORT = 600;
const registered = (p) => p.インデックス === '登録済み';
const cat = (ms) => { const hold = ms.some((p) => (registered(p) && p.表示_累計 >= 1) || p.自分の名前の検索語_クリック > 0 || p.クリック_累計 > 0); if (hold) { const imp = ms.reduce((n, p) => n + p.表示_累計, 0), clk = ms.reduce((n, p) => n + p.クリック_累計 + p.自分の名前の検索語_クリック, 0); return ms.filter((p) => registered(p) && p.表示_累計 >= 1).length <= 1 && imp <= LOW_IMPR && clk === 0 ? '条件付き（登録済みを代表に）' : '保留'; } if (ms.every((p) => !registered(p)) || (ms.reduce((s, p) => s + p.表示_累計, 0) <= LOW_IMPR && ms.every((p) => p.本文字数 < SHORT))) return '統合候補'; return '保留（弱）'; };
const GROUPS = [
  { name: '隠岐諸島', ids: ['ama-island', 'nakanoshima-oki', 'nishinoshima', 'kuniga', 'oki-island'], note: '島前（海士町・中ノ島・西ノ島・国賀海岸）と島後（隠岐の島）。海士町と中ノ島は同じ島、国賀海岸は西ノ島の名所' },
  { name: '五島列島', ids: ['goto', 'fukue-island', 'kugashima'], notSure: ['ojika-island（小値賀島: 五島列島に含める区分と含めない区分がある。確認できず）'], note: '五島列島（総称ページ）・福江島・久賀島' },
  { name: '壱岐', ids: ['iki-island'], note: '1件のみ（まとめる相手なし）' },
  { name: '対馬', ids: ['tsushima'], note: '1件のみ（まとめる相手なし）' },
  { name: '伊豆諸島', ids: ['izu-oshima', 'toshima', 'niijima', 'shikinejima', 'kouzushima', 'miyakejima', 'mikurajima', 'hachijojima', 'aogashima'], note: '東京都の伊豆諸島9島。島どうしは船で別々に渡る（最大で約300km離れる）' },
  { name: '小笠原', ids: ['chichijima', 'hahajima'], note: '父島・母島（約50km）' },
  { name: '宮古諸島', ids: ['miyakojima', 'irabu-island', 'ikema-island', 'kurima-island', 'tarama-island'], note: '宮古島と周辺の島（多良間島は約60km離れる）' },
  { name: '八重山諸島', ids: ['ishigaki', 'taketomi-island', 'iriomote', 'kohama-island', 'kuroshima-yaeyama', 'hatoma-island', 'yubu-island', 'yonaguni-island', 'hateruma-island'], note: '八重山の島。与那国島・波照間島は離れる' },
  { name: '奄美群島', ids: ['amami', 'kakeroma-island', 'yorojima', 'kikai-island', 'tokunoshima', 'okinoerabu', 'yoron-island'], note: '奄美大島・加計呂麻島・与路島（近い）と、喜界・徳之島・沖永良部・与論（離れる）' },
  { name: '慶良間諸島', ids: ['tokashiki-jima', 'zamami-island', 'aka-island', 'aharen'], note: '渡嘉敷・座間味・阿嘉。阿波連ビーチは渡嘉敷島の海岸' },
  { name: '瀬戸内の島々（直島・豊島・犬島・男木・女木）', ids: ['naoshima', 'teshima', 'inujima', 'ogijima', 'megijima'], note: '直島周辺の芸術の島。小豆島は別（約20km）' },
  { name: '瀬戸内の島々（塩飽諸島）', ids: ['honjima', 'sanagijima', 'ibukijima'], note: '本島・佐柳島（近い）・伊吹島（離れる）' },
  { name: '瀬戸内の島々（笠岡諸島）', ids: ['kasaoka-islands', 'shiraishijima', 'manabeshima'], note: '笠岡諸島（総称ページ）と白石島・真鍋島' },
  { name: '瀬戸内の島々（しまなみ海道）', ids: ['omishima-island', 'ikuchijima', 'innoshima', 'hakatajima'].map((x) => (P.has(x) ? x : 'omishima-island')), note: '大三島・生口島・因島・伯方島' },
  { name: '礼文・利尻', ids: ['rebun-island', 'rebun-no-tour', 'rishiri-island'], note: '礼文島は同名の2ページ（rebun-island・rebun-no-tour）がある' },
  { name: '天売・焼尻', ids: ['teuri-island', 'gen_北海_焼尻島'], note: '羽幌町の2島' },
  { name: '大東諸島', ids: ['minamidaitojima', 'kitadaitojima'], note: '南大東島・北大東島（約13km）' },
];
const out = [];
for (const g of GROUPS) {
  const ms = g.ids.filter((id, i, a) => P.has(id) && a.indexOf(id) === i).map((id) => P.get(id));
  const missing = g.ids.filter((id) => !P.has(id));
  const hereRep = [...ms].sort((a, b) => (registered(b) - registered(a)) || b.表示_累計 - a.表示_累計 || b.内部リンク_入る - a.内部リンク_入る)[0];
  out.push({ グループ: g.name, 件数: ms.length, 判定: ms.length >= 2 ? cat(ms) : '1件のみ', 代表案: hereRep?.id, 注: g.note, 確認できず: [...(g.notSure || []), ...missing.map((m) => `${m}（データに無い）`)], ページ: ms.map((p) => ({ id: p.id, name: p.name, 本文字数: p.本文字数, 見どころ数: p.見どころ数, featured_stay: p.featured_stay, 画像数: p.画像数, ヒーロー画像なし: p.ヒーロー画像なし, 内部リンク入る: p.内部リンク_入る, 表示_28日: p.表示_28日, 表示_累計: p.表示_累計, クリック_累計: p.クリック_累計, インデックス: p.インデックス, lastmod: p.lastmod })) });
}
fs.writeFileSync(`${OUT}/islands.json`, JSON.stringify(out, null, 1));
for (const g of out) console.log(`${g.グループ}｜${g.件数}件｜${g.判定}｜代表案 ${g.代表案}｜表示累計 ${g.ページ.reduce((s, p) => s + p.表示_累計, 0)}｜登録済み ${g.ページ.filter((p) => p.インデックス === '登録済み').length}｜クリック ${g.ページ.reduce((s, p) => s + p.クリック_累計, 0)}｜確認できず ${g.確認できず.join(',')}`);
