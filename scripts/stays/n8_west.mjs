// featured_stay 拡充バッチ8・西日本（2026-10-08 公式サイトで実在・営業を確認）
//
// 採用基準:
//   ・宿の公式サイトを開き、実在と営業中であることを確認した
//     （閉館・休館・休業中のものは採用していない）
//   ・宿の住所を国土地理院／OSM でジオコーディングし、紐づける destination から
//     8km 以内であることを確認した（同名異所の防止）
//   ・既に別の destination の featured_stay になっている宿は使わない
//   ・送迎は公式に書かれているものだけ記載。書かれていなければ項目ごと省略した
//   ・楽天／じゃらんに掲載がある宿のみ（otaListed:false の宿は無し）
//
// jalanUrl は既存データとの整合のための記録で、画面には出ない（[id].astro の safeJalanUrl が宿名検索に置換）。
export default {
  'iojima-nagasaki': {
    name: 'i+Land nagasaki',
    catchcopy: '長崎港の沖、伊王島にある温泉・ビーチ併設のリゾートホテル',
    jalanUrl: 'https://www.jalan.net/yad319516/',
    hasShuttle: true,
    shuttleInfo: '長崎駅発の無料送迎バスあり（予約制）',
    accessStation: '長崎駅',
  },
  'niche_沖縄_1': {
    name: '琉球温泉 瀬長島ホテル',
    catchcopy: '那覇空港から車で約15分。瀬長島に建ち、天然温泉「龍神の湯」を備える',
    jalanUrl: 'https://www.jalan.net/yad352977/',
    accessStation: '赤嶺駅からバス約10分',
  },
  'kushimoto': {
    name: 'メルキュール和歌山串本リゾート＆スパ',
    catchcopy: '本州最南端の串本町、太平洋を望む温泉リゾートホテル',
    jalanUrl: 'https://www.jalan.net/yad322847/',
    accessStation: '串本駅',
  },
  'oguni-kumamoto': {
    name: '湯宿 小国のオーベルジュ わいた館',
    catchcopy: 'わいた温泉郷のはげの湯にある宿。小国フレンチと貸切の湯が特徴',
    jalanUrl: 'https://www.jalan.net/yad308676/',
    accessStation: '大分自動車道・玖珠ICから車約30分',
  },
  'shionoe': {
    name: 'いろりの宿 魚虎',
    catchcopy: '塩江温泉の家族経営の小さな宿。囲炉裏を囲んで地元食材の料理を味わう',
    jalanUrl: 'https://www.jalan.net/yad333552/',
    accessStation: '高松駅からバス約1時間、塩江バス停から徒歩約5分',
  },
  'daisen': {
    name: 'ホテル大山 しろがね',
    catchcopy: '大山の夏山登山口まで徒歩約5分。登山拠点になる客室24室の宿',
    jalanUrl: 'https://www.jalan.net/yad310372/',
    accessStation: '米子駅からバス約50分',
  },
  'yobuko': {
    name: '尾ノ上Ryokan',
    catchcopy: '玄界灘を見下ろす丘の上の宿。呼子のイカ料理とペット同伴の宿泊に対応',
    jalanUrl: 'https://www.jalan.net/yad389265/',
    accessStation: '西唐津駅からバス約25分',
  },
  'chatan': {
    name: 'ヒルトン沖縄北谷リゾート',
    catchcopy: '北谷・美浜エリアのリゾートホテル。大きなラグーンプールがある',
    jalanUrl: 'https://www.jalan.net/yad308366/',
    accessStation: '那覇空港から車で約40分',
  },
  'zamami-island': {
    name: 'サンメール座間味',
    catchcopy: '2023年開業の全5室の小さなリゾートホテル。プライベートプール付きの客室もある',
    jalanUrl: 'https://www.jalan.net/yad367480/',
    accessStation: '泊港から高速船約1時間、座間味港',
  },
  'ie-island': {
    name: 'ホテルYYY CLUB iE RESORT',
    catchcopy: '伊江島の海沿いに建つリゾートホテル。本館とコテージがある',
    accessStation: '本部港からフェリー約30分、伊江港',
  },
  'tanegashima': {
    name: '種子島あらきホテル',
    catchcopy: '西之表港から徒歩約4分。天然温泉「赤尾木の湯」を併設する宿',
    jalanUrl: 'https://www.jalan.net/yad325240/',
    hasShuttle: true,
    shuttleInfo: '西之表港から無料送迎あり（事前予約必須・空港との送迎は行っていない）',
    accessStation: '西之表港から徒歩約4分',
  },
  'kitsuki': {
    name: '杵築百年旅館 日向屋',
    catchcopy: '大正5年創業の旅館。杵築の海辺で地魚とオコゼ料理を出す',
    jalanUrl: 'https://www.jalan.net/yad332265/',
    accessStation: '杵築駅',
  },
  'tsuyama': {
    name: '津山城東むかし町 城下小宿 糀や',
    catchcopy: '出雲街道沿いの城東地区。旧苅田酒造の建物を改修した町家の宿',
    jalanUrl: 'https://www.jalan.net/yad312890/',
    accessStation: '津山駅から徒歩約15分',
  },
  'niche_和歌山_1': {
    name: '古民家・町屋の宿 千山庵 SenzanAn',
    catchcopy: '醤油発祥の地・湯浅の伝統的建造物群保存地区で、古い町家に1組ずつ泊まる',
    accessStation: '湯浅駅から徒歩約9分',
  },
  'nagahama': {
    name: 'グランドメルキュール琵琶湖リゾート＆スパ',
    catchcopy: '琵琶湖畔の長浜に建つリゾートホテル。黒壁スクエアへ徒歩圏',
    jalanUrl: 'https://www.jalan.net/yad316793/',
    hasShuttle: true,
    shuttleInfo: 'JR長浜駅西口（びわこ口）から無料送迎バスあり（予約不要）',
    accessStation: '長浜駅',
  },
};
