// 診断の日本地図（Canvas）（2026-11-18）。明るい紙の地図に、旅先を点で打つ。
// ・点の位置は quizDestinations.json の x,y（0〜1000 × 0〜940。投影は scripts/lib/quizFrames.mjs）。輪郭は quizMap.json（Natural Earth・パブリックドメイン）。
// ・setAlive: まだ1位に届く旅先は色が付き、届かない旅先はフェードして薄くなる（消さない）。
// ・showResult: 結果の旅先の点が脈打ち、地図がその周りへ寄る。次点は印を付ける。
// ・prefers-reduced-motion: 動きを止める（色・数・表示は同じ）。音・振動は付けない。地図は aria-hidden（数字と結果はテキストでも出す）。
const INK = [47, 44, 40], ALIVE = [196, 69, 45], DEAD = [168, 157, 132];
const LAND = '#ddd0b0', COAST = 'rgba(47,44,40,.62)', PREF = 'rgba(47,44,40,.16)', FRAME = '#bfb298';   // 地は紙色・陸は少し濃く・海岸線は細い墨線・県境はごく薄い墨線
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createMapView(canvas, map, dots) {
  const ctx = canvas.getContext('2d');
  const W = map.width, H = map.height, n = dots.length;
  const frames = map.frames.map((f) => ({ key: f.key, box: f.box, p: new Path2D(f.path), pf: new Path2D(f.pref || '') }));
  const v = new Float32Array(n).fill(1);         // 見た目の「残り」度合い（0=外れ 1=残り）
  const tgt = new Uint8Array(n).fill(1);
  let nar = 0, narTgt = 0;                       // 「絞り込みが始まったか」（0=全部が墨色 → 1=残り/外れで色分け）
  let view = { k: 1, tx: 0, ty: 0 }, viewFrom = view, viewTo = view, viewT0 = 0, viewDur = 0;
  let result = null;                             // { top: i, next: [i, i, i] }
  let raf = 0, last = 0, cssW = 0, dpr = 1;
  const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cssW = canvas.clientWidth || 320;
    canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssW * (H / W) * dpr);
    draw(performance.now());
  }
  function draw(now) {
    const sx = (cssW / W) * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = view.k;
    ctx.setTransform(sx * k, 0, 0, sx * k, view.tx * sx, view.ty * sx);
    const cssScale = (cssW / W) * k;
    // 輪郭
    for (const f of frames) {
      if (f.key !== 'main') { const [x0, y0, x1, y1] = f.box; ctx.save(); ctx.setLineDash([7 / cssScale, 6 / cssScale]); ctx.strokeStyle = FRAME; ctx.lineWidth = 1.4 / cssScale; ctx.strokeRect(x0 - 6, y0 - 6, x1 - x0 + 12, y1 - y0 + 12); ctx.restore(); }
      ctx.fillStyle = LAND; ctx.fill(f.p); ctx.lineJoin = 'round'; ctx.strokeStyle = PREF; ctx.lineWidth = 0.9 / cssScale; ctx.stroke(f.pf); ctx.strokeStyle = COAST; ctx.lineWidth = 1.1 / cssScale; ctx.stroke(f.p);
    }
    // 点（css px で一定の大きさ。寄ると少し大きくなる）
    const r0 = (1.55 + 0.35 * Math.min(k, 3)) / cssScale;
    for (let i = 0; i < n; i++) {
      if (result && (i === result.top || result.next.includes(i))) continue;       // 結果の点は最後に描く
      const c = mix(INK, mix(DEAD, ALIVE, v[i]), nar);
      const a = 0.78 + (0.95 - 0.78) * nar * v[i] - 0.56 * nar * (1 - v[i]);
      ctx.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
      const r = r0 * (1 + 0.15 * nar * v[i] - 0.3 * nar * (1 - v[i]));
      ctx.beginPath(); ctx.arc(dots[i].x, dots[i].y, r, 0, 6.2832); ctx.fill();
    }
    if (result) {
      // 結果: 全部の点は墨のまま。選ばれた1点だけ朱色の点を細い朱の輪で囲む（共有画像と同じ見た目）。次点は墨の細い輪と番号
      result.next.forEach((i, j) => {
        const d = dots[i]; ctx.beginPath(); ctx.arc(d.x, d.y, r0 * 3.1, 0, 6.2832); ctx.lineWidth = 1.3 / cssScale; ctx.strokeStyle = 'rgba(47,44,40,.85)'; ctx.stroke();
        ctx.font = `700 ${12 / cssScale}px 'Noto Sans JP', sans-serif`; ctx.fillStyle = '#2f2c28'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(String(j + 2), d.x + r0 * 3.8, d.y - r0 * 2.4);
      });
      const d = dots[result.top]; const t = reduced() ? 0.5 : ((now % 1800) / 1800);
      const tt = t; ctx.beginPath(); ctx.arc(d.x, d.y, r0 * (5.2 + 5 * tt), 0, 6.2832); ctx.strokeStyle = `rgba(200,50,31,${(0.45 * (1 - tt)).toFixed(3)})`; ctx.lineWidth = 1.2 / cssScale; ctx.stroke();   // 脈打つ（細い輪）
      ctx.beginPath(); ctx.arc(d.x, d.y, r0 * 5.2, 0, 6.2832); ctx.strokeStyle = '#c8321f'; ctx.lineWidth = 1.5 / cssScale; ctx.stroke();
      ctx.beginPath(); ctx.arc(d.x, d.y, r0 * 2.1, 0, 6.2832); ctx.fillStyle = '#c8321f'; ctx.fill();
    }
  }
  function frameLoop(now) {
    raf = 0; const dt = Math.min(64, now - (last || now)); last = now;
    let moving = false;
    // 点のフェード（約450ms）・絞り込みの色分け（約500ms）
    const step = dt / 450;
    for (let i = 0; i < n; i++) { const g = tgt[i]; if (v[i] !== g) { v[i] = g > v[i] ? Math.min(g, v[i] + step) : Math.max(g, v[i] - step); moving = true; } }
    if (nar !== narTgt) { nar = narTgt > nar ? Math.min(narTgt, nar + dt / 500) : Math.max(narTgt, nar - dt / 500); moving = true; }
    if (viewDur && now - viewT0 < viewDur) { const t = ease((now - viewT0) / viewDur); view = { k: viewFrom.k + (viewTo.k - viewFrom.k) * t, tx: viewFrom.tx + (viewTo.tx - viewFrom.tx) * t, ty: viewFrom.ty + (viewTo.ty - viewFrom.ty) * t }; moving = true; }
    else if (viewDur) { view = viewTo; viewDur = 0; }
    draw(now);
    if (moving || result) { raf = requestAnimationFrame(frameLoop); } else last = 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frameLoop); };

  function setAlive(flags) {
    let dead = 0;
    for (let i = 0; i < n; i++) { tgt[i] = flags[i] ? 1 : 0; if (!flags[i]) dead++; }
    narTgt = dead > 0 ? 1 : 0;
    if (reduced()) { for (let i = 0; i < n; i++) v[i] = tgt[i]; nar = narTgt; draw(performance.now()); }
    else kick();
    canvas.dataset.alive = String(n - dead);
  }
  function lookAt(box, dur) {
    // box: 論理座標の [x0,y0,x1,y1]。canvas いっぱい（余白あり）に収まる拡大率と平行移動
    const pad = 70; const bw = Math.max(box[2] - box[0], 60) + pad * 2, bh = Math.max(box[3] - box[1], 60) + pad * 2;
    const k = Math.max(1, Math.min(3.4, Math.min(W / bw, H / bh)));
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    // 画面の位置 = sx * (k * x + tx)。選んだ点が中央に来て、地図の外が見えない範囲に収める
    const tx = Math.min(0, Math.max(W - W * k, W / 2 - cx * k)), ty = Math.min(0, Math.max(H - H * k, H / 2 - cy * k));
    viewFrom = view; viewTo = { k, tx, ty };
    if (reduced() || !dur) { view = viewTo; viewDur = 0; draw(performance.now()); }
    else { viewT0 = performance.now(); viewDur = dur; kick(); }
  }
  function showResult(top, next) {
    result = { top, next };
    tgt.fill(1);                                                    // 結果では全部の点を墨に戻す（共有画像と同じ見た目）
    narTgt = 0; if (reduced()) { for (let i = 0; i < n; i++) v[i] = 1; nar = 0; }
    const pts = [dots[top], ...next.map((i) => dots[i])];
    // 次点が近ければ一緒に収める。遠ければ結果の周りだけに寄る
    const near = pts.filter((p, j) => j === 0 || Math.hypot(p.x - dots[top].x, p.y - dots[top].y) < 230);
    const xs = near.map((p) => p.x), ys = near.map((p) => p.y);
    lookAt([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], 1000);
    canvas.dataset.focus = `${dots[top].x},${dots[top].y}`;
    canvas.dataset.view = JSON.stringify({ k: viewTo.k, tx: viewTo.tx, ty: viewTo.ty });   // 手元の確認用（寄せ先）
    kick();
  }
  function reset() {
    result = null; delete canvas.dataset.focus; delete canvas.dataset.view;
    viewFrom = view; viewTo = { k: 1, tx: 0, ty: 0 };
    if (reduced()) { view = viewTo; viewDur = 0; } else { viewT0 = performance.now(); viewDur = 500; }
    kick(); draw(performance.now());
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
  if (ro) ro.observe(canvas); else window.addEventListener('resize', resize);
  resize();
  return { setAlive, showResult, reset, resize, destroy: () => { if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); } };
}
