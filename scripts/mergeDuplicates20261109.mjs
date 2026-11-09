// 同名ページの統合（太宰府・富良野・大原・恐山）・嵐山の書き分け・支笏湖いとう温泉の営業表示（2026-11-09）。
// 使い方: node scripts/mergeDuplicates20261109.mjs [--dry]
// 戻し方: backup/dupmerge_20261109/ に、消した旧ページ4件・直したページの変更前（data と記事）がある。
// 公式で確認できたものだけを移す。確認できないものは移さず moved.json に理由つきで残す。
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const B = path.join(root, 'backup/dupmerge_20261109');
fs.mkdirSync(path.join(B, 'articles'), { recursive: true });
const J = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const W = (p, o) => fs.writeFileSync(path.join(root, p), JSON.stringify(o, null, 2) + '\n');
const dests = J('src/data/destinations.json');
const get = (id) => { const d = dests.find((x) => x.id === id); if (!d) throw new Error('id なし ' + id); return d; };
const artPath = (id) => `src/data/articles/${id}.json`;
const hasArt = (id) => fs.existsSync(path.join(root, artPath(id)));
const sub = (s, from, to, label) => { if (!s.includes(from)) throw new Error(`置換元が無い: ${label}「${from.slice(0, 20)}」`); return s.replace(from, to); };

// ── バックアップ（初回だけ。再実行で上書きしない）──
const REMOVE = [['dazaifu-2', 'dazaifu'], ['hokkaido-furano-2', 'furano'], ['ohara-2', 'ohara'], ['osorezan-area', 'osorezan']];
const TOUCH = ['dazaifu', 'furano', 'ohara', 'osorezan', 'arashiyama', 'arashiyama-2', 'gen_北海_支笏湖いとう温泉', ...REMOVE.map((r) => r[0])];
if (!fs.existsSync(path.join(B, 'before_all.json'))) {
  fs.writeFileSync(path.join(B, 'before_all.json'), JSON.stringify(Object.fromEntries(TOUCH.map((id) => [id, get(id)])), null, 2) + '\n');
  for (const id of TOUCH) if (hasArt(id)) fs.copyFileSync(path.join(root, artPath(id)), path.join(B, 'articles', id + '.json'));
  fs.copyFileSync(path.join(root, 'src/data/stayKeywordFallback.json'), path.join(B, 'stayKeywordFallback.json'));
  fs.copyFileSync(path.join(root, 'scripts/data/descTimeTrimmed.json'), path.join(B, 'descTimeTrimmed.json'));
}
const moved = [];
const log = (kind, to, what, src, why) => moved.push({ kind, to, what, source: src ?? null, why: why ?? null });

// ── STEP 1: 公式で確認できたものだけ、残す側へ移す ──
// 恐山（reijyo-osorezan.jp/sanpai/）: 入山料は大人900円（旧ページの500円は書かない）。境内の温泉の湯の名前。
{ const d = get('osorezan');
  d.description = sub(d.description, '境内に泊まれる宿坊・吉祥閣では', '入山料は大人900円。境内には薬師の湯・冷えの湯・古滝の湯などの温泉がある。境内に泊まれる宿坊・吉祥閣では', 'osorezan');
  log('moved', 'osorezan', '入山料は大人900円／境内の温泉（薬師の湯・冷えの湯・古滝の湯）', 'https://reijyo-osorezan.jp/sanpai/'); }
log('not_moved', 'osorezan', '入山料500円', null, '公式は大人900円。500円は書かない（旧ページの値は誤り）');
log('not_moved', 'osorezan', '入山料だけで温泉に入れる／追加料金なし', null, '公式の参拝のご案内に「入山料だけで入浴できる」の記載がない');
log('not_moved', 'osorezan', '日本三大霊場のひとつ', null, '公式サイトの4ページに記載なし');
log('not_moved', 'osorezan', '下北駅からのバスは1日3〜4本', null, '公式のアクセスに本数の記載なし（公式は下北駅からバスで約45分、とのみ）');
log('not_moved', 'osorezan', '旧ページの所要時間（東京から225分など）', null, '公式で確認できないため');
// 富良野（princehotels.co.jp/shinfurano/facility/ningle_terrace/）: ニングルテラス
{ const d = get('furano');
  if (!d.spots.some((s) => s.name === 'ニングルテラス')) d.spots.push({ name: 'ニングルテラス', description: '森の中に15棟のログハウスが連なるショッピングエリア。自然をモチーフにしたクラフト作品が並ぶ。' });
  log('moved', 'furano', 'ニングルテラス（見どころ）。森の中に15棟のログハウス・クラフト作品', 'https://www.princehotels.co.jp/shinfurano/facility/ningle_terrace/'); }
log('not_moved', 'furano', 'ファーム富田「15ヘクタールの丘陵」', null, '公式に園全体の面積の記載なし（歴史ページの 1.2ha はラベンダー畑の拡大の記録で別の数字）');
log('not_moved', 'furano', '「北の国から」の見どころ', null, '公式で確認できない。旧ページの文はファーム富田の説明の重複');
log('not_moved', 'furano', '大雪山系に囲まれた盆地／札幌から約2時間25分／東京から約4時間50分', null, '公式で確認できない（所要時間は消した）');
log('not_moved', 'furano', 'ニングルテラス旧文の「白樺林」「クラフト作家のアトリエ」', null, '公式の表現は「15棟のログハウス」「クラフト作品」。公式にある語だけで書き直した');
// 太宰府（dazaifutenmangu.or.jp/sozoroaruki/nature）: 大樟。旧ページの「樹齢千年超の御神木」は公式の値に直す
{ const d = get('dazaifu'); const s = d.spots.find((x) => x.name === '太宰府天満宮');
  if (!s.description.includes('大樟')) s.description += '境内の大樟は樹齢1,500年を越え、国指定天然記念物に指定されている。';
  log('moved', 'dazaifu', '境内の大樟は樹齢1,500年を越え、国指定天然記念物（旧ページの「樹齢千年超の御神木が本殿前」は公式の値に直した）', 'https://www.dazaifutenmangu.or.jp/sozoroaruki/nature'); }
log('not_moved', 'dazaifu', '二日市温泉 大丸別荘（featured_stay）', null, '住所は筑紫野市。二日市温泉のページが無いため移さず、featured_stay から外した（残す側に自前の宿 HOTEL CULTIA 太宰府がある）');
log('not_moved', 'dazaifu', '「樹齢千年超の御神木が本殿前に立つ」「福岡を拠点に電車で約50分」「JR二日市駅からタクシー5分」', null, '公式で確認できない（公式の御神木は飛梅。樹齢の記載は大樟の1,500年）');
log('not_moved', 'dazaifu', '九州国立博物館・光明禅寺の旧ページ側の説明', null, '公式サイトを取得できず（九州国立博物館は接続拒否、光明禅寺は公式を特定できず）。残す側に既にある説明のまま');
// 大原: 移すものなし
log('not_moved', 'ohara', '宝泉院「樹齢700年の五葉松が客間の借景」', null, '宝泉院の公式サイトを取得できず（TLS エラー）。確認できないため移さない');
log('not_moved', 'ohara', '寂光院「平清盛の娘が晩年を過ごした」「額縁庭園越しに紅葉（三千院）」', null, '寂光院の公式は「建礼門院が入寺した」までで「晩年を過ごした」の記載なし。額縁庭園は宝泉院の庭で、三千院の公式庭園名は聚碧園・有清園。旧文は取り違えがある');
log('not_moved', 'ohara', '大阪から約1時間35分・東京から260分ほか旧ページの所要時間', null, '公式で確認できない');

// ── 旧ページ4件をデータから消す（記事も外す。画像・クレジットのファイルは残す）──
const rm = new Set(REMOVE.map((r) => r[0]));
const nextDests = dests.filter((d) => !rm.has(d.id));
for (const id of rm) if (hasArt(id) && !DRY) fs.unlinkSync(path.join(root, artPath(id)));

// ── STEP 2: 嵐山（A=嵐山駅周辺 / B=嵯峨・保津川側）──
{ const A = get('arashiyama'), Bd = get('arashiyama-2');
  const aOld = A.description, bOld = Bd.description;
  A.description = '京都市西部の嵐山のうち、渡月橋・天龍寺・竹林の道がある嵐山駅周辺を紹介する。見どころの中心は竹林の道で、高く連なる竹の隙間を朝の光が走り抜ける。天龍寺には約700年前に夢窓国師が作庭した曹源池庭園があり、池に面した縁側に腰を下ろすと正面に嵐山の稜線を望める。渡月橋は渡るより、欄干に立ち止まって大堰川の水面と山の重なりを眺めたい。嵯峨野トロッコ列車や保津川下りは、嵯峨・保津川側のページで紹介している。秋の紅葉期は人出が増えるため、電車でのアクセスが現実的だ。渡月橋の上、川面に映る秋の山。';
  A.spots.find((s) => s.name === '天龍寺').description = '約700年前に夢窓国師が作庭した曹源池庭園を持つ寺で、池の前の縁側に腰を下ろすと正面に嵐山を望む景色を楽しめる。';
  A.seo = { title: '【嵐山駅周辺】渡月橋・天龍寺・竹林の道｜京都府', description: '京都市西部の嵐山のうち、渡月橋・天龍寺・竹林の道がある駅周辺を紹介します。天龍寺の曹源池庭園は、約700年前に夢窓国師が作庭した庭です。' };
  A.sibling = { id: 'arashiyama-2', label: '嵯峨野トロッコ列車・保津川下りの嵐山（嵯峨・保津川側）' };
  delete A.travelTime; delete A.travelTimeEstimated;
  Bd.description = '京都西部の嵐山のうち、嵯峨野トロッコ列車と保津川下りがある嵯峨・保津川側を紹介する。トロッコ列車はJR山陰線の複線化で使われなくなった線路を観光に利用したもので、片道約7km、およそ25分。窓ガラスのないオープン車両「リッチ号」から保津峡の景色が移り変わる。保津川下りは船頭が操る舟で峡谷を下るもので、紅葉の季節は川面に映る色が渓谷美を二重に見せる。翠嵐 ラグジュアリーコレクションホテル京都は保津川のほとりに立ち、旧邸宅の面影を残すホテルだ。竹林の道・渡月橋・天龍寺は、嵐山駅周辺のページで紹介している。夏と秋がベストシーズンだ。竹が揺れる、その一瞬。';
  Bd.spots = Bd.spots.filter((s) => s.name !== '竹林の道');
  { const t = Bd.spots.find((s) => s.name === '嵯峨野トロッコ列車'); t.description = '片道約7km、およそ25分。窓ガラスのないオープン車両「リッチ号」から、保津峡の景色が次々に移り変わる。JR山陰線の複線化で使われなくなった線路を観光に利用している。'; }
  Bd.mainSpot = '嵯峨野トロッコ列車';
  Bd.seo = { title: '【嵐山・嵯峨】嵯峨野トロッコ列車・保津川下り｜京都府', description: '京都西部の嵐山のうち、嵯峨野トロッコ列車と保津川下りがある嵯峨・保津川側を紹介します。竹林の道・渡月橋・天龍寺は駅周辺のページです。' };
  Bd.sibling = { id: 'arashiyama', label: '渡月橋・天龍寺・竹林の道の嵐山（嵐山駅周辺）' };
  if (Bd.featured_stay) Bd.featured_stay.accessStation = '嵐電嵐山駅';
  delete Bd.travelTime; delete Bd.travelTimeEstimated;
  log('arashiyama', 'arashiyama', '説明・見どころ・title を「嵐山駅周辺」に書き分け。「室町時代につくられた」を公式の「約700年前に夢窓国師が作庭」に直した。時間の文（東京から約2時間15分・京都駅から約11分）と travelTime を削除', 'https://www.tenryuji.com/precincts/', '東海道新幹線・嵯峨野線の所要時間は公式（JR東海は証明書エラー、JR西日本は記載なし）で確認できなかった');
  log('arashiyama', 'arashiyama-2', '説明・見どころ・title を「嵯峨・保津川側」に書き分け。竹林の道の見どころは駅周辺側へ。トロッコは公式の「片道約7km・およそ25分」「窓ガラスのないオープン車両リッチ号」「JR山陰線の複線化で使われなくなった線路」に合わせた。大阪から約1時間10分・徒歩約6分・travelTime を削除', 'https://www.sagano-kanko.co.jp/about', '保津川下り（403）・翠嵐（証明書エラー）の公式は取得できなかった。保津川下りの説明は旧ページのまま（確認できていない）');
  const art = JSON.parse(fs.readFileSync(path.join(root, artPath('arashiyama')), 'utf8'));
  const sec = art.sections.find((s) => s.body.includes('室町時代につくられた庭だ'));
  sec.body = sub(sec.body, '曹源池庭園、室町時代につくられた庭だ。', '曹源池庭園、約700年前に夢窓国師が作庭した庭だ。', 'arashiyama article');
  if (!DRY) fs.writeFileSync(path.join(root, artPath('arashiyama')), JSON.stringify(art, null, 2) + '\n');
  void aOld; void bOld;
}

// ── STEP 3: 支笏湖いとう温泉（閉館は確認できていない。営業状況は公式で確認できない）──
{ const d = get('gen_北海_支笏湖いとう温泉');
  d.description = '支笏湖温泉は、北海道千歳市にある湖畔の温泉地だ。日本有数の透明度を誇る支笏湖のほとりに立ち、冬がベストシーズン。支笏湖いとう温泉について、宿の営業状況は公式で確認できません。冬には湖上に穴釣りの風景が現れ、モラップキャンプ場展望台では樹齢300年超のトドマツ林に囲まれた湖全体を眼下に収められる。南にそびえる恵庭岳は標高1319メートルの活火山で、整備された登山道から支笏湖と樽前山を見渡せる。青と白だけが残る冬の湖岸。';
  d.catch = '冬の支笏湖の岸には、青と白だけが残っていた。';
  delete d.stayDescription; delete d.displayName; delete d.featured_stay;
  d.spots = d.spots.filter((s) => s.name !== '支笏湖いとう温泉');
  d.mainSpot = '支笏湖'; d.mapPoint = '支笏湖'; d.finalAccess = { ...d.finalAccess, to: '支笏湖' };
  d.hotelSearch = '支笏湖'; d.hotelKeyword = '支笏湖'; d.stayArea = { ...d.stayArea, rakuten: '支笏湖' };
  d.staySearchUrl = d.staySearchUrl.replace(encodeURIComponent('支笏湖いとう温泉'), encodeURIComponent('支笏湖')).replace(encodeURIComponent(encodeURIComponent('支笏湖いとう温泉')), encodeURIComponent(encodeURIComponent('支笏湖')));
  d.seo = { description: '支笏湖温泉は、北海道千歳市にある湖畔の温泉地。日本有数の透明度を誇る支笏湖のほとりに立ち、冬がベストシーズン。宿の営業状況は公式で確認できません。' };
  const art = J(artPath(d.id));
  art.lead = '湖面が凍りつく、真冬の支笏湖。\n観光地らしい賑やかさは、ここにはない。\nただ、湖と、空気だけがある。';
  art.sections = art.sections.filter((s) => !s.title.startsWith('支笏湖いとう温泉'));
  const lake = art.sections.find((s) => s.title.startsWith('支笏湖畔の散歩道'));
  lake.body = sub(lake.body, '温泉の後、湖岸を歩いた。\n宿から歩いて5分もかからない。\n\n', '湖岸を歩いた。\n\n', 'shikotsu lake');
  art.modelCourse = { daytrip: '12時：湖畔散歩 → 15時：支笏湖ビジターセンター立ち寄り → 16時：帰路', onenight: '1日目／13時：支笏湖着・湖畔散歩 → 2日目／10時：氷濤まつり会場（2月開催時）または湖岸ウォーク → 12時：帰路' };
  art.tips = sub(art.tips, '日帰り入浴は平日の午前中が空いている。\n温泉後の水分補給を忘れずに。\n', '', 'tips') ;
  art.tips = art.tips.replace(/\n*$/, '') + '\n支笏湖いとう温泉について、宿の営業状況は公式で確認できません。';
  art.bestSeason = sub(art.bestSeason, '氷濤まつりと雪景色の露天風呂が重なる時期は特別。', '氷濤まつりと雪景色の湖岸が重なる時期は特別。', 'bestSeason');
  if (!DRY) fs.writeFileSync(path.join(root, artPath(d.id)), JSON.stringify(art, null, 2) + '\n');
  log('shikotsu', d.id, '宿の営業を示す記述（露天風呂・日帰り入浴・営業時間・一軒宿・チェックイン等）と宿の見どころ・OTA検索語を外し、「宿の営業状況は公式で確認できません」と書いた。移動用ページにはしていない', null, '公式サイトを確認できず（第三者サイトのみ。閉館は確認できていない）');
  const f = J('src/data/stayKeywordFallback.json');
  for (const k of Object.keys(f)) if (f[k]['支笏湖いとう温泉'] !== undefined) delete f[k]['支笏湖いとう温泉'];
  if (!DRY) W('src/data/stayKeywordFallback.json', f);
}

// ── 説明の条件（数字・字数・短文）を外す一覧に、時間の文を削除した嵐山2件を加える ──
{ const t = J('scripts/data/descTimeTrimmed.json');
  for (const id of ['arashiyama', 'arashiyama-2']) if (!t.ids.includes(id)) t.ids.push(id);
  if (!DRY) W('scripts/data/descTimeTrimmed.json', t); }

if (!DRY) { W('src/data/destinations.json', nextDests); fs.writeFileSync(path.join(B, 'moved.json'), JSON.stringify(moved, null, 1) + '\n'); }
console.log(DRY ? 'dry' : `完了: 旧ページ ${rm.size}件を除去 / 記録 ${moved.length}行`);
