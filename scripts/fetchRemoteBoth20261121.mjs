// remote_both.json の31件目以降（129枚）を、/private/tmp に取得する（1.2秒おきに直列・UA にサイト名と /contact/ のURL・429は Retry-After を守って続行）。読み取りのみ。
import fs from 'fs'; import crypto from 'crypto'; import sharp from 'sharp';
const rows = JSON.parse(fs.readFileSync('logs/vision_20261120/remote_both.json', 'utf8')).slice(30); const D = '/private/tmp/claude-501/scr/wm2';
const UA = 'tabidokoiko.com image-audit/1.0 (site maintenance; contact: https://tabidokoiko.com/contact/)'; let ok = 0; const fail = [];
console.log('PID', process.pid);
for (const r of rows) { const f = `${D}/${r.n}.img`; if (fs.existsSync(f)) { ok++; continue; } let got = false;
  for (let t = 0; t < 8 && !got; t++) { const res = await fetch(r.画像, { headers: { 'user-agent': UA } }); if (res.status === 429) { await new Promise((s) => setTimeout(s, (+res.headers.get('retry-after') || 120) * 1000 + 1000)); continue; } if (!res.ok) break; fs.writeFileSync(f, Buffer.from(await res.arrayBuffer())); got = true; ok++; }
  if (!got) fail.push(r.n); await new Promise((s) => setTimeout(s, 1200)); }
console.log('取得', ok, '失敗', JSON.stringify(fail));
const W = 400, H = 300, PER = 12;
for (let s = 0; s * PER < rows.length; s++) { const part = rows.slice(s * PER, s * PER + PER); const comps = [];
  for (let i = 0; i < part.length; i++) { const f = `${D}/${part[i].n}.img`; if (!fs.existsSync(f)) continue; const b = await sharp(f).rotate().resize(W, H, { fit: 'cover' }).jpeg().toBuffer(); const x = (i % 4) * W, y = Math.floor(i / 4) * H; comps.push({ input: b, left: x, top: y }); comps.push({ input: Buffer.from(`<svg width="80" height="44"><rect width="80" height="44" fill="black"/><text x="8" y="34" font-size="34" fill="white" font-family="Arial">${part[i].n}</text></svg>`), left: x, top: y }); }
  await sharp({ create: { width: W * 4, height: H * 3, channels: 3, background: '#fff' } }).composite(comps).jpeg({ quality: 75 }).toFile(`${D}/sheet${s + 1}.jpg`); }
console.log('シート', Math.ceil(rows.length / PER));
