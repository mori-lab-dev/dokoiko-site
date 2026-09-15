#!/usr/bin/env node
/**
 * filterGeneratedSpotAudit.mjs — 距離だけの結果から、信用できるものだけを残す。
 *
 * auditGeneratedSpots の生の結果は 353件が「40kmより遠い」となったが、
 * 中身を見ると大半はジオコーダの取り違えだった。
 *   知床五湖 → 「北海道知内」  知内町は道南。知床とは無関係で、地名の一部が当たっただけ
 *   知床峠   → 「北海道知内」  同上
 * 返ってきた住所ラベルに spot 名が入っていないヒットは、別の地名を拾っている。
 * そこを条件にして、本当に遠いと言えるものだけを残す。
 *
 * 残ったものも「誤り」と断定はしない。近くの見どころとして正しく挙げている場合も
 * あるため、確認すべき候補として出す。
 *
 * usage: node scripts/filterGeneratedSpotAudit.mjs
 */
import fs from 'fs';

const rows = JSON.parse(fs.readFileSync('logs/generated_spot_audit.json', 'utf8'));

/** ラベルに spot 名の芯が入っているか。入っていなければ引き当てを信用しない */
function trustworthy(spotName, label) {
  const core = String(spotName)
    .replace(/[（(].*?[)）]/g, '')
    .replace(/(周辺|付近|一帯|群|など|の[^のと]*)$/, '')
    .trim();
  if (core.length < 2) return false;
  const l = String(label || '');
  // 3文字以上あれば先頭3文字、2文字ならそのまま
  const key = core.length >= 3 ? core.slice(0, 3) : core;
  return l.includes(core) || l.includes(key);
}

const solid = [], noisy = [];
for (const r of rows) {
  for (const s of r.spots) {
    if (s.verdict !== 'far') continue;
    (trustworthy(s.name, s.label) ? solid : noisy).push({ ...r, spot: s });
  }
}
solid.sort((a, b) => b.spot.km - a.spot.km);

console.log(`遠いと出た ${solid.length + noisy.length}件のうち`);
console.log(`  住所ラベルにspot名が入っていて信用できる  ${solid.length}件`);
console.log(`  別の地名を拾っただけと見られる            ${noisy.length}件（除外）\n`);

console.log('■ 確認すべき候補');
for (const h of solid) {
  console.log(`  ${h.id.slice(0, 24).padEnd(26)}${String(h.name).slice(0, 9).padEnd(11)}${String(h.spot.name).slice(0, 20).padEnd(22)}${String(h.spot.km).padStart(7)}km  ${String(h.spot.label).slice(0, 34)}`);
}

fs.writeFileSync('logs/generated_spot_suspect.json', JSON.stringify(solid, null, 1));
console.log(`\n→ logs/generated_spot_suspect.json`);
