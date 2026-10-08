// featured_stay 拡充バッチ9・東日本 第2ラウンド（2026-10-08 公式サイトで実在・営業を確認）
// 対象: 北海道・東北・関東・甲信越・北陸・東海
//
// 採用基準:
//   ・宿の公式サイトを開き、実在と営業中であることを確認した
//     （公式の更新が古い宿は、じゃらんの宿泊プランページに料金付きプランが生きていることで補った）
//   ・宿の住所を国土地理院／OSM でジオコーディングし、紐づける destination から
//     8km 以内であることを確認した（同名異所の防止）
//   ・既に別の destination の featured_stay になっている宿・同じ温泉地の宿は使わない
//     （白老の界 ポロト・恐山の吉祥閣・五箇山・下風呂・秋山郷は既存のため除外）
//   ・destination の座標がずれている地域は使わない（篠島・飛島・龍泉洞）
//   ・送迎・アクセスは公式に書かれているものだけ記載。書かれていなければ項目ごと省略した
//
// jalanUrl は記録用（画面には出ない。safeJalanUrl が宿名検索に置き換える）。
// 新規の rakutenUrl は足さない。
export default {
  'gen_北海_網走湖畔温泉': {
    name: 'ホテル網走湖荘',
    catchcopy: '網走湖畔に建つホテル。湖を望むテラス付き客室と、4つの浴槽がある大浴場「火口原」',
    jalanUrl: 'https://www.jalan.net/yad347994/',
  },
  'gen_北海_鹿部温泉': {
    name: '温泉旅館 鹿の湯',
    catchcopy: '大正時代から続く鹿部温泉の老舗旅館。3本の源泉をかけ流す、和室10室の宿',
    accessStation: '鹿部駅から函館バス「鹿の湯前」下車',
  },
  'shoji-lake': {
    name: '精進レークホテル',
    catchcopy: '精進湖畔に建ち、全客室から富士山と湖を望むホテル。露天風呂とサウナがある',
    jalanUrl: 'https://www.jalan.net/yad382611/',
  },
  'gassan': {
    // 月山志津温泉。GSI は町名レベルで7.7km、志津集落は destination から約3km。
    name: '月山志津温泉 旅館仙台屋',
    catchcopy: '約400年前から月山参詣の行者宿を営んできた、月山志津温泉の旅館',
    jalanUrl: 'https://www.jalan.net/yad311635/',
  },
  'oze': {
    // 季節営業。2026年の営業期間は 4/28〜10/24（公式）。
    name: '長蔵小屋',
    catchcopy: '明治23年創業の尾瀬沼畔の山小屋。大清水から徒歩約3時間、沼山峠から約1時間',
    otaListed: false,
    officialUrl: 'https://chozogoya.com/',
    bookingNote: '営業は4月下旬から10月下旬まで（2026年は4/28〜10/24）。予約は公式サイトで確認',
  },
  'gen_群馬_猿ヶ京温泉': {
    name: '旅籠屋丸一 時を結ぶ 和美心の宿',
    catchcopy: '江戸時代から続く猿ヶ京温泉の旅館。自家源泉100%かけ流しで、客室は全13タイプ',
    jalanUrl: 'https://www.jalan.net/yad386416/',
  },
  'gen_群馬_片品温泉': {
    name: '旅館つちいで',
    catchcopy: '尾瀬の玄関口、片品村の家族経営の旅館。天然温泉と、ジビエや川魚の料理',
    jalanUrl: 'https://www.jalan.net/yad341357/',
  },
  'niche_富山_2': {
    // 利賀村大牧。GSI は町名レベルで destination から5.5km。
    name: '大牧温泉観光旅館',
    catchcopy: '庄川峡の山中に建つ一軒宿。小牧港から遊覧船でしか行けない',
    accessStation: '小牧港から庄川遊覧船で約30分（運航ダイヤは公式サイトで確認）',
  },
  'manazuru': {
    name: 'グルメと天然温泉の宿 ペンションSHIOSAI',
    catchcopy: '真鶴半島の高台に建つペンション。海を一望する大理石の温泉風呂は貸切にもできる',
    jalanUrl: 'https://www.jalan.net/yad319181/',
  },
  'norikura': {
    // 乗鞍高原。同じ番地帯の施設（OSM）で destination から5.6km。
    name: '乗鞍高原温泉 旅館 仙山乗鞍',
    catchcopy: '乗鞍高原の旅館。乳白色の湯をかけ流す貸切露天風呂があり、客室は9室',
    jalanUrl: 'https://www.jalan.net/yad311277/',
  },
  'mashiko': {
    name: '益子舘 里山リゾートホテル',
    catchcopy: '益子の里山に建つ温泉宿。滝を眺める露天風呂があり、館内に益子焼を飾る',
    jalanUrl: 'https://www.jalan.net/yad314110/',
  },
  'tateyama-chiba': {
    name: '南房総館山温泉 お宿やまもと',
    catchcopy: '南房総の海の幸の料理を出す宿。館内にオールドノリタケを展示する',
    jalanUrl: 'https://www.jalan.net/yad311375/',
  },
  'aizu-bandaisan': {
    name: '猪苗代 磐梯山麓温泉 静楓亭',
    catchcopy: '磐梯山麓の宿。全客室に源泉かけ流しの個室露天風呂が付く',
    jalanUrl: 'https://www.jalan.net/yad324402/',
  },
  // 'kirigamine'（ヒュッテ霧ヶ峰）は見送り: 公式が住所だけの http ページで、営業確認がOTAの掲載頼みのため（2026-10-08・確認が取れた時点で追加する）
};
