/* ==========================================================================
   お知らせ（CSV 読み込み版）… 2026-09-17 作成／2026-10-14 本番反映
   --------------------------------------------------------------------------
   お知らせを HTML に直書きする代わりに、CSV から読み込んで表示する。
   読み込んでいるページと CSV は次のとおり（data-news-csv が付いた要素なら class は問わない）。
     index.html・news/index.html … /csv/fukuoka_news.csv
     business/index.html         … /csv/fukuoka_business_news.csv
   お知らせの更新は CSV 側だけで行う（HTML は触らない）。

   使い方
     表示したい <dl> に data 属性を付けて、ページの最後で news.js を読み込む。
       <dl class="p-news__list" data-news-csv="/csv/fukuoka_news.csv"></dl>

     data-news-csv   … CSV の場所（必須）
     data-news-body  … "true" で本文（body）もタイトルの下に表示する（お知らせ一覧用）
     data-news-limit … 表示する件数の上限（省略時は全件）
     data-news-link  … お知らせ一覧ページの URL（トップ用）。指定すると、本文があるお知らせの
                       タイトルを「一覧ページ#アンカー」へのリンクにする
                       （タイトル自体にリンクが入っているときは、そのリンクを優先して何もしない）

   アンカー（各お知らせの id）
     CSV に ID 列が無いので、日付から作る … news-2026-09-12
     同じ日付が複数あるときは、CSV の上から2件目以降に -2, -3 … を付ける
     連番は非公開（visible = 0）の行も含めて数える（公開・非公開を切り替えても他の id がずれないように）
     一覧ページでは各お知らせにこの id を付け、URL の # と一致するものまでスクロールする

   CSV の列（1行目の見出し名で探す）
     date    … 2026-09-12 形式。表示は 2026/09/12
     title   … タイトル。HTML・インライン CSS をそのまま表示する
     body    … 本文。HTML・インライン CSS をそのまま表示する
     visible … "1" のものだけ表示（"0" は下書き扱い）

   並び順は CSV の行順のまま（上の行から表示する。並べ替えはしない）。
   ========================================================================== */
(function () {
  'use strict';

  var lists = document.querySelectorAll('[data-news-csv]');
  if (!lists.length) return;

  // 読み込めなかったとき／表示できるお知らせが無いときの文言
  var MESSAGE_ERROR = 'お知らせを読み込めませんでした。';
  var MESSAGE_EMPTY = '現在お知らせはありません。';

  /* ------------------------------------------------------------------
     CSV を行×列の配列にする（assets/js/stay-search.js の parseCsvRows と同じ処理）
     ダブルクォートで囲まれたカンマ・改行、"" のエスケープ、BOM、CRLF に対応
     ------------------------------------------------------------------ */
  function parseCsvRows(text) {
    var src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    for (var i = 0; i < src.length; i++) {
      var ch = src[i];
      var next = src[i + 1];

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
        // 空行は読み飛ばす
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

  /* ------------------------------------------------------------------
     CSV の行 → 表示するお知らせの配列
     公開（visible = 1）で日付が正しいものだけにする。並び順は CSV の行順のまま
     ------------------------------------------------------------------ */
  function toItems(rows) {
    if (!rows.length) return [];

    // 列の位置は見出し名で決める（列の順番が入れ替わっても動くように）
    var header = rows[0].map(function (h) { return h.trim(); });
    var col = {
      date: header.indexOf('date'),
      title: header.indexOf('title'),
      body: header.indexOf('body'),
      visible: header.indexOf('visible')
    };
    if (col.date < 0 || col.title < 0) throw new Error('CSV の見出し（date / title）が見つかりません');

    // 同じ日付が何件目か（アンカーの連番用）。非公開の行も数える
    var sameDateCount = {};

    return rows.slice(1)
      .map(function (r) {
        var date = (r[col.date] || '').trim();
        sameDateCount[date] = (sameDateCount[date] || 0) + 1;
        var n = sameDateCount[date];
        return {
          date: date,
          id: 'news-' + date + (n > 1 ? '-' + n : ''),
          title: r[col.title] || '',
          body: col.body >= 0 ? (r[col.body] || '') : '',
          // visible 列が無い CSV はすべて公開扱い
          visible: col.visible >= 0 ? (r[col.visible] || '').trim() : '1'
        };
      })
      .filter(function (item) {
        return item.visible === '1' && /^\d{4}-\d{2}-\d{2}$/.test(item.date);
      });
  }

  /* ------------------------------------------------------------------
     表示
     ------------------------------------------------------------------ */
  // タイトルの HTML にリンク（<a>）が入っているか
  function hasLink(html) {
    var box = document.createElement('div');
    box.innerHTML = html;
    return box.querySelector('a[href]') !== null;
  }

  // 1件分の HTML。title / body は CSV の HTML をそのまま入れる（エスケープしない）
  //   withBody … 本文も出す（一覧ページ）。このときは各お知らせに id を付ける
  //   linkBase … 一覧ページの URL（トップ）。本文があるお知らせのタイトルを一覧のアンカーへのリンクにする
  function itemHtml(item, withBody, linkBase) {
    var dateLabel = item.date.replace(/-/g, '/');
    var hasBody = item.body.trim() !== '';
    var html = '<div class="p-news__item"' + (withBody ? ' id="' + item.id + '"' : '') + '>' +
      '<dt class="p-news__date"><time datetime="' + item.date + '">' + dateLabel + '</time></dt>';

    if (!withBody && linkBase && hasBody && !hasLink(item.title)) {
      // トップ：本文があるものだけ一覧へ飛ばす。タイトルに元からリンクがあるときはそちらを優先して、ここは通らない
      html += '<dd class="p-news__text"><a href="' + linkBase + '#' + item.id + '">' + item.title + '</a></dd>';
    } else if (withBody && hasBody) {
      // 本文ありはタイトルと本文をブロックで分ける（本文に <p> や <ul> が入るため div にしている）
      html += '<dd class="p-news__text">' +
        '<div class="p-news__head">' + item.title + '</div>' +
        '<div class="p-news__body">' + item.body + '</div>' +
        '</dd>';
    } else {
      // タイトルだけのときは、直書き版と同じマークアップにする
      html += '<dd class="p-news__text">' + item.title + '</dd>';
    }
    return html + '</div>';
  }

  // 文言だけを出す（<dl> の中に <p> は置けないので、<dl> の直後に置く）
  function showMessage(list, text) {
    list.innerHTML = '';
    var message = document.createElement('p');
    message.className = 'p-news__message';
    message.textContent = text;
    list.insertAdjacentElement('afterend', message);
  }

  // 一覧ページ：URL の #news-… と一致するお知らせまでスクロールする。
  // お知らせは後から差し込むので、ブラウザ標準のアンカー移動（読み込み直後）には間に合わないため。
  // 別ページから来たときのアンカー移動は、ブラウザ標準と同じく「一瞬で移動」にする
  // （CSS の scroll-behavior: smooth のままだと、裏のタブで開いたときにスクロールが進まず先頭に残るため）
  function scrollToHash(list) {
    var hash = decodeURIComponent(location.hash.slice(1));
    if (hash.indexOf('news-') !== 0) return;
    var target = document.getElementById(hash);
    if (!target || !list.contains(target)) return;

    // スクリーンリーダーでもその位置から読めるよう、フォーカスも移す（スクロールはさせない）
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });

    // ページの読み込み中（画像・Web フォントの読み込み中）にスクロールを始めると、
    // 途中で打ち消されて先頭に残ってしまうので、読み込みが終わってから動かす。
    // requestAnimationFrame は裏のタブ（非表示）だと実行されないので setTimeout にしている
    var go = function () {
      setTimeout(function () {
        var root = document.documentElement;
        var saved = root.style.scrollBehavior;
        root.style.scrollBehavior = 'auto';   // この1回だけなめらかスクロールを止める
        target.scrollIntoView();              // 止まる位置は CSS の scroll-margin-top で調整
        root.style.scrollBehavior = saved;
      }, 0);
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
  }

  // トップのお知らせ欄は、スクロールの有無を main.js がリサイズ時に判定している。
  // 中身を差し込んだあとに判定し直してもらうため、resize を発火させる
  function notifyLayoutChanged() {
    window.dispatchEvent(new Event('resize'));
  }

  /* ------------------------------------------------------------------
     読み込み
     同じ CSV を複数の場所で使う場合も、取得は1回にまとめる
     ------------------------------------------------------------------ */
  var requests = {};

  function loadCsv(url) {
    if (!requests[url]) {
      // cache: 'no-cache' … ブラウザに古い CSV が残っていても、毎回サーバーに更新を確認させる
      // （更新が無ければ本体は再ダウンロードされない）
      requests[url] = fetch(url, { cache: 'no-cache' })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.text();
        })
        .then(function (text) {
          return toItems(parseCsvRows(text));
        });
    }
    return requests[url];
  }

  Array.prototype.forEach.call(lists, function (list) {
    var url = list.getAttribute('data-news-csv');
    var withBody = list.getAttribute('data-news-body') === 'true';
    var limit = parseInt(list.getAttribute('data-news-limit'), 10);
    var linkBase = list.getAttribute('data-news-link');

    list.setAttribute('aria-busy', 'true');

    loadCsv(url)
      .then(function (items) {
        var shown = limit > 0 ? items.slice(0, limit) : items;
        if (!shown.length) {
          showMessage(list, MESSAGE_EMPTY);
          return;
        }
        list.innerHTML = shown.map(function (item) { return itemHtml(item, withBody, linkBase); }).join('');
        if (withBody) {
          scrollToHash(list);
          // 一覧ページを開いたまま URL の # だけが変わったとき（戻る／進むなど）も同じ位置合わせをする
          window.addEventListener('hashchange', function () { scrollToHash(list); });
        }
      })
      .catch(function (error) {
        // 画面には文言だけ出し、原因はコンソールに残す（確認用）
        console.error('[news.js] お知らせの読み込みに失敗しました:', url, error);
        showMessage(list, MESSAGE_ERROR);
      })
      .then(function () {
        list.removeAttribute('aria-busy');
        notifyLayoutChanged();
      });
  });
})();
