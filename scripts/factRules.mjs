/**
 * factRules.mjs — 応援割ページの「割引率・上限額」の書き方の規則（2026-11-04）。
 *
 * 方針: 数字は変わりやすいので地の文には書かない。書いてよいのは、公式に明記されていて、
 *       出典URLと確認日が併記された枠（<li data-fact data-source="https://…" data-checked="YYYY-MM-DD">）の中だけ。
 * unsourcedNumbers(html) は、その枠の外にある割引率・上限額らしい記述を返す（空なら合格）。
 * 枠の中でも、data-source が https でない／data-checked が日付でないものは「出典なし」として返す。
 */
const FACT_BLOCK = /<(li|div|p)\b[^>]*\bdata-fact\b[^>]*>[\s\S]*?<\/\1>/g;
const NUMBER_PATTERNS = [
  /[0-9０-９][0-9０-９,.]*\s*[%％]/g,                                   // 割引率
  /(上限|最大|まで)[^。<>]{0,14}[0-9０-９][0-9０-９,]*\s*円/g,            // 上限額
  /[0-9０-９][0-9０-９,]*\s*円[^。<>]{0,8}(上限|まで|割引|引き|補助)/g,   // 〜円まで・〜円割引
];

export function unsourcedNumbers(html) {
  const bad = [];
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const rest = body.replace(FACT_BLOCK, (blk) => {
    const open = blk.match(/^<[^>]+>/)[0];
    const src = open.match(/data-source="([^"]*)"/)?.[1] ?? '';
    const chk = open.match(/data-checked="([^"]*)"/)?.[1] ?? '';
    if (!/^https:\/\//.test(src) || !/^\d{4}-\d{2}-\d{2}$/.test(chk)) bad.push(`出典URLか確認日が無い枠: ${blk.replace(/<[^>]+>/g, '').slice(0, 40)}`);
    return ' ';
  });
  const text = rest.replace(/<[^>]+>/g, ' ');
  for (const re of NUMBER_PATTERNS) for (const m of text.matchAll(re)) bad.push(`枠の外の数字: ${m[0]}`);
  return bad;
}
