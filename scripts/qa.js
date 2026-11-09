#!/usr/bin/env node
/**
 * qa.js - destinations.json 品質検証
 * PASS / FAIL 数を出力し、不合格項目を一覧表示
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEST_FILE = path.join(__dirname, '../src/data/destinations.json');
const HUB_FILE = path.join(__dirname, '../src/data/hubCities.json');

const data = JSON.parse(fs.readFileSync(DEST_FILE, 'utf-8'));
const hubs = JSON.parse(fs.readFileSync(HUB_FILE, 'utf-8'));
const hubNames = new Set(hubs.map(h => h.name));

const checks = [];
const failures = [];

function addCheck(d, key, ok, msg) {
  checks.push({ id: d.id, name: d.name, key, ok, msg });
  if (!ok) failures.push({ id: d.id, name: d.name, key, msg });
}

for (const d of data) {
  // 1. id
  addCheck(d, 'has_id', !!d.id && /^[\w\-　-鿿]+$/.test(d.id), 'id異常');
  // 2. name
  addCheck(d, 'has_name', !!d.name && d.name.length > 0, 'name空');
  // 3. prefecture
  addCheck(d, 'has_prefecture', !!d.prefecture, 'prefecture未設定');
  // 4. region
  addCheck(d, 'has_region', !!d.region, 'region未設定');
  // 5. hub
  addCheck(d, 'has_hub', !!d.hub, 'hub未設定');
  // 6. hub in hubCities
  if (d.hub) addCheck(d, 'hub_valid', hubNames.has(d.hub), `hub "${d.hub}" がhubCities.jsonにない`);
  // 7. tags
  addCheck(d, 'has_tags', Array.isArray(d.tags) && d.tags.length >= 2, `tags少なすぎ(${d.tags?.length || 0})`);
  // 8. description
  addCheck(d, 'has_description', !!d.description && d.description.length >= 30, `description短い(${d.description?.length || 0}字)`);
  // 9. spots
  addCheck(d, 'has_spots', Array.isArray(d.spots) && d.spots.length >= 1, `spots不足(${d.spots?.length || 0}件)`);
  // 10. travelTime
  // travelTimeRemoved: 公式で確認できない出発地の値をすべて消したページ（2026-11-09 嵐山）。空を許す
  addCheck(d, 'has_travelTime', d.travelTimeRemoved === true || (d.travelTime && Object.keys(d.travelTime).length >= 1), 'travelTime空');
  // 11. stayAllowed
  addCheck(d, 'has_stayAllowed', Array.isArray(d.stayAllowed) && d.stayAllowed.length >= 1, 'stayAllowed空');
  // 12. hotelLinks
  addCheck(d, 'has_hotelLinks', d.hotelLinks && d.hotelLinks.rakuten && d.hotelLinks.jalan, 'hotelLinks不完全');
  // 13. reasonChips
  addCheck(d, 'has_reasonChips', Array.isArray(d.reasonChips) && d.reasonChips.length >= 1, 'reasonChips空');
  // 14. daytrip矛盾
  if (Array.isArray(d.stayAllowed) && d.stayAllowed.includes('daytrip') && d.travelTime) {
    const mn = Math.min(...Object.values(d.travelTime));
    addCheck(d, 'daytrip_consistent', mn <= 120, `daytrip矛盾(min=${mn})`);
  }
  // 15. id重複
}

// id重複検出
const idCount = new Map();
for (const d of data) idCount.set(d.id, (idCount.get(d.id) || 0) + 1);
for (const [id, c] of idCount) {
  if (c > 1) {
    failures.push({ id, name: '(重複)', key: 'id_unique', msg: `id重複(${c}回)` });
    checks.push({ id, name: '', key: 'id_unique', ok: false, msg: `id重複(${c}回)` });
  }
}

// 集計
const pass = checks.filter(c => c.ok).length;
const fail = checks.filter(c => !c.ok).length;

console.log('='.repeat(60));
console.log('destinations.json 品質QA');
console.log('='.repeat(60));
console.log(`総destination数: ${data.length}`);
console.log(`総チェック数: ${checks.length}`);
console.log(`PASS: ${pass}`);
console.log(`FAIL: ${fail}`);
console.log();

if (fail > 0) {
  // 種別ごとに集計
  const byKey = {};
  for (const f of failures) {
    byKey[f.key] = (byKey[f.key] || 0) + 1;
  }
  console.log('FAIL内訳:');
  for (const [k, c] of Object.entries(byKey).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${k}: ${c}件`);
  }
  console.log();
  console.log('上位20件:');
  failures.slice(0, 20).forEach(f => console.log(`  ✗ ${f.name}(${f.id}) [${f.key}] ${f.msg}`));
}

process.exit(fail > 0 ? 1 : 0);
