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
 * usage: node scripts/buildQuizMap.mjs <ne_10m_admin_0_countries.geojson のパス>
 */
import fs from 'fs';
import { geoPath } from 'd3-geo';

const src = process.argv[2];
if (!src || !fs.existsSync(src)) { console.error('usage: node scripts/buildQuizMap.mjs <ne_10m_admin_0_countries.geojson>'); process.exit(1); }
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
  const TOL = 0.025;
  const simple = [];
  for (const p of polys) {
    const outer = p[0]; const xs = outer.map((c) => c[0]), ys = outer.map((c) => c[1]);
    const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    if (size < 0.03) continue;                                   // 約3km未満の島は描かない（旅先の点は点として出す）
    // 閉じた輪は始点と終点が同じで距離が0になるので、真ん中で2つに割って間引く
    const mid = outer.length >> 1; const ring = [...dp(outer.slice(0, mid + 1), TOL), ...dp(outer.slice(mid), TOL).slice(1)]; if (ring.length < 4) continue;
    simple.push([ring]);                                          // 内側の穴（湖）は描かない
  }
  console.log('残した島', simple.length, '/', polys.length, '点の数', simple.reduce((s, p) => s + p[0].length, 0));
  const geom = { type: 'MultiPolygon', coordinates: simple };
  const frames = FRAMES.map((f) => {
    const proj = projectionFor(f);
    const d = geoPath(proj).digits(0)(geom) || '';
    return { key: f.key, lon: f.lon, lat: f.lat, box: f.box, path: d };
  });
  const out = {
    source: { name: 'Natural Earth', dataset: 'ne_10m_admin_0_countries（Japan）', license: 'パブリックドメイン', url: 'https://www.naturalearthdata.com/about/terms-of-use/', processing: '日本の輪郭だけを取り出し、緯度経度のまま0.025度で間引き、約3km未満の島と湖の穴を除き、メルカトルで1000×940の枠（本土・沖縄奄美大東・小笠原の3枠）に投影した整数のSVGパス' },
    width: W, height: H, frames,
  };
  fs.writeFileSync('src/data/quizMap.json', JSON.stringify(out) + '\n');
  console.log('quizMap.json:', frames.map((f) => `${f.key} ${f.path.length}文字`).join(' / '), '合計', JSON.stringify(out).length, 'バイト');
}
