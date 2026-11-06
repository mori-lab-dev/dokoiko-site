// travelTime の「これより短くは行けない」下限（最短値）と、本文の所要時間の文を見つける部品（2026-11-06）。
// 補正スクリプト（fixTravelTime.mjs）と検査（auditTravelTime.mjs）が同じ関数を呼ぶ。
//
// 最短値の出し方（前回 auditTravelTime*.py の方法に、飛行機の考え方を足した）:
//   直線距離 ÷ 区分ごとの上限時速（鉄道・バス・車）と、飛行機（直線距離 ÷ 800km/h ＋ 空港での90分）の、短いほう。
//   前回は 400km 以上の在来線の組に 160km/h だけを当てていたが、飛行機が使える区間では 160km/h より速く着ける
//   （例: 東京→鹿児島空港 約100分の飛行）。短いほうを取れば、最短値が実際の所要時間を上回ることがない。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// 出発地の代表駅 key -> [日本語名, 緯度, 経度]
export const ORIGINS = {
  tokyo: ['東京', 35.6812, 139.7671], osaka: ['大阪', 34.7025, 135.4959], nagoya: ['名古屋', 35.1709, 136.8815],
  fukuoka: ['福岡', 33.5897, 130.4207], takamatsu: ['高松', 34.3502, 134.0467], gifu: ['岐阜', 35.4091, 136.7566],
  hamamatsu: ['浜松', 34.7036, 137.7344], mito: ['水戸', 36.3711, 140.4764], shimonoseki: ['下関', 33.9506, 130.9234],
  maebashi: ['前橋', 36.3830, 139.0731], saga: ['佐賀', 33.2650, 130.3000], takasaki: ['高崎', 36.3225, 139.0125],
  oita: ['大分', 33.2329, 131.6063], beppu: ['別府', 33.2785, 131.5001], kofu: ['甲府', 35.6674, 138.5685],
  tanabe: ['田辺', 33.7283, 135.3790], shirahama: ['白浜', 33.6806, 135.3471], tottori: ['鳥取', 35.4938, 134.2275],
  kushimoto: ['串本', 33.4742, 135.7847], shingu: ['新宮', 33.7283, 135.9886], wakayama: ['和歌山', 34.2330, 135.1910],
  hiroshima: ['広島', 34.3978, 132.4753], sendai: ['仙台', 38.2601, 140.8824], sapporo: ['札幌', 43.0687, 141.3508],
  naha: ['那覇', 26.2125, 127.6791], kushiro: ['釧路', 42.9930, 144.3813], obihiro: ['帯広', 42.9206, 143.2046],
  kitami: ['北見', 43.8040, 143.8960], himeji: ['姫路', 34.8272, 134.6910], niigata: ['新潟', 37.9120, 139.0618],
  fukuyama: ['福山', 34.4895, 133.3620], ishigaki: ['石垣', 24.3448, 124.1572], kanazawa: ['金沢', 36.5780, 136.6480],
  miyako: ['宮古', 24.7960, 125.2810], kurashiki: ['倉敷', 34.5995, 133.7720], aomori: ['青森', 40.8280, 140.7350],
  kyoto: ['京都', 34.9858, 135.7588], kobe: ['神戸', 34.6913, 135.1830], fukushima: ['福島', 37.7541, 140.4592],
  akita: ['秋田', 39.7172, 140.1290], okayama: ['岡山', 34.6666, 133.9183], yamagata: ['山形', 38.2486, 140.3283],
  tokushima: ['徳島', 34.0746, 134.5513], kumamoto: ['熊本', 32.7900, 130.6890], yamaguchi: ['山口', 34.1640, 131.4740],
  yokohama: ['横浜', 35.4658, 139.6224], kochi: ['高知', 33.5590, 133.5360], nagasaki: ['長崎', 32.7524, 129.8720],
  hakodate: ['函館', 41.7736, 140.7265], miyazaki: ['宮崎', 31.9150, 131.4310], matsue: ['松江', 35.4628, 133.0670],
  morioka: ['盛岡', 39.7010, 141.1360], matsumoto: ['松本', 36.2300, 137.9650], nara: ['奈良', 34.6810, 135.8190],
  matsuyama: ['松山', 33.8363, 132.7510], kagoshima: ['鹿児島', 31.5840, 130.5420], utsunomiya: ['宇都宮', 36.5590, 139.8990],
  shizuoka: ['静岡', 34.9717, 138.3890], hachinohe: ['八戸', 40.5120, 141.4880], kitakyushu: ['北九州', 33.8840, 130.8830],
  asahikawa: ['旭川', 43.7640, 142.3580], nagano: ['長野', 36.6430, 138.1880], toyama: ['富山', 36.7010, 137.2130],
  fukui: ['福井', 36.0620, 136.2230],
};
export const NAME_TO_KEY = Object.fromEntries(Object.entries(ORIGINS).map(([k, v]) => [v[0], k]));

// 式（基準の出発地の値 ＋ 定数）で作られている出発地。2026-11-05 の点検で、同じ差で一致する割合が87〜95%だった16か所
export const FORMULA_ORIGINS = {
  gifu: ['nagoya', 20], hamamatsu: ['nagoya', 30], mito: ['tokyo', 45], shimonoseki: ['fukuoka', 30],
  maebashi: ['tokyo', 60], saga: ['fukuoka', 30], takasaki: ['tokyo', 60], oita: ['fukuoka', 60],
  beppu: ['fukuoka', 70], kofu: ['tokyo', 90], tanabe: ['osaka', 90], shirahama: ['osaka', 100],
  tottori: ['osaka', 120], kushimoto: ['osaka', 120], shingu: ['osaka', 120], wakayama: ['osaka', 30],
};

// 公式の区間の合計（待ち時間を足さない）を下限にする組。非公式（乗換案内・旅行サイト・報道・ファンサイト）の数字は入れない。
// 2026-11-04 の照合（公式の時刻表・運輸局・空港公式・観光協会）。floor は区間の合計で、今の値より長いときだけ効く
export const OFFICIAL_FLOORS = [
  { id: 'kyoto', o: 'gifu', floor: 34, note: 'のぞみの名古屋→京都 34分（JR時刻表データ）。岐阜→名古屋は乗換案内のため入れない' },
  { id: 'zaou-onsen', o: 'tokyo', floor: 146, note: '東京→山形 つばさ 約2時間26分' },
  { id: 'otaru', o: 'obihiro', floor: 147 + 33, note: '帯広→札幌 2時間27分以上＋札幌→小樽 33分以上（北海道観光機構。幅の短い側）' },
  { id: 'hita', o: 'tokyo', floor: 110 + 75, note: '羽田→福岡 110分（ANA時刻表）＋福岡空港→日田 高速バス 1時間15分（日田市観光協会）' },
];
// 照合したが、公式の区間の合計が今の値以下（または非公式のみ）で、補正しなかった組（報告用）
export const OFFICIAL_NOT_APPLIED = [
  ['tsushima', 'shimonoseki', '博多→厳原 135分は2019年の資料。現行ダイヤの確認まで外す（指示）'],
  ['iki-island', 'oita', '公式は 博多港→郷ノ浦 70分のみ（大分〜博多の列車は公式でない・最短経路でもない）'],
  ['shiretoko', 'tokyo', '公式は 空港→ウトロのバス 130分のみ（フライトは非公式）'],
  ['aomori', 'hakodate', '公式の区間は 新青森〜新函館北斗 約64分のみ（残りは非公式）'],
  ['nara', 'okayama', '公式の区間は 岡山〜新大阪 約47分のみ（大阪〜奈良は非公式）'],
  ['miyajima', 'osaka', '公式の区間は 新大阪→広島 85分のみ（広島〜宮島口・船は非公式）'],
  ['miyajima', 'tokyo', '公式の区間は 東京→広島 237分のみ（同上）'],
  ['tanegashima', 'fukuoka', '公式の区間は 鹿児島→種子島 40分のみ（新幹線は非公式）'],
  ['sakunami-onsen', 'fukuoka', '公式の区間は 福岡→仙台 105分＋仙台空港→仙台駅 25分＝130分（バスは非公式）'],
  ['kyoto', 'osaka', '公式の数字なし（新快速の28〜29分は非公式）'],
];

export const hav = (a, b, c, d) => {
  const R = 6371.0088, r = Math.PI / 180;
  const p1 = a * r, p2 = c * r, dphi = p2 - p1, dl = (d - b) * r;
  const h = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
export const islandOf = (lat, lng) => (lat >= 41.3 && lng >= 139.3 ? 'hokkaido' : (lat < 28.5 && lng < 131.5 ? 'okinawa' : 'main'));

/** 区分: X=本州・北海道・沖縄をまたぐ / S=新幹線の駅がある旅先（60km超） / R=在来線・バス・車 */
export function classify(dest, key, dist) {
  const [, la, ln] = ORIGINS[key];
  if (islandOf(la, ln) !== islandOf(dest.lat, dest.lng)) return 'X';
  if (dest.shinkansenAccess && dist > 60) return 'S';
  return 'R';
}
const railSpeed = (grp, d) => (grp === 'R' ? (d < 200 ? 90 : d < 400 ? 130 : 160) : (d < 200 ? 130 : 170));
const airMin = (d) => d / 800 * 60 + 90;

/** 前回（2026-11-05 報告）の最短値。869組の再現用 */
export function lowerBoundOld(dest, key) {
  const [, la, ln] = ORIGINS[key];
  const dist = hav(la, ln, dest.lat, dest.lng);
  const grp = classify(dest, key, dist);
  const lb = grp === 'X' ? airMin(dist) : dist / railSpeed(grp, dist) * 60;
  return { dist, grp, lb };
}
/** 今回の最短値: 鉄道・バス・車の上限時速で走った場合と、飛行機の場合の、短いほう */
export function lowerBound(dest, key) {
  const [, la, ln] = ORIGINS[key];
  const dist = hav(la, ln, dest.lat, dest.lng);
  const grp = classify(dest, key, dist);
  const rail = dist / railSpeed(grp === 'X' ? 'S' : grp, dist) * 60;
  const lb = Math.min(rail, airMin(dist));
  return { dist, grp, lb };
}
export const ceil5 = (x) => Math.ceil(x / 5 - 1e-9) * 5;
/** 最短値を1.25倍以上下回る（＝確実に不自然）か */
export const RATIO = 1.25;

/** 補正前の値（退避済みならそれ）を返す */
export const baseValue = (dest, key) => dest.travelTimeOriginal?.[key] ?? dest.travelTime?.[key];

// ── 本文の「{出発地名}から約N分／N時間」の文 ──────────────────
const ORIGIN_NAMES = Object.values(ORIGINS).map((v) => v[0]).sort((a, b) => b.length - a.length);
const DUR = '(?:約|およそ)?(?:(\\d+)時間(?:(\\d+)分|半)?|(\\d+)分)';
// 起点と時間の間に「まで」があるものは、途中の区間（例: 京都まで約2時間15分）なので対象にしない
export const originTimePattern = () => new RegExp(`(?<![一-龥ァ-ヶー])(${ORIGIN_NAMES.join('|')})(?:駅|空港|市内|市街|港)?(?:から|より|発)((?:(?!まで)[^。\\n、]){0,14}?)${DUR}`, 'g');
export function minutesOf(m) {
  if (m[3] !== undefined) return Number(m[3]) * 60 + (m[4] !== undefined ? Number(m[4]) : /半$/.test(m[0]) ? 30 : 0);
  return Number(m[5]);
}
export const splitSentences = (t) => String(t || '').split(/(?<=。)/);

// 公式で確認した文（2026-11-04）。所要時間の文の削除から外す
export const ALLOW_TEXT = [['arashiyama', '京都駅からJR嵯峨野線'], ['kurokawa-k', '福岡市から車で約3時間']];
export const isAllowedText = (id, sentence) => ALLOW_TEXT.some(([i, sub]) => i === id && sentence.includes(sub));
