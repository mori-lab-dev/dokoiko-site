// 診断の地図の枠と投影（2026-11-18）。scripts/buildQuizMap.mjs（輪郭）と scripts/buildQuizData.mjs（旅先の点）が同じ式を使う。
import { geoMercator } from 'd3-geo';
export const W = 1000, H = 940;
// 枠: lonlat の範囲 → 画面の箱。main は clip の外（沖縄など）を切る
export const FRAMES = [
  { key: 'main', lon: [122.7, 146.1], lat: [30.0, 45.8], box: [0, 0, 1000, 940] },
  { key: 'okinawa', lon: [122.5, 132.0], lat: [23.8, 29.6], box: [12, 756, 286, 928] },
  { key: 'ogasawara', lon: [141.7, 142.7], lat: [26.3, 27.5], box: [918, 836, 988, 928] },
];
// 範囲の対角の2点でメルカトルの大きさを決める（多角形だと巻き方向で「外側」が選ばれてしまう）
const corners = (f) => ({ type: 'MultiPoint', coordinates: [[f.lon[0], f.lat[0]], [f.lon[1], f.lat[1]]] });
export function projectionFor(f) {
  const [x0, y0, x1, y1] = f.box;
  return geoMercator().fitExtent([[x0, y0], [x1, y1]], corners(f)).clipExtent([[x0, y0], [x1, y1]]);
}


/** 緯度経度 → どの枠か */
export function frameOf(lat, lng) {
  if (lat < 29.6 && lng < 135) return 'okinawa';
  if (lat < 28 && lng > 140) return 'ogasawara';
  return 'main';
}
const PROJ = Object.fromEntries(FRAMES.map((f) => [f.key, projectionFor(f)]));
/** 緯度経度 → 画面の整数 x,y（枠の外に出たら null） */
export function project(lat, lng) {
  const key = frameOf(lat, lng); const f = FRAMES.find((x) => x.key === key);
  const [x, y] = PROJ[key]([lng, lat]); const rx = Math.round(x), ry = Math.round(y);
  const [x0, y0, x1, y1] = f.box;
  if (rx < x0 - 2 || rx > x1 + 2 || ry < y0 - 2 || ry > y1 + 2) return null;
  return { x: rx, y: ry, frame: key };
}
