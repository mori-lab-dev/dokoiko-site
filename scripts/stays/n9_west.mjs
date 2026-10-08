// featured_stay 拡充バッチ9・西日本（2026-10-08 公式サイトで実在・営業を確認）
//
// 採用基準:
//   ・宿の公式サイトを開き、実在と営業中であることを確認した
//     （閉館・休業中・公式が開けないものは採用していない）
//   ・宿の住所を国土地理院／OSM でジオコーディングし、紐づける destination から
//     8km 以内であることを確認した（同名異所の防止）
//   ・既に別の destination の featured_stay になっている宿・同じ温泉地の宿は使わない
//   ・送迎は公式に書かれているものだけ記載。書かれていなければ項目ごと省略した
//   ・楽天／じゃらんに個別ページを確認できた宿は jalanUrl を記録（画面には出ない）。
//     確認できず電話予約中心の宿は otaListed:false + officialUrl（https・200）
//
// jalanUrl は既存データとの整合のための記録で、画面には出ない（[id].astro の safeJalanUrl が宿名検索に置換）。
export default {
  'niche_奈良_2': {
    name: 'ホテルのせ川',
    catchcopy: '本州で最も人口の少ない野迫川村にある、標高約700mの一軒宿',
    jalanUrl: 'https://www.jalan.net/yad317846/',
    hasShuttle: true,
    shuttleInfo: '南海高野線・高野山駅から宿泊者向けの送迎車あり（要予約）',
    accessStation: '高野山駅から送迎車で約60分',
  },
  'nishinoshima': {
    name: '国賀荘',
    catchcopy: '隠岐・西ノ島の浦郷にある、海が窓いっぱいに広がる家族経営の小さな宿',
    jalanUrl: 'https://www.jalan.net/yad387621/',
    hasShuttle: true,
    shuttleInfo: '浦郷港・別府港との間で送迎あり（要予約）',
    accessStation: '別府港から車で約10分',
  },
  'tokashiki-jima': {
    name: 'ケラマテラス',
    catchcopy: '渡嘉敷島の阿波連にある全7室のリゾートホテル。1泊2食付き',
    jalanUrl: 'https://www.jalan.net/yad313368/',
    hasShuttle: true,
    shuttleInfo: '渡嘉敷港から宿の送迎車あり（港から車で約15分）',
    accessStation: '那覇・泊港から高速船約35分、渡嘉敷港',
  },
  'minamidaitojima': {
    name: 'ホテルよしざと',
    catchcopy: '南大東島の在所にある客室19室のホテル。素泊まりにも対応',
    otaListed: false,
    officialUrl: 'https://www.hotelyoshizato.com/',
    bookingNote: '予約は電話のみ（0980-22-2511・8:00〜20:00）',
    hasShuttle: true,
    shuttleInfo: '港から無料送迎あり（公式記載・所要約8分）',
    accessStation: '南大東空港から車で約10分',
  },
  'itoshima': {
    name: 'グローカルホテル糸島',
    catchcopy: '九州大学伊都キャンパス近くの客室85室のホテル。糸島産食材の朝食',
    jalanUrl: 'https://www.jalan.net/yad326485/',
    accessStation: '波多江駅から車で約7分',
  },
  'uchiko': {
    name: '内子の宿 織',
    catchcopy: '八日市・護国の町並みにある古民家を改修した、1日1組の一棟貸し',
    jalanUrl: 'https://www.jalan.net/yad363856/',
    accessStation: '内子駅',
  },
  'usuki': {
    name: '石仏旅館',
    catchcopy: '国宝・臼杵石仏の入口まで徒歩約1分。2020年に改装した旅館',
    jalanUrl: 'https://www.jalan.net/yad301103/',
    accessStation: '臼杵駅',
  },
  'chikubushima': {
    name: '旅館 紅鮎',
    catchcopy: '奥びわ湖の尾上温泉にある一軒宿。露天風呂から竹生島を望む',
    jalanUrl: 'https://www.jalan.net/yad360828/',
    hasShuttle: true,
    shuttleInfo: '北陸本線・高月駅西口から無料送迎バスあり（要予約・約10分）',
    accessStation: '高月駅',
  },
  'tomari-okinawa': {
    name: 'ホテルにしえ',
    catchcopy: '伊平屋島の前泊港近く。島の食材を使った食事が出る民宿風ホテル',
    otaListed: false,
    officialUrl: 'https://www.hotel-nishie.com/',
    bookingNote: '予約は電話（0980-46-2145・9:00〜20:00）。支払いは現金のみ',
    hasShuttle: true,
    shuttleInfo: 'フェリー発着時のみ送迎あり（要電話予約・港から車で約3分）',
    accessStation: '前泊港',
  },
};
