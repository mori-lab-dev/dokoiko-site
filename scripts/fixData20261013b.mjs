// 混入監査の判断確定分のデータ修正（2026-10-13）
//  ・tobe: hubStation が高松駅だったが hub は松山 → 松山駅（hub と整合）
//  ・mihonoseki: 宿の検索地域が米子（鳥取）だったが、hub は松江（島根）→ 宿検索・拠点とも松江に揃える。
//    五箇山（宿検索=高山）は設計どおりなので触らない
import fs from 'fs';
for (const f of ['src/data/destinations.json', 'public/data/destinations.json']) {
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const d of data) {
    if (d.id === 'tobe') { console.log(`tobe hubStation ${d.hubStation} → 松山駅`); d.hubStation = '松山駅'; }
    if (d.id === 'mihonoseki') {
      console.log(`mihonoseki hotelSearch ${d.hotelSearch} / stayArea ${JSON.stringify(d.stayArea)} / hubCity ${d.hubCity} / hotelArea ${d.hotelArea} → 松江`);
      d.hotelSearch = '松江';
      d.stayArea = { rakuten: '松江', jalan: '松江' };
      d.hubCity = '松江';
      d.hotelArea = 'shimane';
    }
  }
  fs.writeFileSync(f, JSON.stringify(data, null, 2) + '\n');
}
