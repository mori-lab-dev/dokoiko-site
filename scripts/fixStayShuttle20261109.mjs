// 送迎の残りを公式の記載に合わせる（2026-11-09）。使い方: node scripts/fixStayShuttle20261109.mjs [--dry]
//  A. 公式で確認できた宿（発着地・条件を公式に合わせて直す）  B. 公式で確認できない宿の送迎の文を消す
//  変更前・変更後・理由は backup/stay_shuttle_20261109/before_after.json。変更前の destinations・記事は backup/stay_shuttle_20261109/before_*.json
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const B = path.join(root, 'backup/stay_shuttle_20261109'); fs.mkdirSync(B, { recursive: true });
const dests = JSON.parse(fs.readFileSync(path.join(root, 'src/data/destinations.json'), 'utf8'));
const recPath = path.join(root, 'scripts/data/stayShuttleChecked.json');
const recAll = JSON.parse(fs.readFileSync(recPath, 'utf8'));
const get = (id) => { const d = dests.find((x) => x.id === id); if (!d) throw new Error('id なし ' + id); return d; };
const artFile = (id) => path.join(root, 'src/data/articles', id + '.json');
const arts = {}; const art = (id) => { if (arts[id] === undefined) arts[id] = fs.existsSync(artFile(id)) ? JSON.parse(fs.readFileSync(artFile(id), 'utf8')) : null; return arts[id]; };
const changes = []; const touched = new Set();
const note = (id, where, before, after, why) => { changes.push({ id, where, before, after, why }); touched.add(id); };

// 文字列の置換（description・seo.description・spots・記事の本文/info/tips を対象。見つからなければエラー）
const edit = (id, from, to, why) => {
  const d = get(id); let n = 0;
  const rep = (s) => (typeof s === 'string' && s.includes(from) ? s.replace(from, () => to) : s);
  for (const k of ['description']) { const v = rep(d[k]); if (v !== d[k]) { note(id, k, d[k], v, why); d[k] = v; n++; } }
  if (d.seo?.description) { const v = rep(d.seo.description); if (v !== d.seo.description) { note(id, 'seo.description', d.seo.description, v, why); d.seo.description = v; n++; } }
  for (const s of d.spots ?? []) { const v = rep(s.description); if (v !== s.description) { note(id, `spot:${s.name}`, s.description, v, why); s.description = v; n++; } }
  const a = art(id);
  if (a) { for (const k of ['lead', 'tips']) { const v = rep(a[k]); if (v !== a[k]) { note(id, `article.${k}`, a[k], v, why); a[k] = v; n++; } }
    (a.sections ?? []).forEach((s, i) => { for (const k of ['body', 'info']) { const v = rep(s[k]); if (v !== s[k]) { note(id, `article.section${i}.${k}`, s[k], v, why); s[k] = v; n++; } } }); }
  if (!n) throw new Error(`置換元が無い: ${id}「${from.slice(0, 24)}」`);
};
const stay = (id, patch, why) => { const f = get(id).featured_stay; for (const [k, v] of Object.entries(patch)) { if (v === undefined) { if (f[k] !== undefined) note(id, `featured_stay.${k}`, f[k], null, why); delete f[k]; } else if (f[k] !== v) { note(id, `featured_stay.${k}`, f[k] ?? null, v, why); f[k] = v; } } };
const setRec = (name, rec) => { recAll.stays[name] = rec; };

// ── バックアップ（初回だけ）──
const IDS = new Set();
const A = []; const DEL = [];

// ── A. 公式で確認できた宿 ──
const verified = (id, name, patch, edits, rec, why) => { A.push(id); stay(id, patch, why); for (const [f, t] of edits) edit(id, f, t, why); setRec(name, rec); };
verified('gen_北海_北湯沢温泉', '緑の風リゾート きたゆざわ', { shuttleInfo: '札幌駅北口発着は電話または公式サイトで宿泊予約した人は無料、新千歳空港発着は同じ予約で片道1,000円。完全予約制で、満席になり次第受付終了' },
  [['札幌駅からは宿泊予約者向けの無料送迎バスもあり、新千歳空港からも送迎が出ている。', '札幌駅発着の送迎バスは、電話または公式サイトで宿泊予約した人は無料。新千歳空港発着は同じ予約で片道1,000円で、完全予約制だ。']],
  { status: 'verified', free_on_official: true, official_url: 'https://midorinokaze-resort.com/', access_page_url: 'https://midorinokaze-resort.com/access', note: '無料になるのは電話・公式サイトで宿泊予約した人。新千歳空港は同じ予約で片道1,000円' }, '無料の条件（予約経路）と空港便の料金を公式に合わせた');
verified('naruto-uzu', 'アオアヲ ナルト リゾート', { shuttleInfo: '高速鳴門バス停から無料送迎バスあり（3日前までに要予約・予約がない場合は運行なし）' },
  [['アオアヲ ナルト リゾートはJR鳴門駅と高速鳴門から無料送迎があり（3日前までに要予約）', 'アオアヲ ナルト リゾートは高速鳴門バス停から無料送迎があり（3日前までに要予約）']],
  { status: 'verified', free_on_official: true, official_url: 'https://www.aoawo-naruto.com/', access_page_url: 'https://www.aoawo-naruto.com/pages/123/', note: 'JR鳴門駅・徳島阿波おどり空港発着の送迎バスは2026年7月19日まで。以降の無料送迎は高速鳴門バス停のみ' }, 'JR鳴門駅発着の送迎は2026/7/19で終了。無料は高速鳴門バス停のみ');
verified('abashiri', '北天の丘 あばしり湖鶴雅リゾート', { shuttleInfo: '女満別空港・JR呼人駅・JR網走駅から無料送迎あり（前日20時までに電話で要予約）', accessStation: 'JR網走駅' },
  [['北天の丘あばしり湖鶴雅リゾートはJR網走駅から車約15分、無料送迎もある。', '北天の丘あばしり湖鶴雅リゾートは、女満別空港・JR呼人駅・JR網走駅から無料送迎がある。']],
  { status: 'verified', free_on_official: true, official_url: 'https://www.hokutennooka.com/', access_page_url: 'https://www.hokutennooka.com/access/', note: '公式に「女満別空港・JR呼人駅・JR網走駅からの送迎」。所要時間（約15分）の記載はなく消した' }, 'JR網走駅発は公式で確認。公式に無い「車約15分」を消し、発着地に空港と呼人駅を加えた');
verified('saroma-ko', 'サロマ湖鶴雅リゾート', { shuttleInfo: '女満別空港・網走駅より無料送迎バスあり（完全予約制・3日前までに予約・予約がない場合は運行なし）', accessStation: 'JR網走駅（送迎バス利用）' },
  [['鶴雅リゾートには北見市内と女満別空港から無料の送迎バスが出る。', '鶴雅リゾートには網走駅と女満別空港から無料の送迎バスが出る。']],
  { status: 'verified', free_on_official: true, official_url: 'https://www.s-tsuruga.com/', access_page_url: 'https://www.s-tsuruga.com/access/', note: '発着地は女満別空港と網走駅。北見市内の記載なし' }, '北見市内発は公式に無いので消し、公式の網走駅に直した');
verified('shirahama', '紀州・白浜温泉 むさし', { shuttleInfo: '白浜温泉旅館協同組合が運行する無料シャトルバスを利用できる（宿泊客）' },
  [['白浜駅からは旅館組合の無料シャトルで向かえる。', '旅館組合が運行する無料シャトルを利用できる。']],
  { status: 'verified', free_on_official: true, official_url: 'https://www.yado-musashi.co.jp/', access_page_url: 'https://www.yado-musashi.co.jp/access/', note: '公式は「白浜温泉旅館協同組合が運行する無料シャトルバス」。白浜駅発・予約不要の記載なし（予約不要は駐車場の項）' }, '「白浜駅から」「迎えは予約不要」は公式に無いので消した');
verified('niigata-bandai', '岩室温泉 高志の宿 高島屋', { shuttleInfo: 'JR岩室駅・弥彦駅から無料送迎あり（3日前までに要予約・2名から）' },
  [['JR弥彦駅からの無料送迎があり、3日前までの予約が必要だ。', 'JR岩室駅・弥彦駅からの無料送迎があり、3日前までの予約が必要で、2名から利用できる。']],
  { status: 'verified', free_on_official: true, official_url: 'https://takasimaya.co.jp/', access_page_url: 'https://takasimaya.co.jp/access/', note: '「11月は弥彦への送迎不可」の注記は公式のアクセス・お知らせ(note)に見つからず' }, '公式の「2名様から」を加えた。「11月は弥彦への送迎不可」の注記は公式で確認できず反映していない');
verified('dorogawa-onsen', '花屋徳兵衛', { shuttleInfo: '洞川温泉バス停から迎えあり（連絡すれば迎えに来てもらえる）' }, [],
  { status: 'verified', free_on_official: false, official_url: 'https://www.tokubei.jp/', access_page_url: 'https://www.tokubei.jp/access.html', note: '公式「洞川温泉バス停から徒歩約8分（連絡を頂ければ迎えにまいります）」。無料か有料かの記載なし' }, '公式の文言に合わせた（連絡すれば迎え）');
verified('gen_北海_ウトロ温泉', 'KIKI知床 ナチュラルリゾート', {},
  [['KIKI知床 ナチュラルリゾートはターミナルから送迎がある。', 'KIKI知床 ナチュラルリゾートはターミナルに着いて電話をすれば迎えに来てもらえる。']],
  { status: 'verified', free_on_official: false, official_url: 'https://www.kikishiretoko.co.jp/', access_page_url: 'https://www.kikishiretoko.co.jp/faq/', note: '公式「バスターミナルご到着後お電話をいただければお迎えに参ります」。斜里駅からの送迎は通常なし。無料か有料かの記載なし' }, '公式の文言（到着後に電話で迎え）に合わせた');
verified('gen_青森_青荷温泉', 'ランプの宿 青荷温泉', {}, [],
  { status: 'verified', free_on_official: false, official_url: 'https://aoninet.com/', access_page_url: 'https://aoninet.com/access/', note: '夏期(4/1〜11/30)は道の駅虹の湖⇔青荷温泉、冬期(12/1〜3/31)は黒石駅⇔虹の湖⇔青荷温泉。事前予約が必要。無料か有料かの記載なし' }, '公式と一致（変更なし）');
verified('ubayu-onsen', '桝形屋', { shuttleInfo: '峠駅から送迎車あり（宿泊者のみ・要予約・電車利用者のみ・約25分）' },
  [['峠駅から宿泊者向け送迎車で約30分。', '峠駅から宿泊者向け送迎車で約25分。']],
  { status: 'verified', free_on_official: false, official_url: 'https://www.ubayuonsen.com/', access_page_url: 'https://www.ubayuonsen.com/access/access.html', note: '公式「峠駅より約25分で駐車場まで到着・そこから約200m徒歩」「送迎は宿泊者のみ(要予約)、電車利用者のみ」。無料か有料かの記載なし' }, '所要時間を公式の約25分に直し、電車利用者のみの条件を加えた');

// ── B. 公式で確認できない宿の送迎の文を消す ──
const del = (id, status, edits, extra) => {
  DEL.push(id); const d = get(id); const f = d.featured_stay;
  if (f && (f.shuttleInfo !== undefined || f.hasShuttle)) { note(id, 'featured_stay.shuttleInfo', f.shuttleInfo ?? null, null, `公式で確認できない（${status}）`); delete f.shuttleInfo; f.hasShuttle = false; }
  if (extra) stay(id, extra, `公式で確認できない（${status}）`);
  for (const [fr, to] of edits ?? []) edit(id, fr, to, `公式で確認できない（${status}）`);
};
const NF = 'official_not_found', NS = 'no_shuttle_info_on_official', NC = 'not_checked → 公式で送迎の記載を確認できず';
del('matsushima', NF, [['小松館 好風亭は露天から島々が見える宿で、松島海岸駅から送迎が出る。', '小松館 好風亭は露天から島々が見える宿だ。']]);
del('shodoshima', NF, [['宿「島宿真里」は池田港から送迎があり、醤油会席で島の発酵文化を伝える7室の宿だ。', '宿「島宿真里」は、醤油会席で島の発酵文化を伝える7室の宿だ。']]);
del('mihonoseki', NF, [['青石畳通りに面して建ち、境港まで送迎もある（1組1,000円・要予約）。', '青石畳通りに面して建つ。']]);
del('hakone', NC, [['到着後に連絡すれば駅まで迎えにきてもらえる。', '']]);
del('takachiho', NS, [['旅館 神仙は高千穂バスセンターから送迎があり、事前の連絡が必要だ。', '']]);
del('ashizuri', NS);
del('inuyama', NS, [['全10室の宿で、名鉄犬山駅から送迎あり。', '全10室の宿だ。']]);
del('oku-izumo', NS);
del('ginzan-onsen', NF, [['大石田駅からは送迎もある（3日前までに要予約）。', '']]);
del('misasa-onsen', NF, [['天然岩風呂があり、倉吉駅から送迎のマイクロバスが出る。', '天然岩風呂がある。']]);
del('tosa-shimizu', NS);
del('yonezawa', NF, [['茅葺の建物と湯滝風呂が迎え、米沢駅から送迎バスもある（要予約）。', '茅葺の建物と湯滝風呂が迎える。']]);
del('ito', NF, [['源泉かけ流しの湯を持ち、伊東駅から宿泊者向けの送迎もある。', '源泉かけ流しの湯を持つ。']]);
del('totsukawa', NS);
del('shimanto', NF);
del('takeo-onsen', NF, [['駅から徒歩約8分、送迎にも対応している。', '駅から徒歩約8分だ。']]);
del('kinugawa-onsen', NF, [['鬼怒川温泉駅からダイヤルバス約8分、宇都宮駅からは送迎バスも出ている。', '鬼怒川温泉駅からダイヤルバス約8分。']]);
del('hachijojima', NF);
del('hachimantai-onsen', NF, [['アスピーテライン入口バス停からは完全予約制の送迎もある。', '']]);
del('towada-lake', NF, [['国登録有形文化財で、十和田湖（休屋）バス停から送迎がある。', '国登録有形文化財だ。']]);
del('kurobe', NF, [['宇奈月温泉駅から送迎もある。', '']]);
del('gen_北海_長万部温泉', NF);
del('gen_栃木_湯西川温泉', '記録なし', [['野岩鉄道の湯西川温泉駅から宿の送迎バスを利用する宿が多い。', '野岩鉄道の湯西川温泉駅が最寄りになる。'], ['野岩鉄道「湯西川温泉駅」から宿の送迎バスを使う宿が多い。', '']]);
del('hijori-onsen', NF, [['湯宿 元河原湯は新庄駅からの送迎もある（2名以上・要予約）。', '']]);
del('takayu-onsen', NF, [['送迎は福島駅西口から利用でき、2日前までの予約が必要。', '']]);
del('futamata-onsen', NF, [['新白河駅東口から送迎の「湯ったりヤーコン号」が1日1便出る。', '']]);
del('tsumari', NF);
del('nishinoshima', NF, [['送迎は要予約。', '']]);
del('himakajima', NF, [['東港から徒歩5分、西港からは送迎にも対応する。', '東港から徒歩5分だ。']]);
del('ohara', NF, [['京都バス「大原」バス停が玄関口となり、宿の芹生はバスターミナルから送迎もある。', '京都バス「大原」バス停が玄関口となる。']]);
del('yubara-onsen', NF, [['バスで約49分、バス停から送迎もある。', 'バスで約49分。']]);
del('matsumoto-castle-2', NF, [['松本城まで徒歩5分、JR松本駅からの定時送迎もある。', '松本城まで徒歩5分。']]);
del('kumano-kodo', NS, [['栗栖川・滝尻バス停までの送迎も事前申込で利用できる。', '']]);
del('mihama-fukui', NF, [['茅葺の一軒宿で、気山駅から送迎あり。', '茅葺の一軒宿だ。']]);
del('kurobe-gorge', NF, [['老舗旅館・延楽があり、宇奈月温泉駅から送迎も利用できます。', '老舗旅館・延楽がある。']]);
del('niigata-spa', NF, [['白玉の湯 泉慶など主要旅館へは有料シャトルも出ている。', '白玉の湯 泉慶など主要旅館がある。']], { accessStation: '豊栄駅から車約20分' });
del('niche_奈良_2', NF, [['宿泊の場合、南海高野線・高野山駅から宿泊者向けの送迎車が出ている（要予約）。', '']], { accessStation: '高野山駅' });
del('utto', NF, [['秋田内陸線の阿仁マタギ駅から送迎で3分。', '']]);
del('tazawako', '妙乃湯: 公式は「駅からの無料送迎バスは運行していません」', [['、送迎バスあり（要予約）', '']]);
del('shimokitazawa-nyuto', '妙乃湯: 公式は「駅からの無料送迎バスは運行していません」', [['宿の送迎バス（要予約）を使うのが一番確実だ。', '']]);
// 記録の更新: 公式で確認できなかった宿の status は据え置き。富士屋ホテルは公式を読んで記載が無かったので no_shuttle_info_on_official にする
setRec('富士屋ホテル', { status: 'no_shuttle_info_on_official', free_on_official: false, official_url: 'https://www.fujiyahotel.jp/', access_page_url: 'https://www.fujiyahotel.jp/access/', note: '公式のアクセス・おすすめページに宮ノ下駅の迎えの記載なし（撮影ツアー用の送迎のみ）' });

console.log(`公式で確認して直した宿 ${A.length}軒 / 送迎を消した旅先 ${DEL.length}件 / 変更箇所 ${changes.length}`);
if (DRY) process.exit(0);
// バックアップ（初回だけ）
if (!fs.existsSync(path.join(B, 'before_destinations.json'))) {
  const orig = JSON.parse(execOrig());
  fs.writeFileSync(path.join(B, 'before_destinations.json'), JSON.stringify(Object.fromEntries([...touched].map((id) => [id, orig.find((x) => x.id === id)])), null, 1));
  const ao = {}; for (const id of touched) if (fs.existsSync(artFile(id))) ao[id] = JSON.parse(execArt(id)); fs.writeFileSync(path.join(B, 'before_articles.json'), JSON.stringify(ao, null, 1));
  fs.writeFileSync(path.join(B, 'stayShuttleChecked.before.json'), execRec());
}
fs.writeFileSync(path.join(B, 'before_after.json'), JSON.stringify({ verified: A, deleted: DEL, changes }, null, 1) + '\n');
fs.writeFileSync(path.join(root, 'src/data/destinations.json'), JSON.stringify(dests, null, 2) + '\n');
for (const [id, a] of Object.entries(arts)) if (a && touched.has(id)) fs.writeFileSync(artFile(id), JSON.stringify(a, null, 2) + '\n');
recAll.date = '2026-11-09';
fs.writeFileSync(recPath, JSON.stringify(recAll, null, 2) + '\n');
console.log('書き込み完了');
import { execFileSync } from 'child_process';
function execOrig() { return execFileSync('git', ['show', 'HEAD:src/data/destinations.json'], { cwd: root, maxBuffer: 1 << 28 }).toString(); }
function execArt(id) { return execFileSync('git', ['show', `HEAD:src/data/articles/${id}.json`], { cwd: root }).toString(); }
function execRec() { return execFileSync('git', ['show', 'HEAD:scripts/data/stayShuttleChecked.json'], { cwd: root }).toString(); }
