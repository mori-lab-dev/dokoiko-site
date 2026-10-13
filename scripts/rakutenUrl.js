// 楽天トラベル 宿キーワード検索URLの生成ヘルパー
// kw.travel.rakuten.co.jp/keyword/Search.do はじゃらんと同じく Shift_JIS の f_query を要求する。
// UTF-8 のままだと文字化け（鎌倉→「骼悟??」）して 0 件になる。
// 実測(2026-10-13・Playwright): f_query=%8A%99%91q(SJIS鎌倉)→316件 / %E9%8E%8C%E5%80%89(UTF-8)→0件。箱根 623件/0件。
import { encodeSjisParam } from './jalanUrl.js';
import { resolveStayKeyword } from './stayKeywordFallback.js';

export function rakutenKeywordSearchTarget(keyword) {
  return `https://kw.travel.rakuten.co.jp/keyword/Search.do?f_query=${encodeSjisParam(resolveStayKeyword('rakuten', keyword))}`;
}
