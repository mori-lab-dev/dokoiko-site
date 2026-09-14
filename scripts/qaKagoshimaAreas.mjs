#!/usr/bin/env node
/**
 * qaKagoshimaAreas.mjs — かごしま観光応援割のエリア別ページを、出来上がったHTMLで検査する。
 *
 * 見たいのは「公式の区分とずれていないか」。ソース側のデータだけ見ても、
 * テンプレートの条件分岐で出ていなければ意味がないので、distのHTMLを読む。
 *
 * usage: node scripts/qaKagoshimaAreas.mjs
 */
import fs from 'fs';
import path from 'path';

const areas = JSON.parse(fs.readFileSync('src/data/kagoshimaAreas.json', 'utf8'));
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const byId = new Map(dests.map((d) => [d.id, d]));
const read = (p) => fs.readFileSync(path.join('dist', p), 'utf8');

let ng = 0;
const fail = (m) => { console.log(`❌ ${m}`); ng++; };

// 公式で確認したエリア名。ここを直すときは必ず公式サイトを見直すこと。
const OFFICIAL = ['北薩摩エリア', '霧島・姶良エリア', '中薩摩エリア', '南薩摩エリア', '大隅エリア', 'その他離島エリア'];
const names = areas.map((a) => a.name);
if (JSON.stringify(names) !== JSON.stringify(OFFICIAL)) {
  fail(`エリア名が公式と違う: ${names.join(' / ')}`);
}

// 県内43市町村がちょうど1回ずつ現れること（重複も抜けも区分の崩れ）
const allTowns = areas.flatMap((a) => a.towns);
if (allTowns.length !== 43) fail(`市町村の総数が43でない（${allTowns.length}）`);
if (new Set(allTowns).size !== allTowns.length) fail('同じ市町村が複数のエリアに入っている');

// 旅先が2つのエリアに重複していないこと
const allIds = areas.flatMap((a) => a.destIds);
if (new Set(allIds).size !== allIds.length) fail('同じ旅先が複数のエリアに入っている');
const kagoshima = dests.filter((d) => d.prefecture === '鹿児島県').map((d) => d.id);
const missing = kagoshima.filter((id) => !allIds.includes(id));
if (missing.length) fail(`どのエリアにも入っていない旅先: ${missing.join(', ')}`);
const stray = allIds.filter((id) => !kagoshima.includes(id));
if (stray.length) fail(`鹿児島県以外の旅先が混ざっている: ${stray.join(', ')}`);

for (const a of areas) {
  const p = `kagoshima-oen/${a.slug}/index.html`;
  if (!fs.existsSync(path.join('dist', p))) { fail(`${a.slug} のページが生成されていない`); continue; }
  const html = read(p);

  if (!html.includes(a.name)) fail(`${a.slug}: エリア名「${a.name}」が本文に無い`);
  for (const t of a.towns) {
    if (!html.includes(t)) fail(`${a.slug}: 市町村「${t}」が載っていない`);
  }
  for (const id of a.destIds) {
    if (!html.includes(`/destinations/${id}/`)) fail(`${a.slug}: 旅先 ${id} へのリンクが無い`);
  }
  // 別エリアの旅先が紛れ込んでいないか
  for (const other of areas) {
    if (other.slug === a.slug) continue;
    for (const id of other.destIds) {
      if (html.includes(`/destinations/${id}/`)) fail(`${a.slug}: 別エリア(${other.short})の ${id} が載っている`);
    }
  }
  if (!html.includes('shukuhakuwari.pref.kagoshima.jp')) fail(`${a.slug}: 公式サイトへの導線が無い`);
  if (!html.includes('href="/kagoshima-oen/"')) fail(`${a.slug}: 親ページへ戻る導線が無い`);
  // 数字は公式で確認してもらう方針なので、割引率や上限額を書いていないこと
  if (/\d+\s*%\s*(OFF|オフ|割引)/.test(html) || /上限\s*[\d,]+\s*円/.test(html)) {
    fail(`${a.slug}: 割引率か上限額が書かれている（公式へ誘導する方針に反する）`);
  }

  const stays = a.destIds.filter((id) => byId.get(id)?.featured_stay?.name);
  const shown = [...html.matchAll(/class="ka-stay-name"[^>]*>([^<]+)</g)].map((m) => m[1]);
  if (shown.length !== stays.length) {
    fail(`${a.slug}: 宿の掲載数が合わない（データ${stays.length} / HTML${shown.length}）`);
  }
  console.log(`OK  ${a.slug.padEnd(15)} ${a.name.padEnd(12)} 市町村${String(a.towns.length).padStart(2)} 旅先${String(a.destIds.length).padStart(2)} 宿${stays.length}`);
}

// ハブ側（/kagoshima-oen/）から6エリアすべてに行けること
const hub = read('kagoshima-oen/index.html');
if (!hub.includes('エリアから選ぶ')) fail('ハブに「エリアから選ぶ」が無い');
for (const a of areas) {
  if (!hub.includes(`/kagoshima-oen/${a.slug}/`)) fail(`ハブから ${a.slug} へのリンクが無い`);
  if (!hub.includes(a.name)) fail(`ハブにエリア名「${a.name}」が無い`);
}
// エリア分けしていない県に、鹿児島のエリアが漏れ出していないこと
for (const other of ['kumamoto-oen', 'saga-oen', 'nagasaki-oen', 'oita-oen']) {
  if (read(`${other}/index.html`).includes('エリアから選ぶ')) {
    fail(`${other} に「エリアから選ぶ」が出ている（鹿児島だけのはず）`);
  }
}
// sitemapに6枚とも載っていること
const sm = read('sitemap.xml');
for (const a of areas) {
  if (!sm.includes(`/kagoshima-oen/${a.slug}/`)) fail(`sitemapに ${a.slug} が無い`);
}

console.log(ng ? `\nNG ${ng}件` : '\n✅ 全項目パス');
process.exit(ng ? 1 : 0);
