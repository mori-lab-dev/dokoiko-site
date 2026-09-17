// featured_stay 拡充バッチ7（2026-09-17 公式サイトで実在・営業・送迎を確認）
//
// 採用基準:
//   ・宿の公式サイト（または予約受付ページ）で、実在と営業中であることを確認した
//   ・宿の住所を国土地理院／OSM でジオコーディングし、紐づける destination から
//     8km 以内であることを確認した（同名異所の防止）
//   ・既に別の destination の featured_stay になっている宿は使わない
//     （近くに同じ宿を持つ destination があるものは、別の宿を選んだ）
//   ・送迎は公式に書かれているものだけ記載。書かれていなければ項目ごと省略した
//
// jalanUrl について:
//   じゃらんの個別ページ（/yadNNNNNN/）はじゃらんアプリのユニバーサルリンク対象で、
//   タップするとアプリが開いてアフィリエイト計測が外れる。そのため [id].astro の
//   safeJalanUrl は個別ページを描画せず、宿名検索に置き換える（2026-08-12 の対策）。
//   ここに書く jalanUrl は既存データとの整合のための記録で、画面には出ない。
//
// otaListed: false の宿（楽天・じゃらんに掲載が無い）は、宿カードに楽天／じゃらんの
// 検索ボタンではなく公式サイトへのボタンを出す（officialUrl / bookingNote）。
export default {
  'gen_群馬_法師温泉': {
    name: '法師温泉 長寿館',
    catchcopy: '創業150年の一軒宿。国登録有形文化財「法師乃湯」の足元湧出の湯',
    jalanUrl: 'https://www.jalan.net/yad325526/',
    accessStation: '上毛高原駅からバス（猿ヶ京で乗り換え）、法師温泉下車',
  },
  'gen_青森_青荷温泉': {
    name: 'ランプの宿 青荷温泉',
    catchcopy: '電灯もテレビもなく、夜はランプの灯りだけで過ごす青荷渓谷の宿',
    jalanUrl: 'https://www.jalan.net/yad366208/',
    hasShuttle: true,
    shuttleInfo: '要予約。4〜11月は道の駅虹の湖から、12〜3月は黒石駅・道の駅虹の湖から（冬季は一般車の乗り入れ不可）',
    accessStation: '黒石駅',
  },
  'gen_群馬_鹿沢温泉': {
    // じゃらんの個別ページ yad354291 は 2026-09-17 時点で 404（掲載終了とみられる）。
    // 楽天トラベル（HOTEL/109510）は掲載中を確認したので、楽天・じゃらんの検索ボタンのまま。
    name: '鹿沢温泉 紅葉館',
    catchcopy: '明治2年創業。鹿沢温泉に唯一残る、加水も加温もしない源泉かけ流しの一軒宿',
    accessStation: '万座・鹿沢口駅からタクシー約20分',
  },
  'gen_北海_十勝岳温泉': {
    // 新潟・松之山温泉にも同名の「凌雲閣」がある（別の宿）。検索で取り違えないよう正式名で登録する。
    name: '十勝岳温泉 湯元 凌雲閣',
    catchcopy: '標高1,280m、北海道でいちばん高い所にある温泉宿。泉質の違う2本の源泉をもつ',
    jalanUrl: 'https://www.jalan.net/yad399072/',
    accessStation: '上富良野駅から町営バス約40分',
  },
  'gen_北海_然別湖畔温泉': {
    name: '然別湖畔温泉ホテル風水',
    catchcopy: '標高800m、大雪山国立公園の湖畔に建つ。全室レイクサイドビューの源泉かけ流しの宿',
    jalanUrl: 'https://www.jalan.net/yad309652/',
    accessStation: '帯広駅からバス約1時間20分（新得駅からは約1時間）',
  },
  'gen_栃木_中禅寺温泉': {
    name: '中禅寺金谷ホテル',
    catchcopy: '中禅寺湖畔の森に建つ、金谷ホテルのリゾートホテル',
    jalanUrl: 'https://www.jalan.net/yad320110/',
    hasShuttle: true,
    shuttleInfo: '東武日光駅から無料シャトルバスあり（要予約）',
    accessStation: '日光駅から湯元温泉行きバス約1時間、中禅寺金谷ホテル前下車',
  },
  'gen_北海_支笏湖温泉': {
    // 近くの destination「支笏湖」には丸駒温泉旅館を登録済みなので、別の宿にした。
    name: 'しこつ湖 鶴雅リゾートスパ 水の謌',
    catchcopy: '支笏湖温泉の湖畔に建つ、鶴雅グループのリゾートスパ',
    jalanUrl: 'https://www.jalan.net/yad395279/',
    hasShuttle: true,
    shuttleInfo: '新千歳空港・JR千歳駅から無料送迎バスあり（3日前の19時までに要予約）',
    accessStation: '千歳駅',
  },
  'gen_北海_定山渓温泉': {
    // 近くの destination「定山渓」にはぬくもりの宿ふる川を登録済みなので、別の宿にした。
    name: '定山渓鶴雅リゾートスパ 森の謌',
    catchcopy: '札幌の奥座敷・定山渓温泉で、森に包まれて過ごすリゾートスパ',
    jalanUrl: 'https://www.jalan.net/yad352535/',
    hasShuttle: true,
    shuttleInfo: '地下鉄南北線・真駒内駅から無料送迎バスあり（前日17時までに電話で要予約）',
    accessStation: '札幌駅から予約制バス「かっぱライナー」約60分',
  },
  'gen_北海_豊富温泉': {
    // 「川島旅館」は同名が多いので温泉地名を付けて登録する。
    name: '豊富温泉 川島旅館',
    catchcopy: '油分を含む珍しい「天然オイルバス」の湯に浸かる、豊富温泉の湯宿',
    jalanUrl: 'https://www.jalan.net/yad386526/',
    hasShuttle: true,
    shuttleInfo: '豊富駅から列車の到着・出発に合わせて送迎あり（3日前までに要予約）',
    accessStation: '豊富駅からバス約10分、豊富温泉下車徒歩1分',
  },
  'gen_青森_谷地温泉': {
    name: '谷地温泉',
    catchcopy: '開湯400年余、日本三秘湯のひとつ。足元から自噴する湯をかけ流す八甲田の宿',
    jalanUrl: 'https://www.jalan.net/yad344448/',
    hasShuttle: true,
    shuttleInfo: '無料送迎あり（7日前までに電話で要予約）。4/1〜11/18は青森駅・新青森駅、11/19〜3/31は八戸駅から',
    accessStation: '青森駅',
  },
  'gen_栃木_三斗小屋温泉': {
    name: '三斗小屋温泉 大黒屋',
    catchcopy: '江戸時代創業、ランプの灯る山の湯宿。登山口から歩いてしか行けない',
    otaListed: false,
    officialUrl: 'https://sandogoya-onsen.com/',
    bookingNote: '予約は電話のみ。4月上旬〜11月下旬の季節営業',
    accessStation: '峠の茶屋駐車場（登山口）から徒歩約2時間',
  },
  'gen_北海_ぬかびら温泉': {
    name: '糠平温泉 中村屋',
    catchcopy: '「源泉かけ流し100%宣言」のぬかびら源泉郷に建つ湯宿',
    otaListed: false,
    officialUrl: 'https://nukabira-nakamuraya.com/',
    bookingNote: '予約は電話・メール・公式サイトから',
    hasShuttle: false,
    shuttleInfo: '送迎なし（公式サイトに明記）',
    accessStation: '帯広駅から十勝バス糠平行き、糠平中央公園前下車',
  },
  'gen_群馬_川原湯温泉': {
    name: '川原湯温泉 山木館',
    catchcopy: '歴史と文化を紡ぐ古民家の湯宿。川原湯温泉の老舗',
    jalanUrl: 'https://www.jalan.net/yad389194/',
    hasShuttle: true,
    shuttleInfo: '川原湯温泉駅から無料送迎あり（予約時の備考欄で要連絡。到着15〜18時頃・出発10時頃）',
    accessStation: '川原湯温泉駅',
  },
  'gen_北海_洞爺湖温泉': {
    // 近くの destination「洞爺湖」はザ・ウィンザーホテル洞爺（高台）。こちらは温泉街の湖畔の宿。
    name: 'ザ レイクビュー TOYA 乃の風リゾート',
    catchcopy: '洞爺湖温泉の湖畔に建つ、湖を望むリゾートホテル',
    jalanUrl: 'https://www.jalan.net/yad384352/',
    hasShuttle: true,
    shuttleInfo: 'JR札幌駅北口・新千歳空港から送迎バスあり（有料。予約者は割引、札幌駅発は予約者無料。3日前までネット予約可）',
    accessStation: '洞爺駅からバス約20分',
  },
  'gen_北海_ウトロ温泉': {
    // 近くの destination「知床」には北こぶし知床を登録済みなので、別の宿にした。
    name: 'KIKI知床 ナチュラルリゾート',
    catchcopy: '世界自然遺産・知床のウトロ温泉、坂の上の高台に建つリゾートホテル',
    jalanUrl: 'https://www.jalan.net/yad365748/',
    hasShuttle: true,
    shuttleInfo: 'ウトロ温泉バスターミナルに着いてから連絡すると迎えに来てもらえる',
    accessStation: '知床斜里駅からバス、ウトロ温泉バスターミナル下車',
  },
};
