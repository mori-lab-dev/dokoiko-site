#!/usr/bin/env node
/**
 * pickShareBgCandidates.mjs — シェア画像の背景に使える写真を絞り込む。
 *
 * 条件は3つ。
 *   1. ライセンスに継承義務が無いこと（CC BY / CC0 / パブリックドメイン）
 *      CC BY-SA を背景にすると、合成したシェア画像まで同じ条件で
 *      配布する義務が生じるため使えない。
 *   2. 横位置で、1200×675に切っても破綻しない大きさがあること
 *   3. 画面いっぱいに使うので、暗すぎず・白飛びしていないこと
 *
 * 3は明るさの中央値と、上下に振り切ったピクセルの割合で機械的に見る。
 * 最後は目で見て決める。
 *
 * usage: node scripts/pickShareBgCandidates.mjs [都道府県名]
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const PREF = process.argv[2] || null;
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));

const free = (l) => /^(CC BY [0-9.]|CC BY 2\.1|CC0|Public domain|Attribution)/i.test(String(l || ''));

const rows = [];
for (const d of dests) {
  if (PREF && d.prefecture !== PREF) continue;
  const c = d.imageCredit;
  if (!c || !free(c.license)) continue;
  const p = path.join('public/images', d.id, 'main.jpg');
  if (!fs.existsSync(p)) continue;
  try {
    const img = sharp(p);
    const m = await img.metadata();
    if (m.width < 1200 || m.width / m.height < 1.2) continue;   // 縦位置と小さすぎるものを除く
    const st = await img.greyscale().stats();
    const ch = st.channels[0];
    // ヒストグラムの端に寄りすぎていないか
    const hist = (await img.resize(120).greyscale().raw().toBuffer());
    let dark = 0, blown = 0;
    for (const v of hist) { if (v < 18) dark++; if (v > 242) blown++; }
    rows.push({
      id: d.id, name: d.name, pref: d.prefecture, license: c.license, author: c.author,
      w: m.width, h: m.height, mean: Math.round(ch.mean),
      darkPct: +(dark / hist.length * 100).toFixed(1), blownPct: +(blown / hist.length * 100).toFixed(1),
    });
  } catch { /* 読めないものは飛ばす */ }
}

// 暗すぎ・白飛びを落として、明るさが中庸なものを上に
const ok = rows.filter((r) => r.mean >= 70 && r.mean <= 195 && r.darkPct < 12 && r.blownPct < 8);
ok.sort((a, b) => (b.w * b.h) - (a.w * a.h));

console.log(`条件を満たす ${ok.length}件 / 継承義務なしの写真 ${rows.length}件${PREF ? `（${PREF}）` : ''}`);
for (const r of ok.slice(0, 40)) {
  console.log(`  ${r.id.padEnd(22)} ${r.name.slice(0, 12).padEnd(14)} ${String(r.pref).padEnd(5)} ${String(r.w).padStart(5)}x${String(r.h).padEnd(5)} 明るさ${String(r.mean).padStart(4)} 暗${String(r.darkPct).padStart(5)}% 白${String(r.blownPct).padStart(4)}%  ${r.license}`);
}
fs.mkdirSync('logs', { recursive: true });
fs.writeFileSync(`logs/share_bg_candidates${PREF ? '_' + PREF : ''}.json`, JSON.stringify(ok, null, 1));
