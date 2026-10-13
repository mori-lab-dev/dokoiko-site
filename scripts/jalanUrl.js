// じゃらん宿キーワード検索URLの生成ヘルパー
// uwp2011エンドポイントはShift_JISエンコードのkeywordを要求する。
// UTF-8のままだとサーバー側でSJIS解釈されて文字化け(鎌倉→「骼悟??」)し検索0件になる。
// 実測(2026-08-13): keyword=%8A%99%91%71(SJIS鎌倉)→73ヒット / %E9%8E%8C%E5%80%89(UTF-8)→0件。
import iconv from 'iconv-lite';
import { resolveStayKeyword } from './stayKeywordFallback.js';

// Shift_JIS で表せない文字（Entô の ô など）は、そのまま渡すと「?」になって検索語が壊れる（2026-10-13・Entô（エントウ）で発見）。
// 結合文字を外した基本の文字（ô→o）に直し、それでも表せない文字は落とす。
export function toSjisSafe(s) {
  let out = '';
  for (const ch of String(s)) {
    if (iconv.decode(iconv.encode(ch, 'Shift_JIS'), 'Shift_JIS') === ch) { out += ch; continue; }
    const base = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    if (base && iconv.decode(iconv.encode(base, 'Shift_JIS'), 'Shift_JIS') === base) out += base;
  }
  return out;
}

export function encodeSjisParam(s) {
  const buf = iconv.encode(toSjisSafe(s), 'Shift_JIS');
  let out = '';
  for (const b of buf) {
    if ((b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A)
        || b === 0x2D || b === 0x2E || b === 0x5F || b === 0x7E) {
      out += String.fromCharCode(b);
    } else {
      out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return out;
}

// じゃらん宿キーワード検索の素URL(アフィリラップ前)。UL(アプリ起動)対象外パス。
export function jalanKeywordSearchTarget(keyword) {
  return `https://www.jalan.net/uw/uwp2011/uww2011init.do?keyword=${encodeSjisParam(resolveStayKeyword('jalan', keyword))}`;
}
