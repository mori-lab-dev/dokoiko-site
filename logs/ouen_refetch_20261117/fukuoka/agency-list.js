/**
 * 参画旅行会社一覧（福岡 / 依存ライブラリなし）
 *
 * agency_list.csv を fetch で読み込み、カードを並べてページ送りする。
 * サーバー側の処理は不要。デザイン: _design/kyushu_hukko_fukuoka-agt_x1.png
 *
 * 元にしたのは _sample/search_js/files.zip の agency-list.js（4サイト共通版）。
 * 福岡のデザインに合わせて、次の点を変えている。
 *   ・カードを「左：エリアのバッジ＋会社名 ／ 右：住所・電話・ホームページ」の横並びにした
 *   ・日付の表記を「2026年○月○日現在」にした
 *   ・ページ送りを stay-search.js と同じ「< 1 2 … 9 … 49 50 >」の形にした（SP は項目数を減らす）
 *
 * 絞り込み（キーワード・エリア）の処理も残してある。
 * enableFilter: true にして、ページに #agency-search-form（keyword / area）を置けば使える
 * （現在のデザインには絞り込みが無いので false）。
 *
 * ページ側では CSV の場所だけ指定する:
 *
 *   <script>
 *     window.SS_CONFIG = { sitePrefix: 'fukuoka', csvDir: '/csv/' };
 *   </script>
 *   <script src="../assets/js/agency-list.js"></script>
 *
 *   → /csv/fukuoka_agency_list.csv を読み込む
 */
(function () {
  'use strict';

  // ======================================================================
  // 既定の設定
  // 優先順: window.SS_AGENCY_CONFIG > window.SS_CONFIG（共通） > 以下の既定値
  // ======================================================================
  const DEFAULTS = {
    sitePrefix: '',        // 'fukuoka' など。CSV のファイル名の頭に付く
    csvDir: '/csv/',
    csvUrl: '',            // 指定した場合は sitePrefix / csvDir より優先
    // カードの電話・ホームページのアイコン画像（icon-tel.png / icon-pc.png）の場所。
    // ページ（stay/・agt/）から見た相対パス。2倍の大きさで書き出してあり、CSS で半分に表示する
    iconDir: '../assets/img/stay/',

    enableFilter: false,   // 絞り込みを使うか（使うときはページに #agency-search-form を置く）
    enablePagination: true, // true: ページ送り / false: 全件表示
    perPage: 10,           // 1ページあたりの件数
    searchDelay: 300,      // 絞り込み時に「検索中」を見せるための待ち時間(ms)
    scrollOffset: 20,      // ページを送ったときに一覧の先頭へスクロールする際の上の余白(px)
    mobileBreakpoint: 768, // これ未満を SP として扱う（CSS の 767px と合わせる）
    normalizeKana: true,   // ひらがな/カタカナ・全角/半角を区別しない検索

    // このパターンを含むエリア名を「地元の旅行会社」として塗りつぶしのバッジにする
    // （それ以外は枠線のバッジ）。例: 福岡県内のみに店舗がある旅行会社
    localAreaPattern: '県内',

    // 住所・電話・ホームページがすべて空のときに出す案内文
    fallbackNote: 'お近くのお店やコールセンターへお尋ねください'
  };

  const CONFIG = Object.assign({}, DEFAULTS, window.SS_CONFIG || {}, window.SS_AGENCY_CONFIG || {});

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

  // CSV の列。見出し名で探し、見つからなければ index（列の位置）を使う
  /* 2026-09-29 の CSV から4列になった
       A 会社名 ／ B カナ（半角・検索用。画面には出さない）／ C ホームページ ／ D お知らせ（ラベル・今は未使用） */
  const COLUMNS = {
    name:    { header: '会社名',       index: 0 },
    kana:    { header: 'カナ',         index: 1 },
    website: { header: 'ホームページ', index: 2 },
    notice:  { header: 'お知らせ',     index: 3 }
  };

  const SELECTORS = {
    form: '#agency-search-form',
    areaFilter: '#agency-filter-area',
    results: '#agency-results',
    pagination: '#agency-pagination',
    countWrap: '#agency-result-info',
    count: '#agency-result-count',
    loading: '#agency-loading',
    updated: '#update-date',
    keyword: '#agency-keyword',              // 会社名の検索窓（入力するたびに絞り込む）
    keywordClear: '#agency-keyword-clear',   // 検索窓の×ボタン
    keywordCount: '#agency-keyword-count',   // 検索しているときだけ出す件数
    range: '#agency-range',                  // 罫線の下に出す「1件 - 10件（全93件）」
    filterToggle: '#mobile-filter-toggle',   // 絞り込みを使うときの SP 開閉ボタン
    filterContent: '#filter-content'         // 絞り込みパネル
  };

  /**
   * 読み込む CSV の URL を決める
   *   sitePrefix: 'fukuoka' → /csv/fukuoka_agency_list.csv
   */
  function resolveCsvUrl() {
    if (CONFIG.csvUrl) return CONFIG.csvUrl;
    const dir = String(CONFIG.csvDir || '/').replace(/\/*$/, '/');
    const prefix = CONFIG.sitePrefix ? CONFIG.sitePrefix + '_' : '';
    return dir + prefix + 'agency_list.csv';
  }

  // ======================================================================
  // ユーティリティ（stay-search.js と同じ実装）
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

  /** エスケープしたうえで、セル内の改行だけ <br> にする */
  function escMultiline(value) {
    return esc(value).replace(/\r?\n/g, '<br>');
  }

  /** リンク先は http(s) のみ許可する */
  function safeUrl(url) {
    const value = String(url || '').trim();
    if (!value) return '';
    return /^https?:\/\//i.test(value) ? value : '';
  }

  /** 検索用に文字をそろえる: NFKC → ひらがなをカタカナへ → 小文字化 */
  function normalize(text) {
    let str = String(text || '');
    if (!CONFIG.normalizeKana) return str.toLowerCase().trim();
    if (typeof str.normalize === 'function') str = str.normalize('NFKC');
    str = str.replace(/[ぁ-ゖ]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) + 0x60);
    });
    return str.toLowerCase().trim();
  }

  /** CSV を行・列の配列にする（セル内の改行・カンマ・"" エスケープ対応） */
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

  function resolveColumns(headerRow) {
    const headers = (headerRow || []).map(function (h) { return String(h || '').trim(); });
    const resolved = {};
    Object.keys(COLUMNS).forEach(function (key) {
      const found = headers.indexOf(COLUMNS[key].header);
      resolved[key] = found >= 0 ? found : COLUMNS[key].index;
    });
    return resolved;
  }

  /** CSV の行を、表示・検索に使うオブジェクトの配列にする（会社名が空の行は捨てる） */
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
        kana: get('kana'),
        website: safeUrl(get('website')),
        notice: get('notice')
      };
      // 検索の対象は「会社名」と「カナ」。normalize でひらがな・全角カナ・半角カナの違いを吸収する
      item._search = normalize(item.name + ' ' + item.kana);
      data.push(item);
    }
    return data;
  }

  /** キーワード AND エリア（いずれか）で絞り込む */
  function filterAgencies(data, keyword, areas) {
    const kw = keyword ? normalize(keyword) : '';
    return data.filter(function (agency) {
      if (kw && agency._search.indexOf(kw) === -1) return false;
      if (areas.length && areas.indexOf(agency.area) === -1) return false;
      return true;
    });
  }

  /** 「2026年9月14日現在」の形にする */
  function formatDate(date) {
    return date.getFullYear() + '年' + (date.getMonth() + 1) + '月' + date.getDate() + '日現在';
  }

  // ======================================================================
  // 描画
  // ======================================================================

  function isLocalArea(area) {
    if (!area || !CONFIG.localAreaPattern) return false;
    return area.indexOf(CONFIG.localAreaPattern) !== -1;
  }

  const TEL_ICON = '<img class="ss-card__icon ss-card__icon--tel" src="' + esc(CONFIG.iconDir) + 'icon-tel.png" width="29" height="26" alt="" aria-hidden="true">';

  /**
   * 電話番号。セル内で改行されていれば1行ずつ並べる
   * （「本社営業所 0997-53-6111」のように名前付きの行もあるので、
   *   番号として十分な桁数の数字を含む行だけ tel: リンクにし、それ以外は文字だけ出す）
   */
  function phoneBlock(phone) {
    if (!phone) return '';
    const lines = phone.split(/\r?\n/).filter(function (p) { return p.trim() !== ''; });
    if (!lines.length) return '';

    return '<div class="ss-agency__tels">' + lines.map(function (line) {
      const tel = line.replace(/[^0-9]/g, '');
      if (tel.length < 10) return '<span class="ss-agency__tel-text">' + esc(line.trim()) + '</span>';
      return '' +
        '<a href="tel:' + esc(tel) + '" class="ss-card__link ss-card__link--tel">' +
          TEL_ICON +
          '<span>' + esc(line.trim()) + '</span>' +
        '</a>';
    }).join('') + '</div>';
  }

  function websiteLink(url) {
    if (!url) return '';
    return '' +
      '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" class="ss-card__link ss-card__link--web">' +
        '<img class="ss-card__icon ss-card__icon--pc" src="' + esc(CONFIG.iconDir) + 'icon-pc.png" width="36" height="23" alt="" aria-hidden="true">' +
        '<span class="ss-card__web-text">ホームページ</span>' +
      '</a>';
  }

  /**
   * 旅行会社のカード（デザインどおりの横並び）
   *   左：エリアのバッジ → 会社名
   *   右：住所 → 電話・ホームページ（無いものは出さない。右側は上下中央にそろう）
   * 住所・電話・ホームページがすべて空のときだけ、右側に案内文を出す
   */
  function createCard(agency, index) {
    // 表示するのは会社名とホームページだけ（2026-09-29 の CSV に合わせた）
    const link = websiteLink(agency.website);

    return '' +
      '<article class="ss-card ss-agency" style="animation-delay: ' + (index * 50) + 'ms;">' +
        '<div class="ss-agency__main">' +
          // D 列のラベルは今は出さない。出すときは下のコメントを外す
          // '<div class="ss-card__badges">' +
          //   (agency.notice ? '<span class="ss-badge ss-badge--notice">' + esc(agency.notice) + '</span>' : '') +
          // '</div>' +
          '<h2 class="ss-card__name ss-agency__name">' + escMultiline(agency.name) + '</h2>' +
        '</div>' +
        /* ホームページが無い会社は右側の箱ごと出さない
           （SP の縦積みのとき、空の箱と gap のぶん下だけ余白が広くなるため） */
        (link ? '<div class="ss-agency__info"><div class="ss-agency__contact">' + link + '</div></div>' : '') +
      '</article>';
  }

  /**
   * ページ番号の並びを作る（stay-search.js と同じ）
   * PC は最大12項目、SP（compact）は最大7項目
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

  /** エリアのチェックボックスを CSV から作る（絞り込みを使うときだけ） */
  function buildAreaFilter(container, data) {
    const areas = [];
    data.forEach(function (d) {
      if (d.area && areas.indexOf(d.area) === -1) areas.push(d.area);
    });

    // 「○○県内のみに店舗がある旅行会社」のように名前が長いので、1行に1項目で並べる
    container.innerHTML = '<div class="ss-checks ss-checks--column">' + areas.map(function (area) {
      return '' +
        '<label class="ss-check">' +
          '<input type="checkbox" class="ss-check__input" name="area" value="' + esc(area) + '">' +
          '<span class="ss-check__label">' + esc(area) + '</span>' +
        '</label>';
    }).join('') + '</div>';
  }

  // ======================================================================
  // 初期化
  // ======================================================================

  function initAgencyList() {
    const resultContainer = document.querySelector(SELECTORS.results);
    const paginationContainer = document.querySelector(SELECTORS.pagination);

    // 一覧ページ以外で読み込まれても何もしない
    if (!resultContainer || !paginationContainer) return;

    const form = document.querySelector(SELECTORS.form);
    const areaFilter = document.querySelector(SELECTORS.areaFilter);
    const loading = document.querySelector(SELECTORS.loading);
    const countWrap = document.querySelector(SELECTORS.countWrap);
    const countEl = document.querySelector(SELECTORS.count);
    // 絞り込みは「設定で有効」かつ「フォームがある」ときだけ動かす
    const useFilter = !!(CONFIG.enableFilter && form);

    // フォームが置いてあっても、設定で無効なら隠す
    if (form && !useFilter) form.hidden = true;

    let allData = [];
    let currentResults = [];
    let currentPage = 1;
    let isSearching = false;
    let isCompactPager = window.innerWidth < CONFIG.mobileBreakpoint;
    // 検索中かどうか。件数の文言を「全N件」と「検索結果：N件」で切り替えるのに使う
    let searchActive = false;

    function setUpdatedDate(text) {
      /* 直下の <p> に入れる（検索窓の中にも <p>（件数）があるので > で限定する） */
      const el = document.querySelector(SELECTORS.updated + ' > p');
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
     * 罫線の下に「いま何件目を出しているか」を表示する
     * 例）1件 - 10件（全93件）／ 0件のときは消す
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
        resultContainer.innerHTML = '<p class="ss-empty">該当する旅行会社が見つかりませんでした</p>';
        paginationContainer.innerHTML = '';
        return;
      }

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

      // 前へ／次へ。先頭・末尾でも表示は残し、押せない <span> にする（stay/ と同じ）
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

    /** 一覧の先頭（日付の行）までスクロールする */
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

    // ------------------------------------------------------------------
    // 絞り込み（enableFilter: true かつフォームがあるときだけ）
    // ------------------------------------------------------------------
    if (useFilter) {
      const performSearch = function () {
        if (isSearching) return;
        showLoading(true);

        window.setTimeout(function () {
          const data = new FormData(form);
          const keyword = String(data.get('keyword') || '').trim();
          const areas = data.getAll('area');

          currentResults = filterAgencies(allData, keyword, areas);
          updateCount(currentResults.length, !!(keyword || areas.length));
          render(currentResults, currentPage);
          showLoading(false);
        }, CONFIG.searchDelay);
      };

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        currentPage = 1;
        const isMobile = window.innerWidth < CONFIG.mobileBreakpoint;
        // SP はパネルを閉じてから一覧へ移動する（閉じる前に測ると位置がずれる）
        if (isMobile) closeMobileFilter();
        performSearch();
        window.setTimeout(scrollToResults, isMobile ? 400 : 0);
      });

      form.addEventListener('reset', function () {
        // reset イベントの時点ではまだ入力が消えていないので、次のタイミングで全件に戻す
        window.setTimeout(function () {
          currentPage = 1;
          currentResults = allData;
          updateCount(allData.length, false);
          render(currentResults, currentPage);
        }, 0);
      });
    }

    // PC ⇔ SP をまたいだら、ページ送りの項目数を切り替えるために描き直す
    window.addEventListener('resize', function () {
      const compact = window.innerWidth < CONFIG.mobileBreakpoint;
      if (compact !== isCompactPager && currentResults.length) {
        renderPagination(currentPage, Math.ceil(currentResults.length / CONFIG.perPage));
      }
    });

    // ------------------------------------------------------------------
    // 会社名の検索窓（サイドバーの絞り込みとは別。入力するたびに一覧を絞り込む）
    // ------------------------------------------------------------------
    const keywordInput = document.querySelector(SELECTORS.keyword);
    const keywordClear = document.querySelector(SELECTORS.keywordClear);
    const keywordCount = document.querySelector(SELECTORS.keywordCount);

    /** 入力内容で絞り込んで描き直す（1ページ目に戻す） */
    function runKeywordSearch() {
      const kw = normalize(keywordInput.value);
      currentResults = kw ? allData.filter(function (a) { return a._search.indexOf(kw) !== -1; }) : allData;
      currentPage = 1;
      // 件数の文言を「全N件」→「検索結果：N件」に切り替えるためのフラグ（setRange が見る）
      searchActive = !!kw;
      updateCount(currentResults.length, !!kw);
      if (keywordClear) keywordClear.hidden = !keywordInput.value;
      // 検索窓の下に出していた件数は一覧の右上（.ss-range）に集約したので、
      // HTML から要素ごと外してある。戻すときは HTML のコメントを外せばここが動く（2026-10-07）
      if (keywordCount) {
        const num = keywordCount.querySelector('b');
        if (num) num.textContent = String(currentResults.length);
        keywordCount.hidden = !kw;
      }
      render(currentResults, currentPage);
    }

    if (keywordInput) {
      keywordInput.addEventListener('input', runKeywordSearch);
      // Enter でページが再読み込みされないようにする（フォームに入れていなくても念のため）
      keywordInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') e.preventDefault(); });
      if (keywordClear) {
        keywordClear.addEventListener('click', function () {
          keywordInput.value = '';
          runKeywordSearch();
          keywordInput.focus();
        });
      }
    }

    fetch(resolveCsvUrl())
      .then(function (response) {
        if (!response.ok) throw new Error('HTTP error! status: ' + response.status);
        // 日付は CSV の更新日時（Last-Modified）。取れなければ今日の日付
        const lastModified = response.headers.get('Last-Modified');
        setUpdatedDate(formatDate(lastModified ? new Date(lastModified) : new Date()));
        return response.text();
      })
      .then(function (text) {
        allData = buildData(parseCsvRows(text));
        if (useFilter && areaFilter) buildAreaFilter(areaFilter, allData);
        if (keywordInput && keywordInput.value) {
          runKeywordSearch();
        } else {
          currentResults = allData;
          updateCount(allData.length, false);
          render(currentResults, currentPage);
        }
      })
      .catch(function (error) {
        console.error('Failed to load CSV:', error);
        setUpdatedDate(formatDate(new Date()));
        resultContainer.innerHTML = '<p class="ss-empty">データの読み込みに失敗しました</p>';
        paginationContainer.innerHTML = '';
      });
  }

  /** SP の「旅行会社を絞り込む」ボタンでパネルを開閉する（絞り込みを使うときだけ） */
  function initFilterUI() {
    const toggle = document.querySelector(SELECTORS.filterToggle);
    const content = document.querySelector(SELECTORS.filterContent);
    if (!CONFIG.enableFilter || !toggle || !content) return;

    toggle.addEventListener('click', function () {
      const isOpen = content.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  /**
   * PC（768px 以上）で、絞り込みパネルの 検索／クリア を常に画面内に見せる（stay-search.js と同じ）
   * パネルの上端位置から「画面の下端 20px までに収まる高さ」を計算して max-height に入れる
   */
  function initFilterHeight() {
    const panel = document.querySelector(SELECTORS.filterContent);
    if (!CONFIG.enableFilter || !panel) return;

    const MIN_HEIGHT = 140; // 高さの下限（ボタン 72px ＋ 中身が少し見える程度）
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
      if (height !== lastHeight) {
        panel.style.maxHeight = height;
        lastHeight = height;
      }
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  function start() {
    initFilterUI();
    initFilterHeight();
    initAgencyList();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
