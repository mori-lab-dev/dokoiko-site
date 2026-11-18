// 全旅先ページの本文に出る地名と、そのページの県・座標・hub との機械的な突き合わせ（2026-11-18・読み取りのみ。変更しない）
//   地名: ① 都道府県名 ② 市区町村名（全ページの「住所：」から作った辞書。同名が複数県にあるものは除く） ③ 他の旅先・見どころの名前（3字以上・全体で1〜2か所にしか無い名前。座標は旅先の座標）
//   合わない: ①② は、ページの県と違い、かつ隣接県でない  ③ は、そのページの座標から 150km 以上離れた旅先・見どころの名前
//   除外の規則（記録）: (a) 隣接県の都道府県名・市区町村名 (b) 交通の起点・経由の記述（「〜から」「〜発」「〜着」「〜行き」「〜経由」「〜まで」「〜直通」「乗り継ぎ」のそば）(c) そのページの hub の都市名・主要ターミナルの都市名（東京・大阪・名古屋・京都・札幌・福岡・仙台・広島・横浜・神戸）(d) 旅先自身の名前・見どころの名前 (e) 3字未満・一般名詞（駅・港・温泉・神社・公園 など）(f) 「県」「市」の付かない略称は ①② の対象外
// 出力: logs/identity_20261118/scan_place_mismatch.json（全ページの疑い・件数）・scan_top.json（疑いの強い順）・rules.md（除外の規則）

import fs from 'fs';
const O = 'logs/identity_20261118'; const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dl = J('src/data/destinations.json'); const byId = new Map(dl.map((d) => [d.id, d]));
const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const ADJ = { 北海道: ['青森県'], 青森県: ['北海道', '岩手県', '秋田県'], 岩手県: ['青森県', '秋田県', '宮城県'], 宮城県: ['岩手県', '秋田県', '山形県', '福島県'], 秋田県: ['青森県', '岩手県', '宮城県', '山形県'], 山形県: ['秋田県', '宮城県', '福島県', '新潟県'], 福島県: ['宮城県', '山形県', '新潟県', '群馬県', '栃木県', '茨城県'], 茨城県: ['福島県', '栃木県', '埼玉県', '千葉県'], 栃木県: ['福島県', '茨城県', '埼玉県', '群馬県'], 群馬県: ['福島県', '栃木県', '埼玉県', '新潟県', '長野県'], 埼玉県: ['茨城県', '栃木県', '群馬県', '千葉県', '東京都', '山梨県', '長野県'], 千葉県: ['茨城県', '埼玉県', '東京都', '神奈川県'], 東京都: ['埼玉県', '千葉県', '神奈川県', '山梨県'], 神奈川県: ['東京都', '山梨県', '静岡県', '千葉県'], 新潟県: ['山形県', '福島県', '群馬県', '長野県', '富山県'], 富山県: ['新潟県', '長野県', '岐阜県', '石川県'], 石川県: ['富山県', '岐阜県', '福井県'], 福井県: ['石川県', '岐阜県', '滋賀県', '京都府'], 山梨県: ['埼玉県', '東京都', '神奈川県', '静岡県', '長野県'], 長野県: ['群馬県', '埼玉県', '山梨県', '静岡県', '愛知県', '岐阜県', '富山県', '新潟県'], 岐阜県: ['富山県', '石川県', '福井県', '長野県', '愛知県', '三重県', '滋賀県'], 静岡県: ['神奈川県', '山梨県', '長野県', '愛知県'], 愛知県: ['静岡県', '長野県', '岐阜県', '三重県'], 三重県: ['愛知県', '岐阜県', '滋賀県', '京都府', '奈良県', '和歌山県'], 滋賀県: ['福井県', '岐阜県', '三重県', '京都府'], 京都府: ['福井県', '滋賀県', '三重県', '奈良県', '大阪府', '兵庫県'], 大阪府: ['京都府', '兵庫県', '奈良県', '和歌山県'], 兵庫県: ['京都府', '大阪府', '鳥取県', '岡山県'], 奈良県: ['三重県', '京都府', '大阪府', '和歌山県'], 和歌山県: ['三重県', '奈良県', '大阪府'], 鳥取県: ['兵庫県', '岡山県', '島根県', '広島県'], 島根県: ['鳥取県', '広島県', '山口県'], 岡山県: ['兵庫県', '鳥取県', '広島県', '香川県'], 広島県: ['鳥取県', '島根県', '岡山県', '山口県', '愛媛県'], 山口県: ['島根県', '広島県', '福岡県'], 徳島県: ['香川県', '愛媛県', '高知県', '兵庫県', '和歌山県'], 香川県: ['徳島県', '愛媛県', '岡山県'], 愛媛県: ['香川県', '徳島県', '高知県', '広島県', '大分県'], 高知県: ['徳島県', '愛媛県'], 福岡県: ['山口県', '佐賀県', '熊本県', '大分県'], 佐賀県: ['福岡県', '長崎県'], 長崎県: ['佐賀県'], 熊本県: ['福岡県', '大分県', '宮崎県', '鹿児島県'], 大分県: ['福岡県', '熊本県', '宮崎県', '愛媛県'], 宮崎県: ['大分県', '熊本県', '鹿児島県'], 鹿児島県: ['熊本県', '宮崎県'], 沖縄県: ['鹿児島県'] };
const HUBS = ['東京', '大阪', '名古屋', '京都', '札幌', '福岡', '仙台', '広島', '横浜', '神戸'];
const ACCESS = /(から|発|着|行き|経由|直通|乗り継|乗り換|まで|方面|起点|拠点|周遊|空港|新幹線|特急|フェリー|バス)/;
const km = (a, b) => { const R = 6371, t = (x) => (x * Math.PI) / 180; const dLat = t(b.lat - a.lat), dLng = t(b.lng - a.lng); const s = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
// 辞書: 市区町村 → 県（全ページの「住所：」から）
const muni = new Map(); const addrRe = new RegExp(`(${PREFS.join('|')})([^\\s、。（）()\\d]{1,9}?[市区町村])`, 'g');
const arts = new Map(); for (const d of dl) { const f = `src/data/articles/${d.id}.json`; if (fs.existsSync(f)) arts.set(d.id, J(f)); }
const allText = (d) => { const a = arts.get(d.id); const parts = [['description', d.description]]; for (const sp of d.spots || []) parts.push([`見どころ「${sp.name}」`, sp.description]); const scan = (h, g) => { parts.push([`${g || ''}lead`, h.lead]); (h.sections || []).forEach((s, i) => { parts.push([`${g || ''}節${i + 1} body`, s.body]); parts.push([`${g || ''}節${i + 1} info`, s.info]); parts.push([`${g || ''}節${i + 1} 見出し`, s.title]); }); parts.push([`${g || ''}tips`, typeof h.tips === 'string' ? h.tips : '']); if (h.modelCourse) for (const [k, v] of Object.entries(h.modelCourse)) parts.push([`${g || ''}モデルコース(${k})`, v]); }; if (a) { if (a.groups) a.groups.forEach((g) => scan(g, g.id + '/')); else scan(a); } return parts.filter(([, t]) => typeof t === 'string' && t); };
for (const d of dl) for (const [, t] of allText(d)) for (const m of String(t).matchAll(addrRe)) { const k = m[2]; if (!muni.has(k)) muni.set(k, new Set()); muni.get(k).add(m[1]); }
const muniOK = new Map([...muni].filter(([k, v]) => v.size === 1 && k.length >= 3).map(([k, v]) => [k, [...v][0]]));
// 辞書: 旅先・見どころの名前（3字以上・1〜2か所）
const nameCount = new Map(); const nameLoc = new Map(); const add = (n, d) => { if (!n || n.length < 3) return; nameCount.set(n, (nameCount.get(n) || 0) + 1); if (!nameLoc.has(n)) nameLoc.set(n, d); };
for (const d of dl) { add(d.name, d); for (const sp of d.spots || []) add(sp.name, d); }
const GENERIC = /^(.*(駅|港|温泉|神社|公園|寺|城|湖|山|島|半島|海岸|渓谷|滝|橋|美術館|博物館|資料館|ホテル|旅館|食堂|レストラン|ダム|岬|灯台|公園|ターミナル|センター|カフェ)|[ぁ-ん]+)$/;
// 辞書に入れる名前: 全体で1〜2か所の名前で、かつ、全ページの本文のうち4ページ以下にしか出ない名前（「展望台」「露天風呂」のような一般名詞を除く）。都道府県名・hub・主要都市の名前は入れない
const pageTexts = dl.map((d) => allText(d).map(([, t]) => t).join('\n'));
const mentionPages = (n) => pageTexts.reduce((c, t) => c + (t.includes(n) ? 1 : 0), 0);
const names = [...nameCount].filter(([n, c]) => c <= 2 && !HUBS.some((h) => n.includes(h)) && !PREFS.includes(n) && mentionPages(n) <= 4).map(([n]) => n).sort((a, b) => b.length - a.length);


// ④ 地形名（「〜半島」「〜島」「〜湖」「〜山」「〜岳」「〜高原」「〜渓谷」「〜岬」「〜湾」「〜峠」「〜湿原」）: 全ページの本文から取り出し、最も多く出る旅先を「本拠」にする。本拠が3回以上で、全体で出るページが8ページ以下の名前について、本拠から100km以上離れたページに出たら疑い
const GEO = /([\u4E00-\u9FFFァ-ヴー]{2,5}?(?:半島|島|湖|山|岳|高原|渓谷|岬|湾|峠|湿原))/g;
const geoCount = new Map(); // token -> Map(pageIndex -> count)
dl.forEach((d, i) => { for (const m of pageTexts[i].matchAll(GEO)) { const k = m[1]; if (!geoCount.has(k)) geoCount.set(k, new Map()); const mp = geoCount.get(k); mp.set(i, (mp.get(i) || 0) + 1); } });
const geoHome = new Map(); for (const [k, mp] of geoCount) { if (mp.size > 8 || mp.size < 2) continue; const [hi, hc] = [...mp].sort((a, b) => b[1] - a[1])[0]; if (hc >= 3) geoHome.set(k, hi); }
const out = []; const rulesCount = { 隣接県を除外: 0, 交通の起点・経由の近くを除外: 0, hub・主要都市を除外: 0, 自身の名前を除外: 0 };
for (const d of dl) { const ownPref = d.prefecture; const ownPrefs = PREFS.filter((x) => String(d.prefecture || '').includes(x)); const adj = new Set([ownPref, ...ownPrefs, ...ownPrefs.flatMap((x) => ADJ[x] || [])]);
  /* 複数県にまたがるページは、すべての県と、その隣接県 */ const parts = allText(d); const own = new Set([d.name, ...(d.spots || []).map((s) => s.name)]); const ev = [];
  for (const [where, text] of parts) { const t = String(text);
    // ① 都道府県名
    for (const p of PREFS) { let i = t.indexOf(p); while (i >= 0) { const around = t.slice(Math.max(0, i - 8), i + p.length + 8); if (!adj.has(p)) { if (ACCESS.test(t.slice(i + p.length, i + p.length + 6)) || ACCESS.test(t.slice(Math.max(0, i - 6), i))) rulesCount.交通の起点・経由の近くを除外++; else ev.push({ 種類: '県名', 地名: p, 欄: where, 文脈: around }); } else rulesCount.隣接県を除外++; i = t.indexOf(p, i + p.length); } }
    // ② 市区町村名
    for (const [m, pref] of muniOK) { if (m.length < 3 || own.has(m)) continue; let i = t.indexOf(m); while (i >= 0) { if (/[\u4E00-\u9FFF々]/.test(t[i - 1] || '')) { i = t.indexOf(m, i + m.length); continue; } const around = t.slice(Math.max(0, i - 8), i + m.length + 8); if (!adj.has(pref) && !HUBS.some((h) => m.startsWith(h))) { if (ACCESS.test(t.slice(i + m.length, i + m.length + 6)) || ACCESS.test(t.slice(Math.max(0, i - 6), i))) rulesCount.交通の起点・経由の近くを除外++; else ev.push({ 種類: '市区町村名', 地名: m, 欄: where, 文脈: around, 県: pref }); } else if (HUBS.some((h) => m.startsWith(h))) rulesCount['hub・主要都市を除外']++; else rulesCount.隣接県を除外++; i = t.indexOf(m, i + m.length); } }
    // ③ 他の旅先・見どころの名前
    for (const n of names) { if (own.has(n) || t.indexOf(n) < 0) continue; const o = nameLoc.get(n); if (o.id === d.id) { rulesCount.自身の名前を除外++; continue; } if (!(o.lat && d.lat)) continue; const dist = km(d, o); if (dist < 150) continue; const i = t.indexOf(n); if (/[\u4E00-\u9FFF々ァ-ヴー]/.test(t[i - 1] || '')) continue; if (ACCESS.test(t.slice(i + n.length, i + n.length + 6)) || ACCESS.test(t.slice(Math.max(0, i - 6), i))) { rulesCount.交通の起点・経由の近くを除外++; continue; } ev.push({ 種類: '他の旅先・見どころの名前（遠い）', 地名: n, 欄: where, 文脈: t.slice(Math.max(0, i - 8), i + n.length + 8), 距離km: Math.round(dist), 該当ページ: o.id }); } 
    // ④ 地形名
    for (const [k, hi] of geoHome) { const h = dl[hi]; if (h.id === d.id || own.has(k) || !(h.lat && d.lat)) continue; const i = t.indexOf(k); if (i < 0) continue; if (/[\u4E00-\u9FFF々ァ-ヴー]/.test(t[i - 1] || '')) continue; const dist = km(d, h); if (dist < 100) continue; if (ACCESS.test(t.slice(i + k.length, i + k.length + 6)) || ACCESS.test(t.slice(Math.max(0, i - 6), i))) { rulesCount.交通の起点・経由の近くを除外++; continue; } ev.push({ 種類: '地形名（本拠のページから遠い）', 地名: k, 欄: where, 文脈: t.slice(Math.max(0, i - 8), i + k.length + 8), 距離km: Math.round(dist), 本拠ページ: h.id }); }
}
  const strong = ev.filter((e) => ['県名', '市区町村名'].includes(e.種類)).length; const weak = ev.length - strong;
  if (ev.length) out.push({ page: d.id, 名前: d.name, 県: ownPref, hub: d.hub, 強い: strong, 弱い: weak, 点: strong * 3 + weak, 疑い: ev.slice(0, 8) }); }
out.sort((a, b) => b.点 - a.点);
fs.writeFileSync(`${O}/scan_place_mismatch.json`, JSON.stringify({ 旅先ページ: dl.length, 疑いのあるページ: out.length, 強い疑いのページ: out.filter((x) => x.強い).length, 辞書: { 市区町村: muniOK.size, 他の旅先・見どころの名前: names.length }, 除外の規則の適用回数: rulesCount, 疑い: out }, null, 1));
fs.writeFileSync(`${O}/rules.md`, ['# 取り違えスキャンの除外の規則（2026-11-18）', '', '- (a) 隣接県の都道府県名・市区町村名は除外（そのページの県と、陸続き・近接の県）', '- (b) 交通の起点・経由の記述のそば（「〜から」「〜発」「〜着」「〜行き」「〜経由」「〜まで」「〜直通」「乗り継ぎ」「方面」「起点」「拠点」「空港」「新幹線」「特急」「フェリー」「バス」）は除外', '- (c) hub・主要都市（東京・大阪・名古屋・京都・札幌・福岡・仙台・広島・横浜・神戸）は、市区町村名・他の旅先の名前の対象から除外', '- (d) そのページ自身の名前・見どころの名前は除外', '- (e) 3字未満の名前・全体で3か所以上に出る名前・一般名詞のみの名前は辞書に入れない', '- (f) 「県」「市」などが付かない略称の県名・市名は、県名・市区町村名の突き合わせの対象外', '- 市区町村の辞書は、全ページの「住所：」から作り、同名が複数県にあるもの（伊達市など）は除外', '- 他の旅先の名前は、そのページの座標から150km以上離れた旅先・見どころの名前だけを疑いにする', '', `除外の規則の適用回数: ${JSON.stringify(rulesCount)}`].join('\n'));
fs.writeFileSync(`${O}/scan_top.json`, JSON.stringify(out.slice(0, 80), null, 1));
console.log(JSON.stringify({ 疑いのあるページ: out.length, 強い疑い: out.filter((x) => x.強い).length, 辞書: { 市区町村: muniOK.size, 名前: names.length }, rulesCount }, null, 1)); for (const x of out.slice(0, 12)) console.log(x.点, x.page, x.強い, x.弱い, x.疑い.slice(0, 2).map((e) => `${e.地名}@${e.欄}`).join(' | '));
