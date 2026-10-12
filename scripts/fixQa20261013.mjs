// qa.js の既存FAIL 3件の修正（2026-10-13）
//  ・kannojigoku / yunohira-onsen: hub が '大分' だが hubCities.json に大分は無い。
//    同じエリアの九重高原・湯布院は hub=福岡（所要 120〜130分で福岡が最短）なので揃える。
//  ・shirahama-boso: 東京から最短150分なのに stayAllowed に daytrip があった（qa は 120分以内を要求）。
//    同じく150分の銚子は ['1night'] なので揃え、reasonChips の「日帰り最適」も外す。
import fs from 'fs';
for (const f of ['src/data/destinations.json', 'public/data/destinations.json']) {
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const d of data) {
    if (d.id === 'kannojigoku' || d.id === 'yunohira-onsen') { console.log(`${d.id}: hub ${d.hub} → 福岡`); d.hub = '福岡'; }
    if (d.id === 'shirahama-boso') {
      console.log(`${d.id}: stayAllowed ${JSON.stringify(d.stayAllowed)} → ["1night"]`);
      d.stayAllowed = ['1night'];
      d.stayRecommendation = '1night';
      d.reasonChips = (d.reasonChips || []).filter((c) => c !== '日帰り最適');
    }
  }
  fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n');
}
