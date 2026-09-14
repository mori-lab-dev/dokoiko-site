/**
 * ouenWari.ts — 旅行支援・応援割の制度データ。
 *
 * すべて 2026-09-14 時点で各公式サイトを直接確認した内容。
 * 割引率・上限額といった数字は変わりやすいので、ここには持たせない。
 * 期間と予約開始のめど、そして公式へのリンクだけを置き、数字は公式で見てもらう。
 *
 * 掲載するのは「実施が公式に確定していて、予約開始か対象期間のどちらかが
 * 公表されているもの」だけ。準備中・調整中のものは載せない。
 */

export type Scheme = {
  slug: string;            // /{slug}/ で特設ページを作る
  pref: string;            // destinations.json の prefecture と同じ表記
  prefShort: string;       // 見出し用
  name: string;            // 制度の正式名称
  parent: string | null;   // 親制度（県独自ならnull）
  period: string;          // 対象期間
  booking: string;         // 予約開始
  status: 'open' | 'soon'; // open=予約開始済み / soon=開始日が公表済みでこれから
  official: { label: string; url: string }[];
  note?: string;
};

/** 親制度そのものの説明。各ページの冒頭で共通して使う。 */
export const PARENT = {
  name: '九州ふっこう応援割',
  by: '観光庁',
  start: '2026年10月1日の宿泊分から',
  targets: '九州7県（福岡・佐賀・長崎・熊本・大分・宮崎・鹿児島）',
  official: [
    { label: '観光庁「九州ふっこう応援割について」', url: 'https://www.mlit.go.jp/kankocho/topics04_00093.html' },
    { label: '九州観光機構「九州ふっこう応援割」特設サイト', url: 'https://fightkyushu.welcomekyushu.jp/' },
  ],
};

export const SCHEMES: Scheme[] = [
  {
    slug: 'kumamoto-oen',
    pref: '熊本県',
    prefShort: '熊本',
    name: '熊本ふっこう応援割',
    parent: '九州ふっこう応援割',
    period: '2026年10月1日〜12月25日の宿泊分',
    booking: '2026年9月15日 午前10時から',
    status: 'soon',
    official: [
      { label: '熊本県公式観光サイト「もっと、もーっと！くまもっと。」', url: 'https://kumamoto.guide/topics/detail/545' },
    ],
    note: 'すでに予約済みの旅行商品は対象外と案内されています。',
  },
  {
    slug: 'saga-oen',
    pref: '佐賀県',
    prefShort: '佐賀',
    name: '九州ふっこう応援割さがキャンペーン',
    parent: '九州ふっこう応援割',
    period: '2026年10月1日チェックイン〜12月26日チェックアウト分',
    booking: 'オンライン予約サイトは9月24日、旅行会社は10月2日から',
    status: 'soon',
    official: [
      { label: '佐賀県「九州ふっこう応援割さがキャンペーン」', url: 'https://www.pref.saga.lg.jp/kiji003121006/index.html' },
      { label: 'キャンペーン特設サイト', url: 'https://saga-ouen.jp/' },
    ],
  },
  {
    slug: 'nagasaki-oen',
    pref: '長崎県',
    prefShort: '長崎',
    name: '『九州ふっこう応援割』ながさきキャンペーン',
    parent: '九州ふっこう応援割',
    period: '2026年10月1日〜12月25日の宿泊分',
    booking: '9月第3週をめどに一部のオンライン予約サイトで先行開始予定',
    status: 'soon',
    official: [
      { label: '長崎県観光連盟「ながさき旅ネット」', url: 'https://www.nagasaki-tabinet.com/feature/ouenwari' },
    ],
    note: '旅行会社・宿泊施設での取り扱いは、準備でき次第の案内とされています。',
  },
  {
    slug: 'oita-oen',
    pref: '大分県',
    prefShort: '大分',
    name: '九州ふっこう応援割（大分県）',
    parent: '九州ふっこう応援割',
    period: '2026年10月1日〜12月25日の宿泊分',
    booking: '2026年9月下旬 予定',
    status: 'soon',
    official: [
      { label: '大分県「九州ふっこう応援割」', url: 'https://www.pref.oita.jp/soshiki/14180/kyushu-oita.html' },
    ],
    note: 'キャンペーンサイトは開設準備中です。',
  },
];

/** 今回は載せないもの。理由を残しておき、次に調べるときの手がかりにする。 */
export const NOT_LISTED = [
  { pref: '福岡県', why: '予約開始日・対象期間とも調整中。県公式にも案内がまだ出ていない' },
  { pref: '宮崎県', why: '予約開始日・対象期間とも未定。県観光協会は「準備中」' },
  { pref: '鹿児島県', why: '県独自の「かごしま観光応援割」は9月14日で受付終了。ふっこう割としての期間は未公表' },
  { pref: '沖縄県', why: '九州ふっこう応援割の対象外。県公式にも該当する制度の案内なし' },
];

/** 宿の公式サイト。到達を確認できたものだけを持つ（アフィリエイトではない）。 */
export const STAY_OFFICIAL: Record<string, string> = {
  'ureshino-onsen': 'https://www.taishoya.com/',
  arita: 'https://aritahuis.com/',
  furuyu: 'https://kakureisen.com/',
  aso: 'https://sozankyo.com/',
  amakusa: 'https://www.rikyu5.jp/',
  hitoyoshi: 'https://hitoyoshiryokan.com/',
  'tsuetate-onsen': 'https://www.hizenya.co.jp/',
  unzen2: 'https://www.unzenkankohotel.com/',
  hirado: 'https://www.kishotei.com/',
  shimabara: 'https://www.nampuro.com/',
  beppu: 'https://www.seikai.co.jp/',
  'yufuin-2': 'https://tamanoyu.co.jp/',
  yufuin: 'https://www.kamenoi-bessou.jp/index.php/topic/home_ja',
  taketa: 'https://lamune-onsen.co.jp/',
  hita: 'https://kizantei.com/',
};
