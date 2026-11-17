/**
 * 参画宿泊施設一覧の検索（福岡 / 依存ライブラリなし）
 *
 * CSV を fetch で読み込み、キーワード・ジャンル・エリアの絞り込みと
 * ページ送りをすべてブラウザ側で行う。サーバー側の処理は不要。
 *
 * 元にしたのは _sample/search_js/files.zip の stay-search.js（4サイト共通版）。
 * 福岡のデザインカンプに合わせて、次の点を変えている。
 *   ・日付の表記を「2026年○月○日現在」にした（元は「更新日：〜」）
 *   ・ページ送りを「< 1 2 … 9 … 49 50 >」の形にした（SP は項目数を減らす）
 *   ・検索後のスクロール位置を、このサイトのヘッダーに合わせた
 *
 * ページ側では CSV の場所だけ指定する:
 *
 *   <script>
 *     window.SS_CONFIG = { sitePrefix: 'fukuoka', csvDir: '/csv/' };
 *   </script>
 *   <script src="../assets/js/stay-search.js"></script>
 *
 *   → /csv/fukuoka_stay_search.csv を読み込む
 */
(function () {
  'use strict';

  // ======================================================================
  // 既定の設定
  // 優先順: window.SS_STAY_CONFIG > window.SS_CONFIG（共通） > 以下の既定値
  // ======================================================================
  const DEFAULTS = {
    sitePrefix: '',        // 'fukuoka' など。CSV のファイル名の頭に付く
    csvDir: '/csv/',       // CSV を置くディレクトリ
    csvUrl: '',            // 指定した場合は sitePrefix / csvDir より優先
    // カードの電話・ホームページのアイコン画像（icon-tel.png / icon-pc.png）の場所。
    // ページ（stay/・agt/）から見た相対パス。2倍の大きさで書き出してあり、CSS で半分に表示する
    iconDir: '../assets/img/stay/',

    enablePagination: true, // true: ページ送り / false: 全件表示
    perPage: 10,           // 1ページあたりの件数
    searchDelay: 300,      // 検索中の表示を見せるための待ち時間(ms)。0 で即時
    scrollOffset: 20,      // 検索後に結果までスクロールするときの上の余白(px)
    mobileBreakpoint: 768, // これ未満を SP として扱う（CSS の 767px と合わせる）
    normalizeKana: true,   // ひらがな/カタカナ・全角/半角を区別しない検索
    areaMatchByCity: true, // エリアの絞り込みを「市郡町」列で判定する

    buildFilters: true,    // ジャンル・エリアのチェックボックスを CSV から作る

    // エリアの表示順。指定した順で並び、未指定のものは CSV の出現順で後ろに続く
    areaOrder: [],
    // エリアの中の市郡町の表示順。指定した順で並び、未指定のものは CSV の出現順で後ろに続く
    // （エリアをまたいで1つの配列で持てばよい。CSV に無い市郡町は出ない＝自動抽出のまま）
    cityOrder: [],
    // エリア名の表記ゆれの吸収。例: { '南薩エリア': '南薩摩エリア' }
    areaAliases: {},
    // 市郡町の表記ゆれの吸収。例: { '奄美市笠利町': '奄美市' }
    cityAliases: {},
    // エリアと市郡町を明示指定する場合（施設が0件の市町村も表示したいとき）
    //   例: [{ area: '福岡市', cities: ['中央区', '博多区', ...] }, ...]
    areaGroups: [],

    // PC ではエリアのアコーディオンを開いた状態で表示する
    areaOpenOnDesktop: true,

    // --- 販売方法（2026-10-06 追加）---------------------------------------
    // CSV に販売方法の列が無いので、電話番号・ホームページの有無から決める。
    //   電話番号の列が空でない → 「電話」で販売
    //   ホームページの列が空でない → 「インターネット」で販売
    // （両方ある施設は両方に該当する。CSV に列が増えたら buildData の該当箇所を直す）
    salesByPhone: '電話',
    salesByWebsite: 'インターネット',

    // --- 完売（2026-10-06 追加）-------------------------------------------
    // 「お知らせ」列にこの文字が含まれていたら完売として扱い、
    // 一覧の上のスイッチで非表示にできるようにする
    soldOutKeyword: '完売'
  };

  const CONFIG = Object.assign({}, DEFAULTS, window.SS_CONFIG || {}, window.SS_STAY_CONFIG || {});

  /**
   * 画面上端に貼り付いているヘッダーの高さ（PC 75px ／ SP 60px）
   * ヘッダーが sticky のときだけ返す。結果までスクロールするときや、
   * 絞り込みパネルの高さを計算するときに、ヘッダーに隠れるぶんを差し引くために使う
   */
  function getStickyHeaderHeight() {
    const header = document.querySelector('.l-header');
    if (!header || window.getComputedStyle(header).position !== 'sticky') return 0;
    return header.offsetHeight;
  }

  /**
   * 読み込む CSV の URL を決める
   * csvUrl があればそれを使い、なければ csvDir + sitePrefix から組み立てる
   *   sitePrefix: 'fukuoka' → /csv/fukuoka_stay_search.csv
   */
  function resolveCsvUrl() {
    if (CONFIG.csvUrl) return CONFIG.csvUrl;
    const dir = String(CONFIG.csvDir || '/').replace(/\/*$/, '/');
    const prefix = CONFIG.sitePrefix ? CONFIG.sitePrefix + '_' : '';
    return dir + prefix + 'stay_search.csv';
  }

  // CSV の列。見出し名で探し、見つからなければ index（列の位置）を使う。
  // 見出しは「改行より前・前後の空白を除いた部分」で照合するので、
  // 「電話番号\n(携帯番号は再度確認を！！)」のような注記付きでも当たる。
  // headers は候補を順に試す（2026-10-09 の新しい CSV と、それ以前の CSV の両方に対応）。
  //
  // 2026-10-09 の CSV（11列）の用途は先方指定どおり：
  //   A No / B 施設番号      … 管理用。使わない
  //   C 施設名 / D 住所      … 掲載
  //   E 電話番号 / F HP      … 10/10 時点は非掲載（カードの連絡先の行はコメントアウト中）
  //   G 宿泊形態             … 掲載（ジャンルのバッジ・絞り込み）
  //   H 市町村（自動計算）   … 非掲載。エリアの絞り込みにだけ使う
  //   I エリア（自動計算）   … 掲載（エリアのバッジ）
  //   J 発売開始日           … バッジ「10/14(水)販売開始」（2026-10-13 から表示。agt ページと同じ形）
  //   K お知らせ             … 10/10 時点は非掲載（完売フラグ用）
  /* 列の対応（見出し名で探し、見つからなければ index を使う）
     大分の CSV は支給エクセル「作業用_oita_stay_search_〜.xlsx」の A〜I 列をそのまま貼る前提。
       A 宿泊施設名 / B 宿泊施設名（半角カナ）/ C 所在地_漢字 / D 電話番号 / E _ホームページ /
       F 形態 / G 市町村 / H エリア / I お知らせ
     見出し名の候補には他県の CSV の名前も残してあるので、別の形式が来ても見出しさえ合えば動く。
     ※ 発売開始日はエクセルに列が無い。index を -1 にして「無ければ空」にしている
       （ここを数字にすると、列数の違う CSV で別の列を拾ってしまう） */
  /* 列の対応（見出し名で探し、見つからなければ index を使う）
     大分の CSV は支給エクセルの A〜J 列をそのまま貼る前提（2026-10-15 に施設管理番号が先頭へ移動）。
       A 施設管理番号 / B 宿泊施設名 / C 宿泊施設名（半角カナ）/ D 所在地_漢字 / E 電話番号 /
       F _ホームページ / G 形態 / H 市町村 / I エリア / J お知らせ
     見出し名の候補には他県の CSV の名前も残してあるので、別の形式が来ても見出しさえ合えば動く。
     ※ 発売開始日はエクセルに列が無いので index を -1（＝無ければ空）にしている */
  const COLUMNS = {
    facilityId:{ headers: ['施設管理番号', '施設番号'],                                        index: 0 },
    name:     { headers: ['施設名', '宿泊施設名', '個人_自由項目1_宿泊施設名'],               index: 1 },
    nameKana: { headers: ['宿泊施設名（半角カナ）', '個人_自由項目2_宿泊施設名（半角カナ）'], index: 2 },
    address:  { headers: ['住所', '所在地_漢字', '個人_所在地_漢字'],                         index: 3 },
    phone:    { headers: ['電話番号', '個人_電話番号'],                                       index: 4 },
    website:  { headers: ['HP', '_ホームページ', 'ホームページ', '個人_自由項目3_ホームページ'], index: 5 },
    genre:    { headers: ['宿泊形態', '形態', '個人_自由項目9_形態をお選びください_1'],        index: 6 },
    city:     { headers: ['市町村', '市郡町　（自動計算）', '市郡町'],                         index: 7 },
    area:     { headers: ['エリア', 'エリア　（自動計算）'],                                  index: 8 },
    notice:   { headers: ['お知らせ'],                                                        index: 9 },
    saleStart:{ headers: ['発売開始日'],                                                      index: -1 }
  };

  // 形態の長い表記を、前方一致で短い名前にそろえる（この順でチェックボックスが並ぶ）
  const GENRE_MAPPING = [
    { prefix: 'ホテル',                   normalized: 'ホテル' },
    { prefix: '旅館',                     normalized: '旅館' },
    { prefix: '民宿・ペンション',         normalized: '民宿・ペンション' },
    { prefix: 'コテージ・ロッジ・一棟貸', normalized: 'コテージ・ロッジ・一棟貸' },
    { prefix: 'その他簡易宿所',           normalized: 'その他簡易宿所' },
    // CSV に「住宅宿泊事業法に規定する届出をしている住宅」と
    // 「住宅宿泊業法に規定する届出を出している住宅」の2通りの書き方があるので、
    // 「住宅宿泊」までの前方一致で両方とも「民泊」にまとめる（2026-10-02）
    { prefix: '住宅宿泊',                 normalized: '民泊' }
  ];

  const SELECTORS = {
    form: '#stay-search-form',
    genreFilter: '#stay-filter-genre',
    areaFilter: '#stay-filter-area',
    results: '#stay-results',
    pagination: '#stay-pagination',
    loading: '#loading-indicator',
    countWrap: '#search-result-info',
    count: '#result-count',
    updated: '#update-date',
    range: '#stay-range',                    // 日付の下に出す「1件 - 10件（全822件）」
    filterToggle: '#mobile-filter-toggle',
    filterContent: '#filter-content',
    // 完売した施設を隠すスイッチ（フォームの外・一覧の上にある）
    soldOutToggle: '#hide-soldout'
  };

  // ======================================================================
  // ユーティリティ
  // ======================================================================

  /** HTML に入れる前のエスケープ（CSV は外部入力なので必ず通す） */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** リンク先は http(s) のみ許可する。それ以外（javascript: など）は空にする */
  function safeUrl(url) {
    const value = String(url || '').trim();
    if (!value) return '';
    return /^https?:\/\//i.test(value) ? value : '';
  }

  /** 検索用に文字をそろえる: NFKC（全角/半角の統一）→ ひらがなをカタカナへ → 小文字化 */
  function normalize(text) {
    let str = String(text || '');
    if (!CONFIG.normalizeKana) return str.toLowerCase().trim();
    if (typeof str.normalize === 'function') str = str.normalize('NFKC');
    str = str.replace(/[ぁ-ゖ]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) + 0x60);
    });
    return str.toLowerCase().trim();
  }

  /**
   * CSV を行・列の配列にする
   * 1文字ずつ読むので、"" で囲まれたセル内の改行・カンマ・"" エスケープにも対応できる。
   * 先頭の BOM と、中身が空の行は取り除く
   */
  function parseCsvRows(text) {
    const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      const next = src[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') { field += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { field += ch; }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && next === '\n') i++;
        row.push(field); field = '';
        if (row.some(function (f) { return f.trim() !== ''; })) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    row.push(field);
    if (row.some(function (f) { return f.trim() !== ''; })) rows.push(row);
    return rows;
  }

  /** 見出し行から、各項目が何列目にあるかを決める */
  function resolveColumns(headerRow) {
    // 見出しは改行より前だけを見る（「電話番号\n(携帯番号は…)」のような注記付きに対応）
    const headers = (headerRow || []).map(function (h) {
      return String(h || '').split('\n')[0].trim();
    });
    const resolved = {};
    Object.keys(COLUMNS).forEach(function (key) {
      const cand = COLUMNS[key].headers || [COLUMNS[key].header];
      let found = -1;
      for (let i = 0; i < cand.length && found < 0; i++) found = headers.indexOf(cand[i]);
      resolved[key] = found >= 0 ? found : COLUMNS[key].index;
    });
    return resolved;
  }

  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  /**
   * 販売開始日のバッジ用に「2026/10/14」→「10/14(水)販売開始」の形にする（2026-10-13 追加）
   * agt ページ（agency-list.js）と同じ作り。日付として読めない値・空は空文字を返す
   */
  function formatSaleStart(value) {
    const v = String(value || '').trim();
    const m = v.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (!m) return '';
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    const date = new Date(y, mo - 1, d);
    // 「2026/2/30」のような実在しない日付はバッジを出さない
    if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return '';
    return mo + '/' + d + '(' + WEEKDAYS[date.getDay()] + ')販売開始';
  }

  function normalizeGenre(genre) {
    if (!genre) return '';
    for (let i = 0; i < GENRE_MAPPING.length; i++) {
      if (genre.indexOf(GENRE_MAPPING[i].prefix) === 0) return GENRE_MAPPING[i].normalized;
    }
    return genre;
  }

  function normalizeArea(area) {
    if (!area) return '';
    return CONFIG.areaAliases[area] || area;
  }

  function normalizeCity(city) {
    if (!city) return '';
    return CONFIG.cityAliases[city] || city;
  }

  /** CSV の行を、表示・検索に使うオブジェクトの配列にする（施設名が空の行は捨てる） */
  function buildData(rows) {
    if (!rows.length) return [];
    const col = resolveColumns(rows[0]);
    const data = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const get = function (key) {
        const idx = col[key];
        return (idx != null && r[idx] != null) ? String(r[idx]).trim() : '';
      };

      const name = get('name');
      if (!name) continue;

      const item = {
        name: name,
        facilityId: get('facilityId'),
        nameKana: get('nameKana'),
        genre: normalizeGenre(get('genre')),
        city: normalizeCity(get('city')),
        area: normalizeArea(get('area')),
        address: get('address'),
        phone: get('phone'),
        website: safeUrl(get('website')),
        saleStart: formatSaleStart(get('saleStart')),
        notice: get('notice')
      };

      // 販売方法（CSV に列が無いので、電話番号とホームページの有無から決める）
      // ※ ホームページは safeUrl を通したあと（＝ http(s) で始まる正しい URL）の値で見る。
      //   生の値で見ると、メールアドレスや綴り誤りの行まで「インターネット」に数えてしまい、
      //   カードにはホームページが出ないのに絞り込みでは出てくる、というずれが起きるため（2026-10-06）
      item.sales = [];
      if (item.phone) item.sales.push(CONFIG.salesByPhone);
      if (item.website) item.sales.push(CONFIG.salesByWebsite);

      // 完売かどうか（「お知らせ」列に「完売」が含まれるか）
      item.soldOut = !!CONFIG.soldOutKeyword &&
        item.notice.indexOf(CONFIG.soldOutKeyword) !== -1;

      // キーワード検索の対象（施設名・カナ・住所）をまとめて正規化しておく
      item._search = normalize(item.name + ' ' + item.nameKana + ' ' + item.address);
      data.push(item);
    }
    return data;
  }

  /**
   * キーワード AND ジャンル（いずれか） AND 販売方法（いずれか） AND エリア（いずれか）で絞り込む
   * hideSoldOut が true のときは、完売の施設を一覧から外す
   */
  function filterStays(data, keyword, genres, sales, areas, hideSoldOut) {
    const kw = keyword ? normalize(keyword) : '';
    return data.filter(function (stay) {
      if (hideSoldOut && stay.soldOut) return false;
      if (kw && stay._search.indexOf(kw) === -1) return false;
      if (genres.length && genres.indexOf(stay.genre) === -1) return false;
      // 販売方法は「どれかに当てはまればよい」（ジャンル・エリアと同じ）
      if (sales.length) {
        const matchedSales = sales.some(function (m) { return stay.sales.indexOf(m) !== -1; });
        if (!matchedSales) return false;
      }
      if (areas.length) {
        const matched = areas.some(function (city) {
          // 市郡町が「奄美市笠利町」のような詳しい表記でも拾えるよう前方一致まで許す。
          // 市郡町列が空の行は、住所に含まれるかで判定する
          if (CONFIG.areaMatchByCity && stay.city) {
            return stay.city === city || stay.city.indexOf(city) === 0;
          }
          return stay.address.indexOf(city) !== -1;
        });
        if (!matched) return false;
      }
      return true;
    });
  }

  /** デザインどおり「2026年9月14日現在」の形にする */
  function formatDate(date) {
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日現在';
  }

  // ======================================================================
  // 絞り込みUIの自動生成
  // ======================================================================

  function checkboxHtml(name, value) {
    return '' +
      '<label class="ss-check">' +
        '<input type="checkbox" class="ss-check__input" name="' + name + '" value="' + esc(value) + '">' +
        '<span class="ss-check__label">' + esc(value) + '</span>' +
      '</label>';
  }

  /** データに実在するジャンルだけを、GENRE_MAPPING の順で並べる */
  function buildGenreFilter(container, data) {
    const present = {};
    data.forEach(function (d) { if (d.genre) present[d.genre] = true; });

    const ordered = GENRE_MAPPING
      .map(function (m) { return m.normalized; })
      .filter(function (g, i, arr) { return present[g] && arr.indexOf(g) === i; });

    // マッピングに無い値が来ても取りこぼさないよう、後ろに足す
    Object.keys(present).forEach(function (g) {
      if (ordered.indexOf(g) === -1) ordered.push(g);
    });

    container.innerHTML = '<div class="ss-checks">' +
      ordered.map(function (g) { return checkboxHtml('genre', g); }).join('') +
      '</div>';
  }

  /**
   * 「エリア（自動計算）」でグループに分け、「市郡町」をチェックボックスにする
   * グループの並びは CONFIG.areaOrder、グループの中の市郡町は CONFIG.cityOrder で指定できる
   * （どちらも指定が無ければ CSV の出現順）
   */
  function buildAreaFilter(container, data) {
    let groups = [];
    const index = {};

    if (CONFIG.areaGroups && CONFIG.areaGroups.length) {
      // 明示指定があれば CSV からは集めない
      groups = CONFIG.areaGroups.map(function (g) {
        return { area: g.area, cities: (g.cities || []).slice() };
      });
    } else {
      data.forEach(function (d) {
        if (!d.area || !d.city) return;
        if (!(d.area in index)) {
          index[d.area] = groups.length;
          groups.push({ area: d.area, cities: [] });
        }
        const group = groups[index[d.area]];
        if (group.cities.indexOf(d.city) === -1) group.cities.push(d.city);
      });

      if (CONFIG.areaOrder.length) {
        groups.sort(function (a, b) {
          let ia = CONFIG.areaOrder.indexOf(a.area);
          let ib = CONFIG.areaOrder.indexOf(b.area);
          if (ia === -1) ia = Number.MAX_SAFE_INTEGER;
          if (ib === -1) ib = Number.MAX_SAFE_INTEGER;
          return ia - ib;
        });
      }

      // グループの中の市郡町も指定順に並べ替える（指定に無いものは CSV の出現順で後ろ）
      if (CONFIG.cityOrder.length) {
        groups.forEach(function (group) {
          group.cities.sort(function (a, b) {
            let ia = CONFIG.cityOrder.indexOf(a);
            let ib = CONFIG.cityOrder.indexOf(b);
            if (ia === -1) ia = Number.MAX_SAFE_INTEGER;
            if (ib === -1) ib = Number.MAX_SAFE_INTEGER;
            return ia - ib;
          });
        });
      }
    }

    // PC は最初から開いておく（SP はパネル自体が長くなりすぎるので閉じておく）
    const isDesktop = window.innerWidth >= CONFIG.mobileBreakpoint;
    const openAttr = (CONFIG.areaOpenOnDesktop && isDesktop) ? ' open' : '';

    container.innerHTML = '<div class="ss-areas">' + groups.map(function (group) {
      return '' +
        '<details class="ss-area"' + openAttr + '>' +
          '<summary class="ss-area__summary">' +
            '<span>' + esc(group.area) + '</span>' +
            '<span class="ss-area__icon" aria-hidden="true"></span>' +
          '</summary>' +
          '<div class="ss-area__body ss-checks">' +
            group.cities.map(function (city) { return checkboxHtml('area', city); }).join('') +
          '</div>' +
        '</details>';
    }).join('') + '</div>';
  }

  // ======================================================================
  // カード描画
  // ======================================================================

  function phoneLink(phone) {
    const tel = phone.replace(/[^0-9]/g, '');
    if (!tel) return '';
    return '' +
      '<a href="tel:' + esc(tel) + '" class="ss-card__link ss-card__link--tel">' +
        '<img class="ss-card__icon ss-card__icon--tel" src="' + esc(CONFIG.iconDir) + 'icon-tel.png" width="29" height="26" alt="" aria-hidden="true">' +
        '<span>' + esc(phone) + '</span>' +
      '</a>';
  }

  function websiteLink(url) {
    if (!url) return '';
    return '' +
      '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" class="ss-card__link ss-card__link--web">' +
        // ノートPC のアイコン（デザイナー支給の画像）
        '<img class="ss-card__icon ss-card__icon--pc" src="' + esc(CONFIG.iconDir) + 'icon-pc.png" width="36" height="23" alt="" aria-hidden="true">' +
        '<span class="ss-card__web-text">ホームページ</span>' +
      '</a>';
  }

  /* カードの中身（2026-10-15 の指定）
       バッジ … お知らせ（完売）→ 販売開始日 → 形態 → 市町村
       名前の下 … 施設管理番号だけ（見出しは付けない）
     ※ 電話番号・ホームページ・住所は、値があっても出さない。
       データ自体は読み込んでいるので、出すときは下のコメントを戻せばよい
     ※ 市町村のバッジは、以前はエリア（stay.area）を出していた。
       エリアは「エリアで探す」の絞り込みで使うので、データとしては残している */
  function createCard(stay, index) {
    return '' +
      '<article class="ss-card" style="animation-delay: ' + (index * 50) + 'ms;">' +
        '<div class="ss-card__badges">' +
          // 完売は一番伝えたいことなので先頭。バッジを黒にしてカードをグレーに落とす
          (stay.notice ? '<span class="ss-badge ss-badge--notice' + (stay.soldOut ? ' ss-badge--notice-soldout' : '') + '">' + esc(stay.notice) + '</span>' : '') +
          (stay.saleStart ? '<span class="ss-badge ss-badge--sale">' + esc(stay.saleStart) + '</span>' : '') +
          (stay.genre ? '<span class="ss-badge ss-badge--genre">' + esc(stay.genre) + '</span>' : '') +
          (stay.city ? '<span class="ss-badge ss-badge--area">' + esc(stay.city) + '</span>' : '') +
          // 施設管理番号はバッジの行の右端に小さなグレー文字で出す（番号だけ。見出しは付けない／2026-10-15）
          (stay.facilityId ? '<span class="ss-card__facility-id">' + esc(stay.facilityId) + '</span>' : '') +
        '</div>' +
        '<h3 class="ss-card__name">' + esc(stay.name) + '</h3>' +
        /* 住所・電話番号・ホームページは非表示（2026-10-15）。出すときはこの囲みを外す
        '<p class="ss-card__address">' + esc(stay.address) + '</p>' +
        (contact ? '<div class="ss-card__contact">' + contact + '</div>' : '') +
        */
      '</article>';
  }

  /**
   * ページ番号の並びを作る（'...' は省略記号）
   *
   * PC（デザインどおり最大12項目）
   *   先頭付近 : 1 2 3 4 5 6 7 8 9 … 49 50
   *   末尾付近 : 1 2 … 42 43 44 45 46 47 48 49 50
   *   中間     : 1 2 … 23 24 25 26 27 … 49 50
   * SP（横幅に収まるよう最大7項目）
   *   先頭付近 : 1 2 3 4 5 … 50 ／ 末尾付近 : 1 … 46 47 48 49 50 ／ 中間 : 1 … 24 25 26 … 50
   */
  function generatePageNumbers(current, total, compact) {
    const range = function (from, to) {
      const list = [];
      for (let i = from; i <= to; i++) list.push(i);
      return list;
    };

    if (compact) {
      if (total <= 7) return range(1, total);
      if (current <= 4) return range(1, 5).concat(['...', total]);
      if (current >= total - 3) return [1, '...'].concat(range(total - 4, total));
      return [1, '...', current - 1, current, current + 1, '...', total];
    }

    if (total <= 12) return range(1, total);
    if (current <= 7) return range(1, 9).concat(['...', total - 1, total]);
    if (current >= total - 6) return [1, 2, '...'].concat(range(total - 8, total));
    return [1, 2, '...'].concat(range(current - 2, current + 2), ['...', total - 1, total]);
  }

  // ======================================================================
  // 初期化
  // ======================================================================

  function initStaySearch() {
    const form = document.querySelector(SELECTORS.form);
    const resultContainer = document.querySelector(SELECTORS.results);
    const paginationContainer = document.querySelector(SELECTORS.pagination);
    const loading = document.querySelector(SELECTORS.loading);
    const countWrap = document.querySelector(SELECTORS.countWrap);
    const countEl = document.querySelector(SELECTORS.count);
    const genreFilter = document.querySelector(SELECTORS.genreFilter);
    const areaFilter = document.querySelector(SELECTORS.areaFilter);
    // 完売を隠すスイッチ。フォームの外にあるので FormData では取れない。
    // 「クリア」でも戻らない＝表示の設定として検索条件とは別に持つ
    const soldOutToggle = document.querySelector(SELECTORS.soldOutToggle);

    // 検索ページ以外で読み込まれても何もしない
    if (!form || !resultContainer || !paginationContainer) return;

    let allData = [];
    let currentResults = [];
    let currentPage = 1;
    let isSearching = false;
    let isSearching2 = false;   // 絞り込み中かどうか（件数の文言を切り替えるのに使う）
    // ページ送りを SP 用（項目少なめ）で描いているか。幅をまたいだら描き直す
    let isCompactPager = window.innerWidth < CONFIG.mobileBreakpoint;

    function setUpdatedDate(text) {
      const el = document.querySelector(SELECTORS.updated + ' p');
      if (el) el.textContent = text;
    }

    function showLoading(show) {
      isSearching = show;
      if (loading) loading.hidden = !show;
      resultContainer.classList.toggle('is-loading', show);
    }

    /** 件数を更新する。絞り込み中のときだけ「検索結果：○件」を出す */
    function updateCount(count, isFiltered) {
      if (countEl) countEl.textContent = String(count);
      if (countWrap) countWrap.hidden = !isFiltered;
      // 「全N件」と「検索結果：N件」を出し分けるために、絞り込み中かどうかを覚えておく
      isSearching2 = !!isFiltered;
    }

    /**
     * 日付の行の下に「いま何件目を出しているか」を表示する（agt ページと同じ）
     * 例）1件 - 10件（全822件）／ 絞り込み中は「（検索結果：45件）」／ 0件のときは消す
     */
    function setRange(total, page) {
      const el = document.querySelector(SELECTORS.range);
      if (!el) return;
      if (!total) { el.hidden = true; return; }
      // ページ送りを使わない設定のときは全件が1ページ扱い
      const per = (CONFIG.enablePagination && CONFIG.perPage) ? CONFIG.perPage : total;
      const start = (page - 1) * per + 1;
      const end = Math.min(page * per, total);
      const label = isSearching2 ? '検索結果：' + total + '件' : '全' + total + '件';
      el.textContent = start + '件 - ' + end + '件（' + label + '）';
      el.hidden = false;
    }

    function render(data, page) {
      setRange(data.length, page);
      if (!data.length) {
        resultContainer.innerHTML = '<p class="ss-empty">該当する施設が見つかりませんでした</p>';
        paginationContainer.innerHTML = '';
        return;
      }

      // ページ送りを使わない設定なら全件表示
      if (!CONFIG.enablePagination || !CONFIG.perPage) {
        resultContainer.innerHTML = data.map(createCard).join('');
        paginationContainer.innerHTML = '';
        return;
      }

      const start = (page - 1) * CONFIG.perPage;
      const pageItems = data.slice(start, start + CONFIG.perPage);
      resultContainer.innerHTML = pageItems.map(createCard).join('');
      renderPagination(page, Math.ceil(data.length / CONFIG.perPage));
    }

    function renderPagination(current, total) {
      if (total <= 1) {
        paginationContainer.innerHTML = '';
        return;
      }

      isCompactPager = window.innerWidth < CONFIG.mobileBreakpoint;

      const items = generatePageNumbers(current, total, isCompactPager).map(function (page) {
        if (page === '...') return '<span class="ss-page ss-page--ellipsis" aria-hidden="true">…</span>';
        if (page === current) return '<span class="ss-page ss-page--current" aria-current="page">' + page + '</span>';
        return '<button type="button" class="ss-page" data-page="' + page + '" aria-label="' + page + 'ページ目へ">' + page + '</button>';
      }).join('');

      // 前へ／次へ。デザインでは1ページ目でも「<」が出ているので、使えないとき（先頭・末尾）も
      // 表示は残し、押せない <span> にする（番号の位置もずれない）
      const prev = current > 1
        ? '<button type="button" class="ss-page-arrow" data-page="prev" aria-label="前のページへ">&lt;</button>'
        : '<span class="ss-page-arrow is-disabled" aria-hidden="true">&lt;</span>';
      const next = current < total
        ? '<button type="button" class="ss-page-arrow" data-page="next" aria-label="次のページへ">&gt;</button>'
        : '<span class="ss-page-arrow is-disabled" aria-hidden="true">&gt;</span>';

      paginationContainer.innerHTML = '' +
        '<nav class="ss-pagination__nav" aria-label="ページ送り">' +
          prev +
          '<div class="ss-pagination__pages">' + items + '</div>' +
          next +
        '</nav>';

      paginationContainer.querySelectorAll('button[data-page]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const attr = btn.getAttribute('data-page');
          if (attr === 'prev') currentPage = Math.max(1, currentPage - 1);
          else if (attr === 'next') currentPage = Math.min(total, currentPage + 1);
          else currentPage = parseInt(attr, 10) || 1;

          render(currentResults, currentPage);
          scrollToResults();
        });
      });
    }

    /** 結果の先頭（日付の行）までスクロールする */
    function scrollToResults() {
      const anchor = document.querySelector(SELECTORS.updated) || resultContainer;
      if (!anchor) return;
      // ヘッダーが上端に貼り付いているので、その高さ＋余白ぶん手前で止める（隠れないように）
      const top = anchor.getBoundingClientRect().top + window.pageYOffset - getStickyHeaderHeight() - CONFIG.scrollOffset;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: top, behavior: reduce ? 'auto' : 'smooth' });
    }

    function closeMobileFilter() {
      const toggle = document.querySelector(SELECTORS.filterToggle);
      const content = document.querySelector(SELECTORS.filterContent);
      if (!toggle || !content) return;
      content.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }

    function performSearch() {
      if (isSearching) return;
      showLoading(true);

      window.setTimeout(function () {
        const data = new FormData(form);
        const keyword = String(data.get('keyword') || '').trim();
        const genres = data.getAll('genre');
        const sales = data.getAll('sales');
        const areas = data.getAll('area');
        const hideSoldOut = !!(soldOutToggle && soldOutToggle.checked);

        currentResults = filterStays(allData, keyword, genres, sales, areas, hideSoldOut);
        updateCount(currentResults.length,
          !!(keyword || genres.length || sales.length || areas.length || hideSoldOut));
        render(currentResults, currentPage);
        showLoading(false);
      }, CONFIG.searchDelay);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      currentPage = 1;
      const isMobile = window.innerWidth < CONFIG.mobileBreakpoint;
      // SP はパネルを閉じてから結果へ移動する（閉じる前に測ると位置がずれる）
      if (isMobile) closeMobileFilter();
      performSearch();
      window.setTimeout(scrollToResults, isMobile ? 400 : 0);
    });

    form.addEventListener('reset', function () {
      // reset イベントの時点ではまだ入力が消えていないので、次のタイミングで全件に戻す
      window.setTimeout(function () {
        currentPage = 1;
        // 完売スイッチは検索条件ではないので「クリア」では戻さない。
        // 入っているときはその分だけ残して全件に戻す
        const hideSoldOut = !!(soldOutToggle && soldOutToggle.checked);
        currentResults = hideSoldOut
          ? allData.filter(function (stay) { return !stay.soldOut; })
          : allData;
        updateCount(currentResults.length, hideSoldOut);
        render(currentResults, currentPage);
        if (window.innerWidth < CONFIG.mobileBreakpoint) {
          closeMobileFilter();
          window.setTimeout(scrollToResults, 400);
        }
      }, 0);
    });

    // 完売スイッチは切り替えた時点で絞り込み直す（検索ボタンを押さなくてよい）。
    // ページ送りの途中で件数が変わるので、1ページ目に戻す
    if (soldOutToggle) {
      soldOutToggle.addEventListener('change', function () {
        currentPage = 1;
        performSearch();
      });
    }

    // エリアの開閉を「PC は開く／SP（縦積み）は閉じる」にそろえるための、いまの状態
    let isDesktopArea = window.innerWidth >= CONFIG.mobileBreakpoint;

    window.addEventListener('resize', function () {
      const compact = window.innerWidth < CONFIG.mobileBreakpoint;

      // PC ⇔ SP をまたいだら、ページ送りの項目数を切り替えるために描き直す
      if (compact !== isCompactPager && currentResults.length) {
        renderPagination(currentPage, Math.ceil(currentResults.length / CONFIG.perPage));
      }

      // PC ⇔ SP をまたいだら、エリアのグループを開閉し直す
      // （読み込み時は buildAreaFilter が幅を見て決めるが、あとから幅を変えたときも合わせる。
      //   またいだときだけ切り替えるので、同じ幅のまま手で開閉した状態は保たれる）
      if (!compact !== isDesktopArea && areaFilter) {
        isDesktopArea = !compact;
        areaFilter.querySelectorAll('details.ss-area').forEach(function (details) {
          details.open = isDesktopArea && CONFIG.areaOpenOnDesktop;
        });
      }
    });

    fetch(resolveCsvUrl())
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP error! status: ' + response.status);
        // 日付は CSV の更新日時（サーバーが返す Last-Modified）。取れなければ今日の日付
        const lastModified = response.headers.get('Last-Modified');
        setUpdatedDate(formatDate(lastModified ? new Date(lastModified) : new Date()));
        return response.text();
      })
      .then(function (text) {
        allData = buildData(parseCsvRows(text));

        // 絞り込みのチェックボックスを CSV から作る
        if (CONFIG.buildFilters) {
          if (genreFilter) buildGenreFilter(genreFilter, allData);
          if (areaFilter) buildAreaFilter(areaFilter, allData);
        }

        currentResults = allData;
        updateCount(allData.length, false);
        render(currentResults, currentPage);
      })
      .catch(function (error) {
        console.error('Failed to load CSV:', error);
        setUpdatedDate(formatDate(new Date()));
        resultContainer.innerHTML = '<p class="ss-empty">データの読み込みに失敗しました</p>';
      });
  }

  /**
   * PC（768px 以上）で、絞り込みパネルの 検索／クリア を常に画面内に見せる
   *
   * CSS だけだとパネルの高さは「画面の高さ − 40px」で固定になり、
   * ページ上部（パネルがタイトル・注意事項の下にある状態）ではボタンが画面の下にはみ出す。
   * そこで「今パネルが画面のどこから始まっているか」を見て、画面の下端 20px までに収まる高さにする。
   *   ・スクロールしてパネルが上端 20px に止まったら、高さは「画面の高さ − 40px」になる
   *   ・中身が短いときは max-height なので、パネルは中身の高さのまま
   *   ・SP（開閉式）では高さを制限しない
   */
  function initFilterHeight() {
    const panel = document.querySelector(SELECTORS.filterContent);
    if (!panel) return;

    // 高さの下限（ボタン 72px ＋ 中身が少し見える程度）。
    // 大きくしすぎると、画面の低い PC でページ上部にいるときにボタンが画面の下にはみ出す
    const MIN_HEIGHT = 140;
    let lastHeight = '';

    function update() {
      if (window.innerWidth < CONFIG.mobileBreakpoint) {
        if (lastHeight) {
          panel.style.maxHeight = '';
          lastHeight = '';
        }
        return;
      }
      // パネルの上端（sticky で止まっている間はヘッダーの下 20px）。それより上に抜けることはないが念のため下限にする
      const top = Math.max(getStickyHeaderHeight() + 20, panel.getBoundingClientRect().top);
      const height = Math.round(Math.max(MIN_HEIGHT, window.innerHeight - top - 20)) + 'px';
      // 値が変わったときだけ書き換える（止まっている間はレイアウトを動かさない）
      if (height !== lastHeight) {
        panel.style.maxHeight = height;
        lastHeight = height;
      }
    }

    // 位置を1回読んで高さを1つ書くだけの軽い処理なので、スクロールのたびに直接呼ぶ
    // （requestAnimationFrame で間引くと、裏に回ったタブなどで更新されないことがあるため）
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /**
   * 「エリアマップを見る」でエリアマップをポップアップ表示する
   *
   * ・開く … #area-map-button を押す
   * ・閉じる … × ボタン／背景（パネルの外）のクリック／Esc キー
   * ・開いている間は body に is-map-open を付けてページのスクロールを止める
   * ・キーボード操作のため、開いたら × にフォーカスを移し、閉じたら「エリアマップを見る」に戻す。
   *   Tab で移動できるのは × だけなので、開いている間は × から外に出ないようにする
   */
  function initAreaMapModal() {
    const openBtn = document.querySelector('#area-map-button');
    const modal = document.querySelector('#area-map-modal');
    if (!openBtn || !modal) return;

    const panel = modal.querySelector('.p-search-map__panel');
    const closeBtn = modal.querySelector('.p-search-map__close');
    const body = modal.querySelector('.p-search-map__body');

    function open() {
      modal.hidden = false;
      document.body.classList.add('is-map-open');
      if (body) body.scrollTop = 0;   // 前回スクロールした位置ではなく、地図の上から見せる
      if (closeBtn) closeBtn.focus();
    }

    function close() {
      if (modal.hidden) return;
      modal.hidden = true;
      document.body.classList.remove('is-map-open');
      openBtn.focus();
    }

    // 地図画像は loading="lazy"（ページを開いただけでは約 280KB を読み込まない）。
    // ただしそのままだと初めて開いた瞬間にパネルが真っ白になるので、
    // ボタンにマウスが乗った・フォーカスが当たった・指が触れた時点で読み込みを始めておく
    const mapImg = modal.querySelector('.p-search-map__img');
    function preload() {
      if (mapImg) mapImg.loading = 'eager';
    }
    ['pointerenter', 'focus', 'touchstart'].forEach(function (type) {
      openBtn.addEventListener(type, preload, { once: true, passive: true });
    });

    openBtn.addEventListener('click', function () {
      preload();
      open();
    });
    if (closeBtn) closeBtn.addEventListener('click', close);

    // 背景（パネルの外側）をクリックしたら閉じる
    modal.addEventListener('click', function (e) {
      if (panel && !panel.contains(e.target)) close();
    });

    document.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.key === 'Escape') {
        close();
      } else if (e.key === 'Tab' && closeBtn) {
        // フォーカスを × に留める（ポップアップの後ろのページへ移らないように）
        e.preventDefault();
        closeBtn.focus();
      }
    });
  }

  /** SP の「宿泊施設を絞り込む」ボタンでパネルを開閉する */
  function initFilterUI() {
    const toggle = document.querySelector(SELECTORS.filterToggle);
    const content = document.querySelector(SELECTORS.filterContent);
    if (!toggle || !content) return;

    toggle.addEventListener('click', function () {
      const isOpen = content.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  // DOM ができてから初期化する（読み込み済みならすぐ実行）
  function start() {
    initFilterUI();
    initFilterHeight();
    initAreaMapModal();
    initStaySearch();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
