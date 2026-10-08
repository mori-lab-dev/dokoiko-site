// featured_stay 拡充バッチ8・東日本（2026-10-08 公式サイトで実在・営業を確認）
// 対象: 北海道・東北・関東・甲信越・北陸・東海
//
// 採用基準:
//   ・宿の公式サイトを開き、実在と営業中であることを確認した
//     （公式の更新が古い宿は、じゃらん/楽天の 2026年10月の空室カレンダーが生きていることで補った）
//   ・宿の住所を国土地理院／OSM でジオコーディングし、紐づける destination から
//     8km 以内であることを確認した（同名異所の防止）
//   ・既に別の destination の featured_stay になっている宿は使わない
//     （近くに別の宿を持つ destination でも、宿が違えば採用。層雲峡は朝陽亭、嶽/温泉地系は未設定）
//   ・送迎・アクセスは公式に書かれているものだけ記載。書かれていなければ項目ごと省略した
//
// jalanUrl は記録用（画面には出ない。safeJalanUrl が宿名検索に置き換える）。
// 新規の rakutenUrl は足さない。
export default {
  'gen_北海_朝里川温泉': {
    name: '小樽朝里クラッセホテル',
    catchcopy: '朝里川温泉の森に建つ、キャンドルをテーマにしたリゾート。岩造りの露天風呂がある',
    jalanUrl: 'https://www.jalan.net/yad336996/',
  },
  'gen_北海_北湯沢温泉': {
    name: '緑の風リゾート きたゆざわ',
    catchcopy: '北湯沢温泉の森にある、150坪の露天風呂と約40の湯船をもつリゾート',
    jalanUrl: 'https://www.jalan.net/yad322984/',
    hasShuttle: true,
    shuttleInfo: '札幌駅（宿泊予約者は無料）・新千歳空港（宿泊予約者1,000円）から送迎バスあり。満席になり次第受付終了のため要予約',
    accessStation: '伊達紋別駅から道南バスまたはタクシー',
  },
  'gen_北海_天人峡温泉': {
    name: '天人峡温泉 御やど しきしま荘',
    catchcopy: '大雪山国立公園の天人峡温泉、最奥に建つ全18室の宿。源泉かけ流し100%',
    jalanUrl: 'https://www.jalan.net/yad342210/',
    hasShuttle: true,
    shuttleInfo: 'バス利用時のみ送迎あり（要予約）。旭川駅前から「いで湯号」で約90分、「旭岳源水公園前」下車後',
    accessStation: '旭川駅前からバス「いで湯号」約90分',
  },
  'gen_北海_層雲峡温泉': {
    // 同じ層雲峡の destination には朝陽亭を登録済み。こちらは別の宿。
    // 2026-11-04〜06 は全館の電気設備点検で休館（公式お知らせ）。
    name: '層雲閣 MOUNTAIN RESORT 1923',
    catchcopy: '大正12年（1923年）創業。層雲峡温泉に建つ、旧・層雲閣グランドホテル',
    hasShuttle: true,
    shuttleInfo: '公式サイトに送迎バスの案内あり（詳細は公式サイトで確認）',
  },
  'gen_北海_長万部温泉': {
    name: '長万部温泉ホテル',
    catchcopy: '長万部駅から徒歩16分ほどの温泉ホテル。日帰り入浴も年中受け付ける',
    hasShuttle: true,
    shuttleInfo: '連絡すれば送迎サービスあり（要相談）',
    accessStation: '長万部駅から徒歩16分ほど',
  },
  'gen_青森_城ヶ倉温泉': {
    name: '八甲田城ヶ倉温泉 ホテル城ヶ倉',
    catchcopy: '八甲田のブナ原生林に囲まれた北欧風のリゾートホテル。露天風呂は源泉かけ流し',
    jalanUrl: 'https://www.jalan.net/yad393575/',
    hasShuttle: true,
    shuttleInfo: '青森駅から無料送迎あり',
    accessStation: '新青森駅から車で約50分',
  },
  'gen_青森_嶽温泉': {
    name: '嶽温泉 小島旅館',
    catchcopy: '岩木山麓の湯宿。白く濁った嶽温泉を100%源泉かけ流しで楽しめる',
  },
  'niche_秋田_1': {
    name: '湯瀬ホテル',
    catchcopy: '川の瀬から湯が湧いたという由来の湯瀬温泉。渓流を聴く露天風呂のある宿',
    jalanUrl: 'https://www.jalan.net/yad319164/',
  },
  'gen_栃木_日光湯元温泉': {
    name: '湯元板屋',
    catchcopy: '奥日光・湯元温泉にある源泉かけ流しの旅館',
    jalanUrl: 'https://www.jalan.net/yad348921/',
  },
  'gen_群馬_老神温泉': {
    name: '吟松亭あわしま',
    catchcopy: '老神温泉の高台に建つ。3本の源泉をかけ流し、客室から片品渓谷の山々を望む',
    jalanUrl: 'https://www.jalan.net/yad308616/',
    accessStation: '沼田ICから車で約20分',
  },
  'niche_長野_1': {
    name: '湯元ホテル阿智川',
    catchcopy: '昼神温泉の宿。pH9.73の源泉をひく洞窟風呂や奇岩庭園の露天風呂がある',
    jalanUrl: 'https://www.jalan.net/yad342120/',
    hasShuttle: true,
    shuttleInfo: '無料送迎あり（予約制）。飯田駅などから運行。時刻は公式サイトのPDFで案内',
    accessStation: '飯田駅から送迎バス',
  },
  'niche_新潟_1': {
    name: '椿の宿 吉田や',
    catchcopy: '創業1907年。瀬波温泉の木造3階建て、全15室の純和風旅館',
    jalanUrl: 'https://www.jalan.net/yad329792/',
  },
  'nokogiriyama': {
    name: 'さざね',
    catchcopy: '房総・鋸南町の海辺に建つ、全12室に露天風呂を備えたオーシャンビューの宿',
    hasShuttle: true,
    shuttleInfo: '安房勝山駅から14:30以降に送迎可（要事前予約）',
    accessStation: '安房勝山駅から徒歩10分',
  },
  'hiraizumi': {
    name: '平泉ホテル武蔵坊',
    catchcopy: '世界遺産・平泉の町なかにある温泉ホテル。世界文化遺産の5つを歩いて巡れる',
    jalanUrl: 'https://www.jalan.net/yad319505/',
  },
  'chokai-san': {
    // 鳥海山荘の座標は destination から 7.5km（OSM の施設名検索）。
    name: '湯の台温泉 鳥海山荘',
    catchcopy: '鳥海山の山麓に建つ湯の台温泉の宿。星空観賞のイベントを開く',
    jalanUrl: 'https://www.jalan.net/yad322208/',
  },
};
