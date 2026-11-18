// 試験3ページ（logs/priority_trial_20261118）の判定を、今回の results/ の形式に変換する（結果はそのまま使う。修正案は最小の値の置換にした）（2026-11-18）
import fs from 'fs';
const T = 'logs/priority_trial_20261118', D = 'logs/priority_fix_20261118';
const tr = JSON.parse(fs.readFileSync(`${T}/results.json`, 'utf8'));
const rep = { // id -> n -> 修正 / snapshot
  'suo-oshima': { 8: { 修正: { 種類: '置換', old: '橋詰付近に数台分あり', new: '町営駐車場あり（40台）', 値: ['40台'] }, snap: 'snapshots/trial_suo-oshima__oshima-ohashi.txt', url: ['https://suo-oshima-kanko.net/spot/oshima-ohashi'] },
    11: { 修正: { 種類: '置換', old: '食べ放題30分', new: '食べ放題1時間', 値: ['1時間'] }, snap: 'snapshots/trial_suo-oshima__matsuda-orange.txt', url: ['https://suo-oshima-kanko.net/spot/matsuda-orange'] } },
  'isawa-onsen': { 5: { 修正: { 種類: '削除', 理由: '対象施設が特定できず、公式は利用時間を定めている' }, snap: '', url: ['https://www.city.fuefuki.yamanashi.jp/machizukuri/kouen.html'] },
    9: { 修正: { 種類: '削除', 理由: '公式は無料〜500円前後で、500〜1500円に当たる値が無い' }, snap: '', url: ['https://www.yamanashi-kankou.jp/special/ekinaka_wine.html'] },
    10: { 修正: { 種類: '削除', 理由: '公式は施設ごとに 9:00〜16:30 など。10:00〜17:00 に当たる施設が無い' }, snap: '', url: ['https://www.fuefuki-kanko.jp/detail/336/index.html'] },
    13: { 修正: { 種類: '置換', old: '1日500円ほど', new: '無料（保証金1,000円は返却時に返金）', 値: ['無料', '1,000円'] }, snap: 'snapshots/trial_isawa-onsen__rental-cycle.txt', url: ['https://www.fuefuki-kanko.jp/detail/220/index.html'] } },
  'ikoma-kogen': { 3: { 修正: { 種類: '置換', old: '大人500円', new: '中学生以上700円', 値: ['700円'] }, snap: 'snapshots/trial_ikoma-kogen__information.txt', url: ['https://ikomakougen.com/information'] },
    6: { 修正: { 種類: '置換', old: '大人500円、子ども200円', new: '中学生以上700円（小学生・未就学児は無料）', 値: ['700円', '無料'] }, snap: 'snapshots/trial_ikoma-kogen__information.txt', url: ['https://ikomakougen.com/information'] },
    7: { 修正: { 種類: '置換', old: '8:30', new: '9:00', 値: ['9:00'] }, snap: 'snapshots/trial_ikoma-kogen__information.txt', url: ['https://ikomakougen.com/information'] },
    13: { 修正: { 種類: '置換', old: '標高700m', new: '標高540m', 値: ['540'] }, snap: 'snapshots/trial_ikoma-kogen__altitude.txt', url: ['https://www.kanko-miyazaki.jp/en/sightseeing/1025'] } },
};
for (const [id, js] of Object.entries(tr.判定)) {
  fs.copyFileSync(`${T}/page_${id}.json`, `${D}/inputs/page_${id}.json`);
  const groups = []; const gi = new Map();
  const out = js.map((j) => { const r = rep[id]?.[j.n]; let g = 0; if (r) { const key = r.snap + '|' + r.url.join(); if (!gi.has(key)) { gi.set(key, groups.length + 1); groups.push({ g: groups.length + 1, '施設・場所': '試験の確認結果', 出典URL: r.url, snapshot: r.snap, 取得: '試験で確認（写しは確認日に取得）' }); } g = gi.get(key); }
    const o = { n: j.n, g, 判定: j.判定 }; if (j.理由) o.理由 = j.理由; if (j.公式の値) o.公式の値 = j.公式の値; if (r) o.修正 = r.修正; return o; });
  fs.writeFileSync(`${D}/results/${id}.json`, JSON.stringify({ id, 由来: '優先ページ3つの検証の試験（logs/priority_trial_20261118）の結果をそのまま使用', グループ: groups, 判定: out }, null, 1));
}
console.log('ok');
