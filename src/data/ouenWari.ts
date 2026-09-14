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
  /** 申し込みが公式サイト経由に限られる場合の案内。宿カードの下に出す。 */
  applyNote?: string;
  /** 親制度とは別枠で触れておきたいこと（県独自キャンペーンの場合など） */
  aside?: { title: string; body: string };
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
    // 県独自のキャンペーンで、九州ふっこう応援割とは別物。すでに予約・販売が始まっている。
    // 公式サイトの末尾に「キャンペーンは終了しました」という文言があるが、これは
    // 未実装のモーダルのプレースホルダー（直後に「ダミーテキスト。」と続く）。
    // 生きている本文とお知らせ（2026/09/14「予約・販売を開始いたしました」）は実施中を示す。
    slug: 'kagoshima-oen',
    pref: '鹿児島県',
    prefShort: '鹿児島',
    name: 'かごしま観光応援割（南の宝箱 鹿児島）',
    parent: null,
    period: '2026年9月14日〜10月13日の宿泊分（10月14日チェックアウトまで）',
    booking: '2026年9月14日から受付中（予約・販売期間も同じ）',
    status: 'open',
    official: [
      { label: 'かごしま観光応援割 公式サイト', url: 'https://shukuhakuwari.pref.kagoshima.jp/' },
    ],
    note: '宿泊を伴わない日帰り旅行と、公費出張での宿泊は対象外です。'
      + '予約・販売開始日より前の申し込み分は対象になりません。予算の上限に達し次第、終了と案内されています。',
    applyNote: '申し込みは、公式サイトに掲載されている宿泊施設へ直接（公式サイトか電話）、'
      + 'または旅行会社・OTA経由で行う必要があります。公式サイトの「宿泊施設を探す」から対象施設をご確認ください。'
      + 'OTAのバナーは9月14日から順次公開と案内されています。',
    aside: {
      title: '九州ふっこう応援割（鹿児島県分）について',
      body: 'かごしま観光応援割は「九州ふっこう応援割」とは別に実施される鹿児島県独自のキャンペーンで、併用はできません。'
        + '九州ふっこう応援割の鹿児島県分は、詳細が決まり次第あらためて鹿児島県から案内されるとされており、'
        + '2026年9月14日時点では予約開始日・対象期間とも公表されていません。',
    },
  },
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
  // 鹿児島
  yakushima: 'https://www.sankarahotel-spa.com/',
  ibusuki: 'https://www.hakusuikan.co.jp/',
  'ibusuki-onsen': 'https://www.hakusuikan.co.jp/',   // 指宿温泉も宿は指宿白水館で同じ
  kirishima: 'https://www.kirishima-hotel.jp/',
  'yoron-island': 'https://www.pricia.co.jp/',
  sakurajima: 'https://rainbow-sakurajima.com/',
  'kagoshima-city': 'https://www.shiroyama-g.co.jp/',
  iso: 'https://www.shiroyama-g.co.jp/',              // 仙巌園も宿は城山ホテル鹿児島で同じ
};
