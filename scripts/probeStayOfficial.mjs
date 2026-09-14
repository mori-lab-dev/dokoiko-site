#!/usr/bin/env node
/**
 * probeStayOfficial.mjs — 宿の公式サイトの候補URLに実際に当たり、到達したものだけを拾う。
 *
 * 公式URLはデータに持っていないため、候補ドメインへ実際にHTTPで当たって
 *   ・200で返る
 *   ・HTMLのtitleに宿名の一部が含まれる
 * の両方を満たしたものだけを「確認できた」とする。
 * 当て推量のURLをそのまま載せると別のサイトへ誘導してしまうため、
 * 一致しなかったものは載せない。
 *
 * usage: node scripts/probeStayOfficial.mjs <候補定義.json>
 */
import fs from 'fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) DokoIko-LinkCheck/1.0' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cands = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

// 宿名から照合用のキーワードを作る（記号と一般語を落とす）
function keywords(name) {
  return name
    .replace(/[（(].*?[)）]/g, ' ')
    .split(/[\s　・]+/)
    .map((s) => s.replace(/^(ホテル|旅館|お宿|宿|温泉)$/, ''))
    .filter((s) => s.length >= 2);
}

const ok = [], ng = [];
for (const c of cands) {
  let hit = null;
  for (const url of c.urls) {
    try {
      const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (!r.ok) { await sleep(300); continue; }
      const html = await r.text();
      const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]?.replace(/\s+/g, ' ').trim() ?? '';
      const body = title + ' ' + html.slice(0, 4000);
      const kws = keywords(c.name);
      const matched = kws.filter((k) => body.includes(k));
      if (matched.length >= 1) {
        hit = { url: r.url, title: title.slice(0, 60), matched };
        break;
      }
      ng.push({ name: c.name, url, why: `titleに宿名が無い（${title.slice(0, 40)}）` });
    } catch (e) {
      ng.push({ name: c.name, url, why: String(e.message || e).slice(0, 50) });
    }
    await sleep(300);
  }
  if (hit) {
    ok.push({ id: c.id, name: c.name, ...hit });
    console.log(`✅ ${c.name.padEnd(28)} ${hit.url}`);
    console.log(`      title: ${hit.title}`);
  } else {
    console.log(`--  ${c.name.padEnd(28)} 確認できず`);
  }
  await sleep(400);
}

fs.writeFileSync('logs/stay_official.json', JSON.stringify(ok, null, 1));
console.log(`\n確認できた ${ok.length} / ${cands.length}件 → logs/stay_official.json`);
