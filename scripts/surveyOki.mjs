#!/usr/bin/env node
// 隠岐諸島の旅先の調査（2026-11-18・読み取りのみ）。destinations.json（1,305件）のうち、隠岐の近く（緯度35.9〜36.4・経度132.8〜133.5）か、名前・説明・tags に「隠岐」を含むもの。
import fs from 'fs';
import path from 'path';
const all = JSON.parse(fs.readFileSync('src/data/destinations.json', 'utf8'));
const quiz = new Map(JSON.parse(fs.readFileSync('src/data/quizDestinations.json', 'utf8')).map((q) => [q.id, q]));
const gscFile = fs.readdirSync('logs/gsc').filter((f) => /^perf_pages_.*\.csv$/.test(f)).sort().pop();
const gsc = new Map(); for (const l of fs.readFileSync('logs/gsc/' + gscFile, 'utf8').split('\n').slice(1)) { const m = l.match(/^(\S+?),(\d+),(\d+),/); if (m) gsc.set(m[1].replace('https://tabidokoiko.com', ''), { clicks: +m[2], impressions: +m[3] }); }
const deleted = new Set(JSON.parse(fs.readFileSync('src/data/deletedIds.json', 'utf8')).map?.((x) => x.id || x) || []);
const links = new Map(); const from = new Map();
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (['dist/quiz', 'dist/_astro', 'dist/images'].includes(p)) continue; walk(p); } else if (e.name.endsWith('.html')) { const t = fs.readFileSync(p, 'utf8'); const self = '/' + path.relative('dist', path.dirname(p)) + '/'; const seen = new Set(); for (const m of t.matchAll(/href="(\/destinations\/[^/"#?]+\/)"/g)) if (m[1] !== self) seen.add(m[1]); for (const u of seen) { links.set(u, (links.get(u) || 0) + 1); (from.get(u) || from.set(u, []).get(u)).push(self); } } } };
walk('dist');
const hit = all.filter((d) => (d.lat >= 35.9 && d.lat <= 36.4 && d.lng >= 132.8 && d.lng <= 133.5) || /隠岐/.test(d.name + (d.description || '') + (d.tags || []).join('') + (d.mainSpot || '')));
for (const d of hit) {
  const q = quiz.get(d.id);
  console.log(JSON.stringify({ id: d.id, name: d.name, pref: d.prefecture, lat: d.lat, lng: d.lng, destType: d.destType, type: d.type, url: `/destinations/${d.id}/`, 診断: q ? { code: q.code, win: q.win, x: q.x, y: q.y } : '診断に入っていない', gsc: gsc.get(`/destinations/${d.id}/`) || null, 内部リンク: links.get(`/destinations/${d.id}/`) || 0, 内部リンク元: (from.get(`/destinations/${d.id}/`) || []).slice(0, 6), 説明: (d.description || '').slice(0, 70), tags: d.tags, mainSpot: d.mainSpot, spots: (d.spots || []).slice(0, 4).map((s) => s.name || s) }));
}
console.log('件数', hit.length, 'GSC', gscFile);
