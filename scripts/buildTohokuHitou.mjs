// 東北の秘湯 2件（檜枝岐温泉・中ノ沢温泉）を destinations.json に追加する（2026-11-06）。
// 入力: logs/tohoku_hitou_coords.json（座標ゲート）、公式サイト・Wikipedia で読んだ事実だけ。数値は集めた材料にあるものだけ。
//   画像: Vision（Haiku/Sonnet）が使えず（APIの残高不足）、機械照合まで通った候補は logs/tohoku_hitou_images.json に残すだけ。画像なしで掲載する。
//   travelTime: 宿の公式案内・会津鉄道の時刻表で確認できた区間の合計だけ。確認できない出発地は入れない（travelTimeEstimated は付けない）。
// 使い方: node scripts/buildTohokuHitou.mjs [--dry]   何度流しても同じ結果になる（同じ id は作り直す）
import fs from 'fs';
import path from 'path';
import { root } from './travelTimeBound.mjs';
import { checkDesc } from './descStyleCheck.mjs';

const dry = process.argv.includes('--dry');
const FILE = path.join(root, 'src/data/destinations.json');
const all = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const coords = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root, 'logs/tohoku_hitou_coords.json'), 'utf8')).map((c) => [c.id, c]));
const tmpl = all.find((d) => d.id === 'yunokami-onsen');
const CHECKED = '2026年11月6日';
const KAGIYA = 'https://www.kagiya-ryokan.com/access/access.html', MANYO = 'https://manyoutei.jp/access.html';

const base = (o) => ({
  id: o.id, name: o.name, type: 'destination', region: '東北', hub: '仙台', stayAllowed: ['1night'], departures: o.departures, weight: 1,
  description: o.description, tags: ['温泉', '秘湯', '自然', '湯治'], spots: o.spots,
  shinkansenAccess: false, requiresCar: false, hotelSearch: o.name,
  gateways: { rail: [o.station], airport: [], bus: [], ferry: [] },
  destType: 'onsen', railGateway: o.station, busGateway: null, ferryGateway: null, airportGateway: null,
  prefecture: '福島県', lat: coords[o.id].lat, lng: coords[o.id].lng, stayBias: 1, city: o.city, hotelKeyword: o.name,
  situations: ['solo', 'couple'], catch: o.catch, primary: ['温泉', '秘湯'], secondary: ['自然', '湯治'], onsenLevel: 3, hasDirectFlight: false,
  mapPoint: o.mainSpot, subType: 'onsen', representativeStation: o.station, hubStation: o.station, accessStation: o.station,
  hotelArea: 'fukushima', finalAccess: { type: 'bus', from: o.station }, localAccess: { type: 'bus', from: o.station },
  stayArea: { rakuten: o.name, jalan: o.name }, mainSpot: o.mainSpot,
  travelTime: o.travelTime, stayRecommendation: '1night', tier: 'area', tier2: 'area', icCard: 'suica',
  hotelLinks: tmpl.hotelLinks, reasonChips: ['温泉', '自然と過ごす', '1泊がおすすめ', 'ひとり旅向け', 'カップル向け', '秘境感あり'],
  bestSeason: '秋', images: [], featured_stay: o.stay, seo: o.seo, carFree: { checked: CHECKED, items: o.items, timetable: o.timetable, unconfirmed: o.unconfirmed, seo: o.seo },
});
const item = (label, body, srcLabel, url) => ({ label, body, source: { label: srcLabel, url }, checked: CHECKED });

const E = [
  base({
    id: 'hinoemata-onsen', name: '檜枝岐温泉', city: '檜枝岐村', station: '会津田島駅', departures: ['東京'],
    description: '燧ヶ岳と会津駒ヶ岳に囲まれた標高920〜1000mの谷に、尾瀬の福島側の玄関口になる温泉地がある。村内には複数の源泉があり、燧の湯は単純硫黄泉、駒の湯はアルカリ性単純温泉と泉質が分かれる。家々の屋根は景観保全のため、1979年に赤錆色にそろえられた。民宿や旅館では、裁ちそばやはっとうなど山人料理が出る。檜枝岐歌舞伎は約270年続く。役者から裏方まで村民だけで演じる。会津田島駅から会津バスで1時間40分かかり、村全域が特別豪雪地帯だ。',
    catch: '屋根を赤錆色にそろえた村で、歌舞伎が約270年続いている。', mainSpot: '檜枝岐の舞台',
    spots: [
      { name: '檜枝岐の舞台', description: '檜枝岐歌舞伎を上演する舞台で、国指定の重要有形民俗文化財。歌舞伎は約270年受け継がれ、役者から裏方まで村民が務める。' },
      { name: '尾瀬沼と燧ヶ岳', description: '燧ヶ岳は標高2,356mで東北以北の最高峰。ふもとの尾瀬沼は周囲約7kmに木道が敷かれ、1周約3時間で歩ける。' },
      { name: '六地蔵', description: '道端に並ぶ六体の稚児像。冷害に悩まされた山深い村で、幼い命を弔うために建てられた。' },
    ],
    travelTime: { tokyo: 288 },
    stay: { name: 'かぎや旅館', catchcopy: '旧沼田街道沿いの宿。屋号は関所の鍵を扱った家に由来すると伝わる', hasShuttle: false, accessStation: '会津田島駅から会津バスで1時間40分' },
    seo: { title: '【檜枝岐温泉】車なしの行き方・山人料理・歌舞伎｜福島県', description: '尾瀬の福島側の入口、檜枝岐温泉へ車なしで。会津田島駅から会津バスで1時間40分、冬は運行本数が少なくなる。山人料理と約270年続く檜枝岐歌舞伎も紹介。' },
    items: [
      item('駅から行く（会津田島駅）', 'かぎや旅館の公式案内では、東武線・会津線の会津田島駅から会津バスで尾瀬檜枝岐温泉まで1時間40分です。バス停名と、バス停から宿までの徒歩時間は、この案内に書かれていません。', 'かぎや旅館 公式サイト「アクセス」', KAGIYA),
      item('東京から行く（東武線）', '公式案内は、浅草駅から東武伊勢崎線・東武日光線で会津田島駅へ行き、そこから会津バスに乗る経路を案内しています。JR新宿駅始発（池袋・大宮停車）の東武線直通特急もあります。', 'かぎや旅館 公式サイト「アクセス」', KAGIYA),
      item('特急リバティ会津の所要時間', '会津鉄道の時刻表（令和8年3月14日改正）で、リバティ会津の浅草発から会津田島着までを読むと、3時間8分〜12分です。列車によって数分違います。', '会津鉄道「会津線列車時刻表（令和8年3月14日改正）」', 'https://aizutetsudo.jp/wp-content/uploads/2026/03/2026_asakusashinjuku.pdf'),
      item('冬のバス', 'かぎや旅館のお知らせ（2026年10月25日付）によると、11月1日から3月31日のオフシーズンは、檜枝岐行き・会津田島行きとも運行本数が少ない冬の時刻表です。乗る前に最新の時刻表を確認してください。', 'かぎや旅館 公式サイト「お知らせ」', 'https://www.kagiya-ryokan.com/'),
      item('冬期の宿泊', 'かぎや旅館のお知らせ（2026年11月2日付）では、12月1日から3月31日まで、お一人様の宿泊は他のお客様の予約がある場合に限って受け付けるとあります。', 'かぎや旅館 公式サイト「お知らせ」', 'https://www.kagiya-ryokan.com/'),
    ],
    timetable: [
      { label: 'かぎや旅館 アクセス（会津バスの案内と冬の時刻表のお知らせ）', url: KAGIYA },
      { label: '会津鉄道 会津線列車時刻表（令和8年3月14日改正・PDF）', url: 'https://aizutetsudo.jp/wp-content/uploads/2026/03/2026_asakusashinjuku.pdf' },
    ],
    unconfirmed: ['会津バスの公式ページでの檜枝岐線の時刻・運賃（バス会社の公式ページを開けなかった）', '会津田島駅からのバスの停留所名と、停留所から宿までの徒歩時間', 'かぎや旅館の駅・停留所からの送迎（公式案内に記載を読めなかった）', '浅草駅以外（東京駅など）から会津田島駅までの公式の所要時間'],
  }),
  base({
    id: 'nakanosawa-onsen', name: '中ノ沢温泉', city: '猪苗代町', station: '猪苗代駅', departures: ['東京', '仙台'],
    description: '安達太良山の西麓、磐梯山との間にある標高1000mの温泉街。源泉の沼尻元湯から約7km引き湯していて、湧出量は毎分13,400リットルを数える。1887年には共同浴舎と旅館が開業した。湯はpH1.85の強い酸性で、金属やプラスチックが長持ちしないため、風呂場は木や石でつくる。共同浴場や日帰り入浴施設はなく、日帰りは旅館の外来入浴を使う。こけしも名物だ。猪苗代駅前からバスで約30分、停留所から宿までは徒歩約5分。',
    catch: '7km引いてきた湯は、pH1.85の強い酸性だ。', mainSpot: '沼尻元湯',
    spots: [
      { name: '中ノ沢こけし', description: '大正期に木地師が来て以降つくられてきたこけしで、「中丿沢こけし」と呼ばれる。赤らんだ顔から「たこ坊主」とも呼ばれる。' },
      { name: '沼尻元湯', description: '湯の源泉は沼尻元湯で、宿までの約7kmを引き湯する。源泉は約80度で、宿の湯口では50℃前後になる。' },
      { name: '白糸の滝', description: '150mの断崖を流れ落ちる滝の水は、すべて温泉。未舗装の山道を車で約20分走った先の展望台から見る。' },
    ],
    travelTime: { tokyo: 165, sendai: 145 },
    stay: { name: '御宿 万葉亭', catchcopy: '中ノ沢温泉・沼尻温泉の源泉を掛け流す、日本秘湯を守る会の宿', hasShuttle: false, accessStation: '猪苗代駅前からバスで30分、「会津中ノ沢温泉」下車徒歩約5分' },
    seo: { title: '【中ノ沢温泉】車なしの行き方・強酸性の湯｜福島県', description: '猪苗代駅前からバスで約30分、停留所から徒歩約5分。毎分13,400リットルが湧くpH1.85の源泉掛け流しの湯、中ノ沢こけし、宿までの行き方を紹介。' },
    items: [
      item('駅から行く（猪苗代駅）', '御宿万葉亭の公式案内では、猪苗代駅前から磐梯東都バスで30分、「会津中ノ沢温泉」で降りて徒歩約5分です。宿は沼尻郵便局の向かいにあります。バスの問い合わせ先として、磐梯東都バスの電話番号が載っています。', '御宿 万葉亭 公式サイト「交通案内」', MANYO),
      item('東京・仙台・新潟から', '同じ案内に、東京〜郡山が1時間30分、仙台〜郡山が1時間10分、郡山〜猪苗代が約40分とあります。新潟からは磐越西線で新潟〜会津若松が約2時間20分、会津若松〜猪苗代が約30分です。', '御宿 万葉亭 公式サイト「交通案内」', MANYO),
      item('福島空港から', '公式案内に、福島空港からはリムジンバスが便利で、郡山駅前まで往復していると書かれています。', '御宿 万葉亭 公式サイト「交通案内」', MANYO),
    ],
    timetable: [{ label: '御宿 万葉亭 交通案内（バス・鉄道の案内）', url: MANYO }],
    unconfirmed: ['猪苗代駅前からのバスの運行本数・時刻・運賃（バス会社の公式ページ）', '万葉亭の駅・停留所からの送迎（公式案内に記載を読めなかった）', '福島空港のリムジンバスの運行会社・時刻・運賃'],
  }),
];

// 検査: 本文の規則・数字の根拠
for (const e of E) {
  const r = checkDesc(e.description, e.id);
  if (!r.ok) throw new Error(`${e.id}: description が基準に落ちる ${r.issues.join(' / ')}`);
  for (const s of e.spots) if (s.description.length < 40 || s.description.length > 80) throw new Error(`${e.id}/${s.name}: spot の字数 ${s.description.length}`);
  if (Object.keys(e.travelTime).some((k) => e.travelTimeEstimated)) throw new Error('travelTimeEstimated は付けない');
}
console.log(E.map((e) => `${e.id}: description ${e.description.length}字 / spots ${e.spots.map((s) => s.description.length).join(',')}字 / travelTime ${JSON.stringify(e.travelTime)} / title ${[...e.seo.title].length}字 desc ${[...e.seo.description].length}字`).join('\n'));
if (dry) process.exit(0);
const ids = new Set(E.map((e) => e.id));
const next = all.filter((d) => !ids.has(d.id)).concat(E);
fs.writeFileSync(FILE, JSON.stringify(next, null, 2) + '\n');
console.log(`destinations.json: ${all.length} → ${next.length}`);
