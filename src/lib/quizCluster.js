// 診断の地図の「近い点を1つにまとめる」描画用の処理（2026-11-18）。画面（Canvas）と共有画像（scripts/buildQuizOgAll.mjs）が同じ関数を使う。
// ・描画のときだけ。旅先のデータ（quizDestinations.json の code・win・x,y）とエンジン（quizEngine.js）は変えない。
// ・まとめる距離 radius は、地図の論理座標（0〜1000）での距離。「画面上で約 PX 以内」を論理座標にしたもの（radiusFor）。
// ・決まった順（添字の小さい順）に、まだ配られていない点を種にして、種から radius 以内の点を全部同じ群に入れる。乱数なし・毎回同じ結果。
// ・skip（選ばれた旅先・次点）は群に入れない（本当の位置に別に描く）。
export const CLUSTER_PX = 14;   // 画面上でまとめる距離の目安（css px）

/** 画面上 px を、論理座標の距離にする。scale = 論理座標1あたりの css px（結果画面なら (cssW / W) * 拡大率。共有画像なら 560 / 1000） */
export const radiusFor = (scale, px = CLUSTER_PX) => px / scale;

/**
 * @param {{x:number,y:number}[]} dots  論理座標の点
 * @param {number} radius  まとめる距離（論理座標）
 * @param {Set<number>|null} skip  群に入れない添字
 * @returns {{x:number,y:number,m:number[]}[]}  群（x,y は中身の平均の位置・m は点の添字）。1点だけの群も返す
 */
export function clusterDots(dots, radius, skip = null) {
  const n = dots.length, cell = Math.max(radius, 1), R2 = radius * radius;
  const grid = new Map(); const key = (cx, cy) => cx * 100003 + cy;
  for (let i = 0; i < n; i++) {
    if (skip && skip.has(i)) continue;
    const k = key(Math.floor(dots[i].x / cell), Math.floor(dots[i].y / cell));
    const a = grid.get(k); if (a) a.push(i); else grid.set(k, [i]);
  }
  const used = new Uint8Array(n); const out = [];
  for (let i = 0; i < n; i++) {
    if (used[i] || (skip && skip.has(i))) continue;
    const cx = Math.floor(dots[i].x / cell), cy = Math.floor(dots[i].y / cell); const m = [];
    for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
      const a = grid.get(key(gx, gy)); if (!a) continue;
      for (const j of a) { if (used[j]) continue; const dx = dots[j].x - dots[i].x, dy = dots[j].y - dots[i].y; if (dx * dx + dy * dy <= R2) { used[j] = 1; m.push(j); } }
    }
    m.sort((p, q) => p - q);
    let sx = 0, sy = 0; for (const j of m) { sx += dots[j].x; sy += dots[j].y; }
    out.push({ x: m.length === 1 ? dots[m[0]].x : sx / m.length, y: m.length === 1 ? dots[m[0]].y : sy / m.length, m });
  }
  return out;
}

/** 群の点の半径（基準 r0 の倍率）。1点は基準のまま、まとまるほど少しだけ大きい（上限 約1.9倍）。件数の数字は描かない */
export const clusterScale = (count) => (count <= 1 ? 1 : 1.25 + 0.17 * Math.min(Math.log2(count), 4));
