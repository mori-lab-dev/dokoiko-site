// 取り違え・混入の検出の改善（2026-11-19・読み取りのみ。変更しない・公式の確認なし）。データの中で機械的に突き合わせる:
//   ① 同じ文が別の旅先ページにも出ていないか（文の重複・近い文）
//   ② 住所（県・市区町村）と、そのページの県・座標・city との突き合わせ（座標→市区町村は、全ページの「住所」と座標から作った市区町村の座標表で近似。公的データ（国土数値情報 N03 など）は、この環境に無い）
//   ③ 画像のファイル名・クレジットの題が、そのページの旅先・見どころと合っているか
//   ④ 旅先の id・name と、本文・見どころの施設名の食い違い
// 出力: logs/identity_20261119/scan_v2.json（件数・上位30・既知6ページの検出）
import fs from 'fs';
const O = 'logs/identity_20261119'; const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dl = J('src/data/destinations.json'); const byId = new Map(dl.map((d) => [d.id, d]));
const arts = new Map(); for (const d of dl) { const f = `src/data/articles/${d.id}.json`; if (fs.existsSync(f)) arts.set(d.id, J(f)); }
const KNOWN = ['gen_北海_神威脇温泉', 'tanba-sasayama', 'gen_茨城_西山荘', 'kitakata', 'gen_青森_下風呂温泉', 'hirakawa'];
const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const ADJ = JSON.parse(fs.readFileSync('logs/identity_20261118/adj.json', 'utf8'));
const km = (a, b) => { const R = 6371, t = (x) => (x * Math.PI) / 180; const dLat = t(b.lat - a.lat), dLng = t(b.lng - a.lng); const s = Math.sin(dLat / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
const texts = (d) => { const a = arts.get(d.id); const out = [['description', d.description]]; for (const sp of d.spots || []) out.push([`見どころ「${sp.name}」`, sp.description]); const scan = (h, g) => { out.push([`${g}lead`, h.lead]); (h.sections || []).forEach((s, i) => { out.push([`${g}節${i + 1} body`, s.body]); out.push([`${g}節${i + 1} info`, s.info]); out.push([`${g}節${i + 1} title`, s.title]); }); out.push([`${g}tips`, typeof h.tips === 'string' ? h.tips : '']); if (h.modelCourse) for (const [k, v] of Object.entries(h.modelCourse)) out.push([`${g}モデルコース(${k})`, v]); }; if (a) { if (a.groups) a.groups.forEach((g) => scan(g, g.id + '/')); else scan(a, ''); } return out.filter(([, t]) => typeof t === 'string' && t); };
const res = { c1_文の重複: [], c2_住所と座標: [], c3_画像: [], c4_idと名前: [] };
// ① 文の重複
const sentMap = new Map(); const pageSents = new Map();
for (const d of dl) { const set = new Set(); for (const [w, t] of texts(d)) { if (/ info$/.test(w) || /title$/.test(w)) continue; for (const s0 of (String(t).match(/[^。\n]+。?/g) || [])) { const s = s0.trim(); if (s.length < 22) continue; const k = s.normalize('NFKC').replace(/\s+/g, '').slice(0, 16); if (k.length < 14) continue; set.add(k); if (!sentMap.has(k)) sentMap.set(k, new Set()); sentMap.get(k).add(d.id); } } pageSents.set(d.id, set); }
const pair = new Map(); for (const [k, ids] of sentMap) { if (ids.size < 2 || ids.size > 4) continue; const a = [...ids]; for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) { const key = [a[i], a[j]].sort().join('|'); pair.set(key, (pair.get(key) || 0) + 1); } }
for (const [key, n] of pair) { const [a, b] = key.split('|'); const ra = n / Math.max(1, pageSents.get(a).size), rb = n / Math.max(1, pageSents.get(b).size); const r = Math.max(ra, rb); if (n >= 2 || r >= 0.2) for (const [x, y, rr] of [[a, b, ra], [b, a, rb]]) if (rr >= 0.15 || n >= 3) res.c1_文の重複.push({ page: x, 相手: y, 共有する文: n, 割合: +rr.toFixed(2), 点: n + rr * 10 }); }
// ② 住所
const muniAt = new Map(); const addrRe = new RegExp(`(${PREFS.join('|')})([^\\s、。（）()\\d]{1,9}?[市区町村])`);
const addrs = new Map(); for (const d of dl) { const list = []; for (const [w, t] of texts(d)) for (const line of String(t).split('\n')) { const m = line.match(/住所：\s*(.*)/); if (m) { const mm = m[1].match(addrRe); if (mm) list.push({ pref: mm[1], muni: mm[2], where: w, line: m[1].slice(0, 40) }); } } addrs.set(d.id, list); for (const a of list) { const k = a.pref + a.muni; if (!muniAt.has(k)) muniAt.set(k, []); if (d.lat) muniAt.get(k).push({ id: d.id, lat: d.lat, lng: d.lng }); } }
for (const d of dl) { const ownPrefs = PREFS.filter((x) => String(d.prefecture || '').includes(x)); const adj = new Set([...ownPrefs, ...ownPrefs.flatMap((x) => ADJ[x] || [])]); let score = 0; const ev = [];
  for (const a of addrs.get(d.id)) { if (ownPrefs.length && !adj.has(a.pref)) { score += 5; ev.push({ 種類: '住所の県が違う', ...a }); }
    const others = (muniAt.get(a.pref + a.muni) || []).filter((x) => x.id !== d.id); if (others.length && d.lat) { const dist = Math.min(...others.map((o) => km(d, o))); if (dist > 60) { score += 2 + Math.min(dist / 100, 3); ev.push({ 種類: '住所の市区町村の座標から遠い', ...a, 距離km: Math.round(dist) }); } } }
  if (d.city && addrs.get(d.id).length && !addrs.get(d.id).some((a) => String(a.muni).includes(String(d.city).replace(/[市区町村]$/, '')) || String(d.city).includes(a.muni.replace(/[市区町村]$/, '')))) { score += 1; ev.push({ 種類: 'city と住所の市区町村が一致しない', city: d.city, 住所: addrs.get(d.id).slice(0, 2).map((a) => a.pref + a.muni) }); }
  if (ev.length) res.c2_住所と座標.push({ page: d.id, 点: score, 疑い: ev.slice(0, 4) }); }
// ③ 画像
const fileOf = (u) => { try { const m = String(u).match(/(?:\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/|\/commons\/[0-9a-f]\/[0-9a-f]{2}\/|File:)([^/?#]+)/); return m ? decodeURIComponent(m[1]).replace(/^\d+px-/, '') : ''; } catch { return ''; } };
const urlUse = new Map(); for (const d of dl) for (const sp of d.spots || []) { const f = fileOf(sp.imageUrl || sp.imageCredit?.url); if (f) { if (!urlUse.has(f)) urlUse.set(f, new Set()); urlUse.get(f).add(d.id); } }
const KEYS = [['ramen', /ラーメン|拉麺|らーめん/], ['noodle', /麺|ラーメン|そば|うどん/], ['castle', /城/], ['temple', /寺|院|堂/], ['shrine', /神社|宮|社/], ['museum', /美術館|博物館|資料館|ミュージアム/], ['bridge', /橋/], ['lighthouse', /灯台/], ['onsen', /温泉|湯/], ['beach', /海岸|浜|ビーチ/], ['lake', /湖|池|沼/], ['waterfall', /滝/], ['mountain', /山|岳|峰/]];
const otherIds = dl.filter((d) => /^[a-z]{5,}$/.test(d.id)).map((d) => d.id);
for (const d of dl) { const ev = []; let score = 0; for (const sp of d.spots || []) { const f = fileOf(sp.imageUrl || sp.imageCredit?.url); if (!f) continue; const low = f.toLowerCase(); const users = urlUse.get(f); if (users && users.size > 1 && [...users].some((u) => u !== d.id && byId.get(u)?.lat && d.lat && km(d, byId.get(u)) > 120)) { score += 4; ev.push({ 種類: '同じ画像ファイルが別の旅先でも使われている', 見どころ: sp.name, ファイル: f.slice(0, 50), 旅先: [...users].slice(0, 3) }); }
    for (const id of otherIds) if (id !== d.id && low.includes(id) && !String(d.id).includes(id) && !String(sp.name + d.name).toLowerCase().includes(id)) { score += 3; ev.push({ 種類: 'ファイル名に別の旅先のidを含む', 見どころ: sp.name, ファイル: f.slice(0, 50), id }); break; }
    for (const [k, re] of KEYS.slice(0, 1)) if (low.includes(k) && !re.test(sp.name + sp.description)) { score += 4; ev.push({ 種類: 'ファイル名の語と見どころが合わない', 見どころ: sp.name, ファイル: f.slice(0, 50), 語: k }); } }
  if (ev.length) res.c3_画像.push({ page: d.id, 点: score, 疑い: ev.slice(0, 4) }); }
// ④ id・name と本文
for (const d of dl) { const ev = []; let score = 0; const m = String(d.id).match(/^gen_[^_]+_(.+)$/); if (m && !String(d.name).replace(/[「」\s]/g, '').includes(m[1].replace(/[「」\s]/g, '')) && !m[1].includes(String(d.name).replace(/[「」\s]/g, ''))) { score += 3; ev.push({ 種類: 'id の名前と name が違う', id: d.id, name: d.name }); }
  const all = texts(d).map(([, t]) => t).join('\n'); const nm = String(d.name).replace(/[「」『』\s]/g, ''); if (nm.length >= 2 && !all.includes(nm) && !all.includes(nm.replace(/(温泉|岬|島|山|湖)$/, ''))) { score += 2; ev.push({ 種類: '本文に旅先の名前が出ない', name: d.name }); }
  if (ev.length) res.c4_idと名前.push({ page: d.id, 点: score, 疑い: ev }); }
const top = (arr, n = 30) => [...arr].sort((a, b) => b.点 - a.点).slice(0, n);
const uniq = (arr) => { const m = new Map(); for (const x of arr) { if (!m.has(x.page) || m.get(x.page).点 < x.点) m.set(x.page, x); } return [...m.values()]; };
const out = { 件数: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { 疑いのページ: new Set(v.map((x) => x.page)).size, 疑いの件数: v.length }])), 上位30: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, top(uniq(v))])), 既知の6ページの検出: Object.fromEntries(KNOWN.map((id) => [id, Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.filter((x) => x.page === id).length]))])) };
fs.writeFileSync(`${O}/scan_v2.json`, JSON.stringify({ ...out, 全件: res }, null, 1)); console.log(JSON.stringify({ 件数: out.件数, 既知の6ページの検出: out.既知の6ページの検出 }, null, 1));
for (const k of Object.keys(res)) { console.log('--', k); for (const x of out.上位30[k].slice(0, 6)) console.log(x.点.toFixed?.(1) ?? x.点, x.page, x.相手 || '', JSON.stringify(x.疑い?.[0] ?? '').slice(0, 110)); }
