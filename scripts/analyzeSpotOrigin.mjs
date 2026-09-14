#!/usr/bin/env node
/**
 * analyzeSpotOrigin.mjs — 出所照合の結果をまとめ、クレジットと「別物の疑い」に振り分ける。
 *
 * recoverSpotOrigin.mjs を5分割で流した結果を1つにして、
 *   1. 経路別（Pixabay / Openverse / Wikipedia）の内訳を出す
 *   2. 表示義務のあるライセンスのものは imageCredit を組み立てる
 *   3. 「その場所の写真ではない疑い」を機械的に拾う
 * の3つをやる。
 *
 * 3の判定は、出所側が持っている文字（Pixabayのタグ、Openverseのタイトル）に
 * spot名がそのまま入っているかどうかだけで見る。緩めると素通りするため。
 *   例) 血の池地獄 → タグ「スネーク川, 地獄の峡谷」。「地獄」しか一致しない ＝ 疑い
 *       唐招提寺   → タグ「奈良公園, 鹿」。県名で通してしまうと見逃す ＝ 疑い
 * ここで疑いとしたものを最終的に落とすかどうかは、写真を見る判断が要る。
 * この段階では一覧にするだけで、消しはしない。
 *
 * usage: node scripts/analyzeSpotOrigin.mjs
 * 出力: logs/spot_origin_merged.json
 */
import fs from 'fs';

const shards = [0, 1, 2, 3, 4].map((i) => JSON.parse(fs.readFileSync(`logs/spot_origin_${i}.json`, 'utf8')));
const found = shards.flatMap((s) => s.found);
const unknown = shards.flatMap((s) => s.unknown);

const UA = { 'User-Agent': 'DokoIko-DataAudit/1.0 (tabidokoiko.com; contact@tabidokoiko.com)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Openverse の license は 'by-sa' のような短い形。表示用に直す */
function openverseLicense(l, v) {
  const s = String(l || '').toLowerCase();
  if (s === 'cc0') return 'CC0 1.0';
  if (s === 'pdm') return 'Public domain';
  return `CC ${s.toUpperCase().replace(/-/g, '-')} ${v || ''}`.trim();
}

/** upload.wikimedia.org のURLから Commons のファイル名を取り出す */
function commonsTitleFromUrl(u) {
  const m = String(u).match(/\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
  return m ? `File:${decodeURIComponent(m[1])}` : null;
}

async function commonsCredit(title) {
  try {
    const r = await fetch('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo'
      + `&iiprop=extmetadata&titles=${encodeURIComponent(title)}`, { headers: UA, signal: AbortSignal.timeout(25000) });
    const j = await r.json();
    const m = Object.values(j?.query?.pages || {})[0]?.imageinfo?.[0]?.extmetadata;
    if (!m) return null;
    const strip = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    const license = strip(m.LicenseShortName?.value) || 'ライセンス不明';
    return {
      author: strip(m.Artist?.value) || '作者不明',
      license,
      url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/^File:/, 'File:').replace(/ /g, '_'))}`,
      attributionRequired: !/^(CC0|Public domain|パブリック)/i.test(license),
    };
  } catch { return null; }
}

const rows = [];
for (const f of found) {
  const o = f.origin;
  let credit = null;
  if (o.via === 'pixabay') {
    credit = {
      author: o.by || '作者不明',
      license: 'Pixabay Content License',
      url: o.ref,
      attributionRequired: false,   // Pixabayのライセンスは表示義務なし
    };
  } else if (o.via === 'openverse') {
    const license = openverseLicense(o.license, o.licenseVersion);
    credit = {
      author: o.by || '作者不明',
      license,
      url: o.ref,
      attributionRequired: !/^(CC0|Public domain)/i.test(license),
    };
  } else if (o.via === 'wikipedia') {
    const t = commonsTitleFromUrl(o.imgUrl);
    if (t) { credit = await commonsCredit(t); await sleep(250); }
    if (!credit) credit = { author: '作者不明', license: 'ライセンス不明', url: o.ref, attributionRequired: true };
  }

  // 出所側の文字に spot名 がそのまま入っているか。
  // o.query は検索語＝spot名そのものなので、ここに混ぜると全件一致してしまう。入れない。
  // Wikipedia経由だけは、その記事の代表画像を取っているので記事名の一致を根拠にしてよい。
  // Openverse の title と Wikipedia の記事名は、その素材自身が持っている名前なので根拠にしてよい。
  // Pixabay には title が無く、あるのは投稿者の付けたタグだけ。
  const hay = [o.tags, o.title, o.ref].filter(Boolean).join(' ');
  const nameHit = hay.includes(f.spotName);
  rows.push({ ...f, credit, nameHit });
}

const byVia = {};
for (const r of rows) {
  const v = r.origin.via;
  byVia[v] = byVia[v] || { n: 0, hit: 0, needAttr: 0 };
  byVia[v].n++;
  if (r.nameHit) byVia[v].hit++;
  if (r.credit?.attributionRequired) byVia[v].needAttr++;
}

console.log(`照合できた ${rows.length}件 / できなかった ${unknown.length}件（全${rows.length + unknown.length}件）\n`);
console.log('経路           件数   spot名が出所側にある   表示義務あり');
for (const [v, s] of Object.entries(byVia).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${v.padEnd(12)} ${String(s.n).padStart(4)}   ${String(s.hit).padStart(6)}   ${String(s.n - s.hit).padStart(4)}件が疑い   ${String(s.needAttr).padStart(4)}`);
}

const suspect = rows.filter((r) => !r.nameHit);
console.log(`\n別物の疑い ${suspect.length}件（出所側の文字に spot名 が無い）`);
console.log('うち見本20件');
for (const s of suspect.slice(0, 20)) {
  console.log(`  ${s.destId}/${s.idx} ${String(s.spotName).slice(0, 12).padEnd(14)} ${s.origin.via.padEnd(9)} ${String(s.origin.tags || s.origin.title || '').slice(0, 44)}`);
}

fs.writeFileSync('logs/spot_origin_merged.json', JSON.stringify({ rows, unknown }, null, 1));
console.log('\n→ logs/spot_origin_merged.json');
