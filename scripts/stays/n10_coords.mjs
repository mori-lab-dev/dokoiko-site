// featured_stay 拡充バッチ10・座標修正後の3か所（2026-10-13 公式サイトで実在・営業を確認）
//
// 採用基準:
//   ・宿の公式サイトを開き、実在と営業中であることを確認した
//     （閉館・休業中・公式が開けないものは採用していない）
//   ・宿の住所を国土地理院でジオコーディングし、紐づける destination（修正後の座標）から
//     8km 以内（島は島内）であることを確認した
//   ・既に別の destination の featured_stay になっている宿・同じ温泉地の宿は使わない
//   ・送迎は公式に書かれているものだけ記載。書かれていなければ項目ごと省略した
//   ・楽天／じゃらんに個別ページを確認できた宿は jalanUrl を記録（画面には出ない）。
//     確認できず電話予約中心の宿は otaListed:false + officialUrl（https・200）
//
// jalanUrl は既存データとの整合のための記録で、画面には出ない（[id].astro の safeJalanUrl が宿名検索に置換）。
export default {
  'shinojima': {
    name: '篠島 香翠荘',
    catchcopy: '篠島の堂山にある全10室オーシャンビューの宿。展望露天風呂あり',
    jalanUrl: 'https://www.jalan.net/yad336193/',
    hasShuttle: true,
    shuttleInfo: '篠島港から宿まで送迎あり（師崎港・河和港・伊良湖港での乗船時に連絡）',
    accessStation: '篠島港から徒歩約13分',
  },
  'ryusendo': {
    name: '岩泉龍泉洞ホテル 龍のすみか',
    catchcopy: '龍泉洞の入口近く。大浴場と貸切の炭風呂がある旧・龍泉洞温泉ホテル',
    jalanUrl: 'https://www.jalan.net/yad383586/',
    accessStation: '龍泉洞前バス停から徒歩約1分（盛岡駅からJRバス約131分）',
  },
  'tobishima-island': {
    name: '沢口旅館',
    catchcopy: '飛島の勝浦にある本館・別館2棟の純和風の旅館。全10室',
    otaListed: false,
    officialUrl: 'https://reserva.be/sawaguchi',
    bookingNote: '予約は公式予約サイトまたは電話（080-2805-5686）',
    accessStation: '飛島・勝浦港',
  },
};
