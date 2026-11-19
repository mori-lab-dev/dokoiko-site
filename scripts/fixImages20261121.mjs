#!/usr/bin/env node
/**
 * fixImages20261121.mjs — 画像の取り違えの残り（2026-11-19）。
 *   (1) 妻籠 脇本陣奥谷・山寺 山門に、public/images にある正しい写真を戻す（看板・石碑で確認済み。出典は Wikimedia Commons の写真のページ: ng_refetch_report.json の取り直しの題 → Commons API で作者・ライセンスを確認）。
 *   (2) Wikimedia 画像の「取り違え」と、画像を開いて確認した 85 件の外部URL画像を外す（verdicts_remote_159.json）。差し替えは探さない。変更前は backup/images_20261121/removed.json。
 */
import fs from 'fs';
const DRY = process.argv.includes('--dry'); const B = 'backup/images_20261121'; fs.mkdirSync(B, { recursive: true });
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')); const byId = new Map(dests.map((d) => [d.id, d]));
const restore = [
  { id: 'tsumago', name: '脇本陣奥谷', imageUrl: '/images/tsumago/spot-2.jpg', imageCredit: { author: 'そらみみ', license: 'CC BY-SA 3.0', url: 'https://commons.wikimedia.org/wiki/File:Waki-honjin_Okuya_of_Tsumago-juku.JPG', attributionRequired: true }, 根拠: '写真の看板に「脇本陣奥谷」。出典のファイル名は Waki-honjin Okuya of Tsumago-juku.JPG（Commons API で作者・ライセンスを確認）' },
  { id: 'yamadera', name: '山門', imageUrl: '/images/yamadera/spot-2.jpg', imageCredit: { author: 'pakku', license: 'CC BY 3.0', url: 'https://commons.wikimedia.org/wiki/File:%E5%B1%B1%E5%AF%BA%E3%83%BB%E5%B1%B1%E9%96%80%EF%BC%88_Yamadera_gate_%EF%BC%89_-_panoramio.jpg', attributionRequired: true }, 根拠: '写真の石碑に「山寺」「立石寺」・登山口の表示。出典のファイル名は「山寺・山門（ Yamadera gate ） - panoramio.jpg」（Commons API で作者・ライセンスを確認）' } ];
const rest = []; for (const r of restore) { const sp = byId.get(r.id).spots.find((s) => s.name === r.name); if (!sp) throw new Error('見どころなし ' + r.name); if (sp.imageUrl) throw new Error('既に画像あり ' + r.name); if (!fs.existsSync('public' + r.imageUrl)) throw new Error('ファイルなし ' + r.imageUrl); sp.imageUrl = r.imageUrl; sp.imageCredit = r.imageCredit; rest.push({ ...r }); }
const verd = JSON.parse(fs.readFileSync('logs/vision_20261120/verdicts_remote_159.json', 'utf8')); const out = []; const skipped = [];
for (const [key, v] of Object.entries(verd)) { if (v.判定 !== '取り違え') continue; const [id, , name] = key.split('|'); const d = byId.get(id); if (!d) { skipped.push({ key, 理由: '旅先データに無い' }); continue; } const sp = (d.spots || []).find((s) => s.name === name); if (!sp || !sp.imageUrl || !sp.imageUrl.startsWith('http')) { skipped.push({ key, 理由: '外部URLの画像が無い' }); continue; }
  out.push({ key, n: v.n, 旅先: d.name, 見どころ: name, 外した画像: sp.imageUrl, 旧クレジット: sp.imageCredit || null }); delete sp.imageUrl; delete sp.imageCredit; }
if (!DRY) { fs.writeFileSync('src/data/destinations.json', JSON.stringify(dests, null, 2) + '\n'); fs.writeFileSync(`${B}/removed.json`, JSON.stringify({ 戻した: rest, 外した: out, 見送り: skipped }, null, 1)); }
console.log(DRY ? 'dry' : '完了', '戻した', rest.length, '外した', out.length, '見送り', skipped.length, JSON.stringify(skipped));
