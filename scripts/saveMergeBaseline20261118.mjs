// パイロット5地域の「統合前の基準値」を logs/merge_20261118/baseline_pilot.json に保存する（2026-11-18・読み取りのみ）。比較は公開の2〜3週間後に、同じ形で取り直して行う。
import fs from 'fs';
const OUT = 'logs/merge_20261118';
const P = new Map(JSON.parse(fs.readFileSync(`${OUT}/pages.json`, 'utf8')).map((p) => [p.id, p]));
const meta = JSON.parse(fs.readFileSync(`${OUT}/gsc_meta.json`, 'utf8'));
const PILOT = { 隠岐諸島: ['nishinoshima', 'ama-island', 'nakanoshima-oki', 'kuniga', 'oki-island'], 慶良間諸島: ['tokashiki-jima', 'zamami-island', 'aka-island', 'aharen'], 笠岡諸島: ['shiraishijima', 'kasaoka-islands', 'manabeshima'], 小笠原: ['chichijima', 'hahajima'], 人吉: ['hitoyoshi', 'hitoyoshi-city', 'hitoyoshi-onsen'] };
const out = { 取得日: meta.取得日, Search_Console_最新の日: meta.最新の日, 期間: meta.期間, インデックス状態の取得: '2026-11-17（logs/gsc/inspect_2026-11-17.jsonl）', 外部の被リンク: '確認できず', 地域: {} };
for (const [k, ids] of Object.entries(PILOT)) out.地域[k] = { 代表案: ids[0], ページ: ids.map((id) => { const p = P.get(id); return { id, url: p.url, 表示_28日: p.表示_28日, クリック_28日: p.クリック_28日, 表示_累計: p.表示_累計, クリック_累計: p.クリック_累計, 順位_累計: p.順位_累計, 上位の検索語_累計: p.上位の検索語_累計, インデックス: p.インデックス, 最終クロール: p.最終クロール, 内部リンク_入る: p.内部リンク_入る, lastmod: p.lastmod }; }) };
fs.writeFileSync(`${OUT}/baseline_pilot.json`, JSON.stringify(out, null, 1));
console.log('保存', Object.keys(out.地域).join(','));
