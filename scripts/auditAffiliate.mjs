#!/usr/bin/env node
/**
 * auditAffiliate.mjs — ビルド済み HTML（dist）から全アフィリリンクを抽出して総点検する。
 * 実際にユーザーが踏むURL＝レンダリング後のものを対象にする（データだけでは判定できないため）。
 * 検出のみで修正はしない。
 */
import fs from 'fs';
import path from 'path';

const DIST = 'dist/destinations';
const RAKUTEN_AFF_ID = '5113ee4b.8662cfc5.5113ee4c.119de89a';
const JALAN_SID = 'sid=3764408', JALAN_PID = 'pid=892559858';

const dirs = fs.readdirSync(DIST).filter(d => fs.statSync(path.join(DIST, d)).isDirectory());
const dec = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

const stat = {
  pages: 0,
  rakuten: { total: 0, badAff: [], generic: [], hotelPage: 0, prefPage: 0, keyword: 0, other: [] },
  jalan:   { total: 0, badAff: [], yadPage: 0, prefPage: 0, keyword: 0, other: [] },
  rentacar: { rakuten: 0, jalan: 0, badAff: [] },
  jr: {},
  noRakuten: [], noJalan: [],
};

for (const id of dirs) {
  const f = path.join(DIST, id, 'index.html');
  if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, 'utf8');
  // 統合済みの旧URL（meta refresh だけのスタブ。例: kumano → nachikatsuura）は宿のリンクを持たない設計なので数えない
  if (/<meta http-equiv="refresh"/i.test(html)) { (stat.stubs ||= []).push(id); continue; }
  stat.pages++;
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&'));

  let hasRakuten = false, hasJalan = false;
  for (const h of hrefs) {
    /* ── 楽天 ── */
    if (h.includes('hb.afl.rakuten.co.jp')) {
      const inner = dec((h.match(/[?&]pc=([^&]+)/) || [])[1] || '');
      const isRentacar = /travel\.rakuten\.co\.jp\/cars/.test(inner);
      if (isRentacar) { stat.rentacar.rakuten++; if (!h.includes(RAKUTEN_AFF_ID)) stat.rentacar.badAff.push({ id, h: h.slice(0, 80) }); continue; }
      hasRakuten = true; stat.rakuten.total++;
      if (!h.includes(RAKUTEN_AFF_ID)) stat.rakuten.badAff.push({ id, h: h.slice(0, 90) });
      if (/travel\.rakuten\.co\.jp\/HOTEL\/\d+/.test(inner)) stat.rakuten.hotelPage++;
      else if (/kw\.travel\.rakuten\.co\.jp\/keyword\/Search\.do/.test(inner)) stat.rakuten.keyword++;
      else if (/travel\.rakuten\.co\.jp\/yado\/[a-z]+\/?$/.test(inner)) stat.rakuten.prefPage++;
      else if (/yado\/japan\.html/.test(inner) || inner === 'https://travel.rakuten.co.jp/') stat.rakuten.generic.push({ id, inner: inner.slice(0, 70) });
      else stat.rakuten.other.push({ id, inner: inner.slice(0, 70) });
    }
    /* ── じゃらん ── */
    else if (h.includes('ck.jp.ap.valuecommerce.com')) {
      const inner = dec((h.match(/vc_url=([^&]+)/) || [])[1] || '');
      const isRentacar = /jalan\.net\/rentacar/.test(inner);
      if (isRentacar) { stat.rentacar.jalan++; if (!(h.includes(JALAN_SID) && h.includes(JALAN_PID))) stat.rentacar.badAff.push({ id, h: h.slice(0, 80) }); continue; }
      hasJalan = true; stat.jalan.total++;
      if (!(h.includes(JALAN_SID) && h.includes(JALAN_PID))) stat.jalan.badAff.push({ id, h: h.slice(0, 90) });
      if (/jalan\.net\/yad\d+/.test(inner)) stat.jalan.yadPage++;
      else if (/jalan\.net\/\d{6}\/?$/.test(inner)) stat.jalan.prefPage++;
      else if (/uww2011init\.do/.test(inner)) stat.jalan.keyword++;
      else stat.jalan.other.push({ id, inner: inner.slice(0, 70) });
    }
    /* ── アフィリ無しの素リンク（取りこぼし検出）── */
    else if (/(^|\/\/)(travel\.rakuten\.co\.jp|www\.jalan\.net)/.test(h)) {
      (h.includes('rakuten') ? stat.rakuten.badAff : stat.jalan.badAff).push({ id, h: 'アフィリ無し: ' + h.slice(0, 70) });
    }
    /* ── JR予約 ── */
    else if (/eki-net\.com|jr-odekake\.net|smart-ex\.jp|jrkyushu\.co\.jp|jreast\.co\.jp\/ticket/.test(h)) {
      const svc = /eki-net/.test(h) ? 'えきねっと' : /jr-odekake/.test(h) ? 'e5489'
        : /smart-ex/.test(h) ? 'スマートEX' : /jrkyushu/.test(h) ? 'JR九州' : 'みどりの窓口';
      stat.jr[svc] = (stat.jr[svc] || 0) + 1;
    }
  }
  if (!hasRakuten) stat.noRakuten.push(id);
  if (!hasJalan) stat.noJalan.push(id);
}

const p = (n) => String(n).padStart(5);
console.log(`\n${'═'.repeat(72)}\n対象ページ: ${stat.pages}\n${'═'.repeat(72)}`);

console.log(`\n■ 1. 楽天トラベル（宿）: ${stat.rakuten.total} リンク`);
console.log(`   ${p(stat.rakuten.hotelPage)} 件  宿ページ直リンク (HOTEL/<no>)`);
console.log(`   ${p(stat.rakuten.prefPage)} 件  県別ページ (yado/<pref>/)`);
console.log(`   ${p(stat.rakuten.keyword)} 件  キーワード検索 (kw.travel…Search.do)`);
console.log(`   ${p(stat.rakuten.generic.length)} 件  ⚠️ 汎用トップ相当 (yado/japan.html 等)`);
console.log(`   ${p(stat.rakuten.other.length)} 件  その他`);
console.log(`   ${p(stat.rakuten.badAff.length)} 件  ❌ アフィリID不正/欠落`);
for (const x of stat.rakuten.generic.slice(0, 5)) console.log(`        [${x.id}] ${x.inner}`);
for (const x of stat.rakuten.other.slice(0, 5)) console.log(`        other [${x.id}] ${x.inner}`);
for (const x of stat.rakuten.badAff.slice(0, 5)) console.log(`        bad   [${x.id}] ${x.h}`);

console.log(`\n■ 2. じゃらん（宿）: ${stat.jalan.total} リンク`);
console.log(`   ${p(stat.jalan.yadPage)} 件  宿ページ直リンク (yad<no>)`);
console.log(`   ${p(stat.jalan.prefPage)} 件  県別ページ (6桁コード)`);
console.log(`   ${p(stat.jalan.keyword)} 件  キーワード検索 (uww2011init)`);
console.log(`   ${p(stat.jalan.other.length)} 件  その他`);
console.log(`   ${p(stat.jalan.badAff.length)} 件  ❌ アフィリID不正/欠落`);
for (const x of stat.jalan.other.slice(0, 5)) console.log(`        other [${x.id}] ${x.inner}`);
for (const x of stat.jalan.badAff.slice(0, 5)) console.log(`        bad   [${x.id}] ${x.h}`);

console.log(`\n■ 4. レンタカー`);
console.log(`   楽天レンタカー ${stat.rentacar.rakuten} / じゃらんレンタカー ${stat.rentacar.jalan} / ❌アフィリ不正 ${stat.rentacar.badAff.length}`);

console.log(`\n■ 5. JR予約リンクの出し分け`);
for (const [k, v] of Object.entries(stat.jr).sort((a, b) => b[1] - a[1])) console.log(`   ${p(v)} 件  ${k}`);

console.log(`\n■ リンク欠落`);
console.log(`   楽天リンクが無いページ: ${stat.noRakuten.length}${stat.noRakuten.length ? ' → ' + stat.noRakuten.slice(0, 5).join(', ') : ''}`);
console.log(`   じゃらんリンクが無いページ: ${stat.noJalan.length}${stat.noJalan.length ? ' → ' + stat.noJalan.slice(0, 5).join(', ') : ''}`);

fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync('logs/affiliate_audit.json', JSON.stringify(stat, null, 2));
console.log(`\n出力: logs/affiliate_audit.json`);
