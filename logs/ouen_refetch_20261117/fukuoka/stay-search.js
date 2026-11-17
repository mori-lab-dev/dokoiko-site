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
    // エリア名の表記ゆれの吸収。例: { '南薩エリア': '南薩摩エリア' }
    areaAliases: {},
    // 市郡町の表記ゆれの吸収。例: { '奄美市笠利町': '奄美市' }
    cityAliases: {},
    // エリアと市郡町を明示指定する場合（施設が0件の市町村も表示したいとき）
    //   例: [{ area: '福岡市', cities: ['中央区', '博多区', ...] }, ...]
    areaGroups: [],

    // PC ではエリアのアコーディオンを開いた状態で表示する
    areaOpenOnDesktop: true
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

  // CSV の列。見出し名で探し、見つからなければ index（列の位置）を使う
  const COLUMNS = {
    phone:    { header: '個人_電話番号',                        index: 3 },
    address:  { header: '個人_所在地_漢字',                     index: 4 },
    name:     { header: '個人_自由項目1_宿泊施設名',            index: 5 },
    nameKana: { header: '個人_自由項目2_宿泊施設名（半角カナ）', index: 6 },
    website:  { header: '個人_自由項目3_ホームページ',          index: 7 },
    genre:    { header: '個人_自由項目9_形態をお選びください_1', index: 8 },
    city:     { header: '市郡町　（自動計算）',                  index: 9 },
    area:     { header: 'エリア　（自動計算）',                  index: 10 },
    notice:   { header: 'お知らせ',                             index: 11 }
  };

  // 形態の長い表記を、前方一致で短い名前にそろえる（この順でチェックボックスが並ぶ）
  const GENRE_MAPPING = [
    { prefix: 'ホテル',                   normalized: 'ホテル' },
    { prefix: '旅館',                     normalized: '旅館' },
    { prefix: '民宿・ペンション',         normalized: '民宿・ペンション' },
    { prefix: 'コテージ・ロッジ・一棟貸', normalized: 'コテージ・ロッジ・一棟貸' },
    { prefix: 'その他簡易宿所',           normalized: 'その他簡易宿所' },
    { prefix: '住宅宿泊事業法',           normalized: '民泊' }
  ];

  const SELECTORS = {
    form: '#stay-search-form',
    genreFilter: '#stay-filter-genre',
    areaFilter: '#stay-filter-area',
    results: '#stay-results',
    pagination: '#stay-pagination',
    loading: '#loading-indicator',
    countWrap: '#search-result-info',
    range: '#stay-range',            // 日付欄の右に出す「1件 - 10件（全857件）」
    count: '#result-count',
    updated: '#update-date',
    filterToggle: '#mobile-filter-toggle',
    filterContent: '#filter-content'
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
    const headers = (headerRow || []).map(function (h) { return String(h || '').trim(); });
    const resolved = {};
    Object.keys(COLUMNS).forEach(function (key) {
      const found = headers.indexOf(COLUMNS[key].header);
      resolved[key] = found >= 0 ? found : COLUMNS[key].index;
    });
    return resolved;
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
        nameKana: get('nameKana'),
        genre: normalizeGenre(get('genre')),
        city: normalizeCity(get('city')),
        area: normalizeArea(get('area')),
        address: get('address'),
        phone: get('phone'),
        website: safeUrl(get('website')),
        notice: get('notice')
      };
      // キーワード検索の対象（施設名・カナ・住所）をまとめて正規化しておく
      item._search = normalize(item.name + ' ' + item.nameKana + ' ' + item.address);
      data.push(item);
    }
    return data;
  }

  /** キーワード AND ジャンル（いずれか） AND エリア（いずれか）で絞り込む */
  function filterStays(data, keyword, genres, areas) {
    const kw = keyword ? normalize(keyword) : '';
    return data.filter(function (stay) {
      if (kw && stay._search.indexOf(kw) === -1) return false;
      if (genres.length && genres.indexOf(stay.genre) === -1) return false;
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
   * グループ・市郡町の並びは CSV の出現順（CONFIG.areaOrder で上書きできる）
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

  function createCard(stay, index) {
    return '' +
      '<article class="ss-card" style="animation-delay: ' + (index * 50) + 'ms;">' +
        '<div class="ss-card__badges">' +
          (stay.genre ? '<span class="ss-badge ss-badge--genre">' + esc(stay.genre) + '</span>' : '') +
          (stay.area ? '<span class="ss-badge ss-badge--area">' + esc(stay.area) + '</span>' : '') +
          (stay.notice ? '<span class="ss-badge ss-badge--notice">' + esc(stay.notice) + '</span>' : '') +
        '</div>' +
        '<h3 class="ss-card__name">' + esc(stay.name) + '</h3>' +
        '<p class="ss-card__address">' + esc(stay.address) + '</p>' +
        '<div class="ss-card__contact">' + phoneLink(stay.phone) + websiteLink(stay.website) + '</div>' +
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

    // 検索ページ以外で読み込まれても何もしない
    if (!form || !resultContainer || !paginationContainer) return;

    let allData = [];
    let currentResults = [];
    let currentPage = 1;
    let isSearching = false;
    // ページ送りを SP 用（項目少なめ）で描いているか。幅をまたいだら描き直す
    let isCompactPager = window.innerWidth < CONFIG.mobileBreakpoint;
    // 検索中かどうか。件数の文言を「全N件」と「検索結果：N件」で切り替えるのに使う
    let searchActive = false;

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
    }

    /**
     * 日付欄の右に「いま何件目を出しているか」を表示する
     * 例）1件 - 10件（全857件）／ 0件のときは消す
     */
    function setRange(total, page) {
      const el = document.querySelector(SELECTORS.range);
      if (!el) return;
      if (!total) { el.hidden = true; return; }
      // ページ送りを使わない設定のときは全件が1ページ扱い
      const per = (CONFIG.enablePagination && CONFIG.perPage) ? CONFIG.perPage : total;
      const start = (page - 1) * per + 1;
      const end = Math.min(page * per, total);
      // 検索しているときは「全N件」ではなく「検索結果：N件」にする
      const label = searchActive ? '検索結果：' + total + '件' : '全' + total + '件';
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
        const areas = data.getAll('area');

        currentResults = filterStays(allData, keyword, genres, areas);
        // 件数の文言を「全N件」→「検索結果：N件」に切り替えるためのフラグ（setRange が見る）
        searchActive = !!(keyword || genres.length || areas.length);
        updateCount(currentResults.length, searchActive);
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
        currentResults = allData;
        searchActive = false;
        updateCount(allData.length, false);
        render(currentResults, currentPage);
        if (window.innerWidth < CONFIG.mobileBreakpoint) {
          closeMobileFilter();
          window.setTimeout(scrollToResults, 400);
        }
      }, 0);
    });

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
