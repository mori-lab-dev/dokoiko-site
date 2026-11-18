#!/usr/bin/env node
/**
 * buildQuizMap.mjs — 診断の日本地図 src/data/quizMap.json を作る（2026-11-18）。
 *
 * 出典: Natural Earth「ne_10m_admin_0_countries」（国境・海岸線）。パブリックドメイン（https://www.naturalearthdata.com/about/terms-of-use/）。
 *   入手: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson（13MB・リポジトリには入れない）
 * 加工: 日本（ADMIN=Japan）の輪郭だけを取り出し、緯度経度のまま 0.025度（約2.5km）で間引き（Douglas-Peucker）、小さすぎる島を除き、
 *       メルカトルで 1000×940 の枠に投影して整数の SVG パスにした。枠は3つ（本土 / 沖縄・奄美・大東 / 小笠原）。
 * 旅先の点の位置（x,y）は、この投影と同じ式で scripts/buildQuizData.mjs が prebuild で作る。投影の値はこのファイルの "frames" に入っている。
 *
 * 都道府県の境: Natural Earth「ne_10m_admin_1_states_provinces」（同じくパブリックドメイン）。日本の47都道府県を同じ式で間引き（0.025度）・投影し、frames[].pref に境の SVG パスとして入れた。
 *   入手: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson（40MB・リポジトリには入れない）
 * usage: node scripts/buildQuizMap.mjs <ne_10m_admin_0_countries.geojson のパス> <ne_10m_admin_1_states_provinces.geojson のパス>
 */
import fs from 'fs';
import { geoPath, geoArea } from 'd3-geo';

const src = process.argv[2], src1 = process.argv[3];
if (!src || !fs.existsSync(src) || !src1 || !fs.existsSync(src1)) { console.error('usage: node scripts/buildQuizMap.mjs <ne_10m_admin_0_countries.geojson> <ne_10m_admin_1_states_provinces.geojson>'); process.exit(1); }
import { FRAMES, projectionFor, W, H } from './lib/quizFrames.mjs';

if (process.argv[1].endsWith('buildQuizMap.mjs')) {
  const gj = JSON.parse(fs.readFileSync(src, 'utf8'));
  const jp = gj.features.find((f) => f.properties.ADMIN === 'Japan');
  const polys = jp.geometry.type === 'MultiPolygon' ? jp.geometry.coordinates : [jp.geometry.coordinates];
  // Douglas-Peucker（緯度経度のまま）
  const dp = (pts, tol) => {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop(); let dmax = 0, idx = -1;
      const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1e-12;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len; if (d > dmax) { dmax = d; idx = i; } }
      if (dmax > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  const TOL = Number(process.env.COAST_TOL || 0.04);        // 2026-11-18: 0.025→0.04（海岸線を少しなめらかに）
  const MIN_KM2 = 10;                                         // 約10km²未満の島は塗らない（旅先の点は元の位置に点として出す）
  const km2 = (ring) => geoArea({ type: 'Polygon', coordinates: [ring] }) * 6371 * 6371;
  const simple = [];
  for (const p of polys) {
    const outer = p[0]; const xs = outer.map((c) => c[0]), ys = outer.map((c) => c[1]);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (size < 0.03 || km2(outer) < MIN_KM2) continue;           // 約10km²未満の島は描かない（旅先の点は点として出す）
    // 閉じた輪は始点と終点が同じで距離が0になるので、真ん中で2つに割って間引く
    const mid = outer.length >> 1; const ring = [...dp(outer.slice(0, mid + 1), TOL), ...dp(outer.slice(mid), TOL).slice(1)]; if (ring.length < 4) continue;
    simple.push([ring]);                                          // 内側の穴（湖）は描かない
  }
  console.log('残した島', simple.length, '/', polys.length, '点の数', simple.reduce((s, p) => s + p[0].length, 0));
  const geom = { type: 'MultiPolygon', coordinates: simple };
  // 都道府県（admin_1）。国の輪郭と同じ間引き方（閉じた輪は半分に割る）。小さすぎる島は除く
  const PTOL = Number(process.env.PREF_TOL || 0.04);
  const g1 = JSON.parse(fs.readFileSync(src1, 'utf8'));
  const prefPolys = [];
  for (const f of g1.features.filter((x) => x.properties.iso_a2 === 'JP')) {
    const ps = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    for (const p of ps) {
      const outer = p[0]; const xs = outer.map((c) => c[0]), ys = outer.map((c) => c[1]);
      if (Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) < 0.03 || km2(outer) < MIN_KM2) continue;
      const mid = outer.length >> 1; const ring = [...dp(outer.slice(0, mid + 1), PTOL), ...dp(outer.slice(mid), PTOL).slice(1)]; if (ring.length < 4) continue;
      prefPolys.push([ring]);
    }
  }
  console.log('都道府県の多角形', prefPolys.length, '点の数', prefPolys.reduce((s, p) => s + p[0].length, 0));
  const prefGeom = { type: 'MultiPolygon', coordinates: prefPolys };
  const frames = FRAMES.map((f) => {
    const proj = projectionFor(f);
    const d = geoPath(proj).digits(0)(geom) || '';
    const pref = geoPath(proj).digits(0)(prefGeom) || '';
    return { key: f.key, box: f.box, path: d, pref };   // lon/lat の範囲は scripts/lib/quizFrames.mjs（画面には送らない）
  });
  const out = {
    source: { name: 'Natural Earth', dataset: 'ne_10m_admin_0_countries（Japan）・ne_10m_admin_1_states_provinces（日本の47都道府県）', license: 'パブリックドメイン', url: 'https://www.naturalearthdata.com/about/terms-of-use/', processing: '日本の部分だけを取り出し、緯度経度のまま国の輪郭・都道府県の境とも0.04度で間引き、約10km²未満の島と湖の穴を除き、メルカトルで1000×940の枠（本土・沖縄奄美大東・小笠原の3枠）に投影した整数のSVGパス' },
    width: W, height: H, frames,
  };
  fs.writeFileSync('src/data/quizMap.json', JSON.stringify(out) + '\n');
  console.log('quizMap.json:', frames.map((f) => `${f.key} ${f.path.length}+${f.pref.length}文字`).join(' / '), '合計', JSON.stringify(out).length, 'バイト');
}
