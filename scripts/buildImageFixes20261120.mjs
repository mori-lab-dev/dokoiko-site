#!/usr/bin/env node
/** buildImageFixes20261120.mjs — 画像の取り違え5ページ（7枚）の画像を外す編集（2026-11-20）。画像を実際に開いて、見どころと合わないことを確認したものだけ。差し替えは探さない。 */
import fs from 'fs';
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')); const byId = new Map(dests.map((d) => [d.id, d]));
const why = {
  'tsumago|脇本陣奥谷': '画像（Wikimedia の Ohara-juku10s3200.jpg）を開いて確認: 大原宿の土塀の建物の写真で、脇本陣奥谷（妻籠）ではない',
  'tsumago|妻籠城跡': '画像（Osaka_Castle_02bs3200.jpg）を開いて確認: 大阪城と高層ビルの写真で、妻籠城跡ではない',
  'yamadera|山門': '画像（170216_Chionin_Kyoto_Japan01.JPG）を開いて確認: 京都・知恩院の大きな三門の写真で、山寺（立石寺）の山門ではない',
  'yamadera|五大堂展望台': '画像（Matsushima_miyagi_z.JPG）を開いて確認: 松島の島々と船の海の写真で、山寺の五大堂展望台ではない',
  'yakake|矢掛脇本陣': '画像（Ohara-juku10s3200.jpg）を開いて確認: 大原宿の脇本陣の写真（大原観光協会の公式が大原宿の脇本陣として載せる建物）で、矢掛脇本陣ではない',
  'ono-fukui|勝山恐竜博物館（近隣）': '画像（Japan_Tojinbo02n4592.jpg）を開いて確認: 東尋坊の柱状節理の断崖の写真で、勝山恐竜博物館ではない',
  'hachimantai-onsen|玉川温泉（近隣）': '画像（Yufuin_Onsen_Rotenburo.JPG）を開いて確認: ファイル名が湯布院温泉の露天風呂の写真。秋田の玉川温泉ではない（スキャン確認で、玉川温泉の公式と比べて別の場所と判定）' };
const src = { tsumago: ['https://tsumago.jp/view/wakihonjin', 'https://nagiso.jp/topics/okuya/'], yakake: ['http://ohara-kanko.com/tourism/waki-honjin', 'http://www.town.yakage.okayama.jp/machi/shisetsu/wakihonjin.html'], yamadera: ['https://www.visityamagata.jp/spot-yamagata-yamadera_godaido'], 'hachimantai-onsen': ['https://www.city.semboku.akita.jp/sightseeing/spot/01_t-onsen.html', 'https://www.tamagawa-onsen.jp/'], 'ono-fukui': [] };
const edits = [];
for (const [k, reason] of Object.entries(why)) { const [id, name] = k.split('|'); const sp = byId.get(id).spots.find((s) => s.name === name); if (!sp?.imageUrl) throw new Error('画像なし ' + k);
  edits.push({ page: id, rule: 'IMG', 種類: '画像', op: 'removeSpotImage', file: 'src/data/destinations.json', dest: id, name, old: sp.imageUrl, 旧クレジット: sp.imageCredit || null, reason, 確認日: '2026-11-20', 値: [], 出典URL: src[id] || [], 備考: '画像は外部URL（Wikimedia）のため、削除するファイルは無い。縦横表(imageDims.json)にも項目は無い' }); }
fs.writeFileSync('scripts/data/mergeFactFixes20261120a.json', JSON.stringify({ note: '画像の取り違え（画像を外す）', date: '2026-11-20', fixes: [{ id: 'IMG', topic: '画像の取り違え5ページ7枚', result: '画像を開いて確認', sources: [], edits }] }, null, 1));
console.log(edits.length);
