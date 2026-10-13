// 宿の検索リンクで「検索すると 0 件になる語」を、結果が出る代替の語に置き換える表の読み込み（2026-10-13）。
// 表は scripts/buildStayKeywordFallback.mjs が、実際に検索して 1 件以上ヒットしたものだけを書く（src/data/stayKeywordFallback.json）。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export let fallbackTable = { rakuten: {}, jalan: {} };
// Astro のビルドでは、このファイルは dist の chunk に束ねられ import.meta.url が元の位置を指さない。
// ビルドもスクリプトもプロジェクトのルートで実行するので、作業ディレクトリ基準で読む。
for (const f of [path.join(process.cwd(), 'src/data/stayKeywordFallback.json'), fileURLToPath(new URL('../src/data/stayKeywordFallback.json', import.meta.url))]) {
  try { fallbackTable = JSON.parse(fs.readFileSync(f, 'utf8')); break; } catch { /* 次の候補へ */ }
}
if (!Object.keys(fallbackTable.jalan || {}).length) console.warn('⚠ stayKeywordFallback.json を読めなかった（宿の検索語の置き換えは無効）');

/** site: 'rakuten' | 'jalan'。表に無い語はそのまま返す */
export function resolveStayKeyword(site, keyword) {
  const t = fallbackTable[site] || {};
  // 表の鍵は Shift_JIS で表せる形（Entô → Ento）。結合文字を外した形でも引く
  return t[keyword] ?? t[keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, '')] ?? keyword;
}
