#!/usr/bin/env node
/**
 * removeWrongImages20261119.mjs — Vision 検査で「取り違え」と、画像を開いて確認できた画像を外す（2026-11-19）。差し替えは探さない。
 *   入力: logs/vision_20261120/verdicts_162.json（key → 取り違え|合う|確認できず。目視で確認した162枚）＋ 同じ誤った画像を使う3ページ（馬籠・永平寺・小浜温泉）
 *   見どころの画像: spots[].imageUrl・imageCredit を外す。ローカルのファイル（/images/...）は backup に退避して消し、縦横表・images[] の項目も外す。
 *   ヒーロー画像（seki）: main.jpg を退避して消し、imageCredit・unsplash 系を外す（applyNoImageDesign.mjs と同じ）。診断の旅先データからは build が自動で外す。
 *   既に旅先データから外れたページ（retirePages20261119.mjs）の分は対象外。
 * usage: node scripts/removeWrongImages20261119.mjs [--dry]
 */
import fs from 'fs';
import path from 'path';
const DRY = process.argv.includes('--dry');
const B = 'backup/images_20261119';
const verd = JSON.parse(fs.readFileSync('logs/vision_20261120/verdicts_162.json', 'utf8'));
const dests = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8')); const byId = new Map(dests.map((d) => [d.id, d]));
const dims = JSON.parse(fs.readFileSync('src/data/imageDims.json', 'utf8'));
const targets = Object.entries(verd).filter(([, v]) => v === '取り違え').map(([k]) => k);
// 同じ誤った画像（外す前の7枚と同じファイル）を使う3ページ。同じファイルを開いて確認済み（大原宿の建物・知恩院の三門・東尋坊）
targets.push('magome|spot|馬籠宿本陣跡', 'eiheiji|spot|山門', 'unzen2|spot|小浜温泉（近隣）');
const out = []; const skipped = [];
fs.mkdirSync(B, { recursive: true });
const rmLocal = (p) => { if (!p || !p.startsWith('/images/')) return false; const f = 'public' + p; if (!fs.existsSync(f)) return false; if (!DRY) { fs.mkdirSync(path.dirname(`${B}/${f}`), { recursive: true }); fs.copyFileSync(f, `${B}/${f}`); fs.unlinkSync(f); } return true; };
for (const key of [...new Set(targets)]) {
  const [id, kind, name] = key.split('|'); const d = byId.get(id); if (!d) { skipped.push({ key, 理由: '旅先データから外れたページ（転送ページ）' }); continue; }
  if (kind === 'hero') {
    const main = `/images/${id}/main.jpg`; const had = fs.existsSync('public' + main); const credit = d.imageCredit || null;
    rmLocal(main); delete d.imageCredit; delete d.unsplashUrl; delete d.unsplashCredit; delete d.unsplashCreditUrl; delete d.unsplashPhotoUrl;
    if (Array.isArray(d.images)) d.images = d.images.filter((u) => typeof u === 'string' && u.startsWith('/images/') && u !== main);
    delete dims[main]; out.push({ key, 種類: 'ヒーロー', 旅先: d.name, 外したファイル: had ? main : null, 旧クレジット: credit }); continue;
  }
  const sp = (d.spots || []).find((s) => s.name === name); if (!sp || !sp.imageUrl) { skipped.push({ key, 理由: '画像なし（既に外れている）' }); continue; }
  const url = sp.imageUrl; const credit = sp.imageCredit || null; const local = rmLocal(url);
  if (local) { delete dims[url]; if (Array.isArray(d.images)) d.images = d.images.filter((u) => u !== url); }
  delete sp.imageUrl; delete sp.imageCredit; out.push({ key, 種類: '見どころ', 旅先: d.name, 見どころ: name, 外した画像: url, ローカル: local, 旧クレジット: credit });
}
if (!DRY) { fs.writeFileSync('src/data/destinations.json', JSON.stringify(dests, null, 2) + '\n'); fs.writeFileSync('src/data/imageDims.json', JSON.stringify(dims)); fs.writeFileSync(`${B}/removed.json`, JSON.stringify({ 外した: out, 見送り: skipped }, null, 1)); }
console.log(DRY ? 'dry' : '完了', '外した', out.length, '（ヒーロー', out.filter((o) => o.種類 === 'ヒーロー').length, '・ローカルのファイル', out.filter((o) => o.ローカル).length, '）見送り', skipped.length);
