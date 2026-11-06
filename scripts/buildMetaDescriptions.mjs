// 旅先ページのメタ description のうち、所要時間の文を含むものを dest.description から作り直す（2026-11-06）。
// 現在のメタ description は seo / carFree.seo → article.lead の先頭120字 → dest.description の順（src/pages/destinations/[id].astro）。
// 規則（前回の description 方針案）:
//   ・記事の冒頭ではなく dest.description から作る。文の切れ目（。）で、最大3文・110字以内。改行なし
//   ・所要時間の文（「…から約N分」「車で約N分」「徒歩約N分」「N時間」＋移動の語）は含めない
//   ・評価の言い回し（正解だ・気持ちいい・最高 など）、禁止句・推測表現を含む文は除く
//   ・ページにある語と数字だけ（dest.description の文をそのまま使う）。足りないときは「県の旅先名。見どころA・B・Cなどを紹介します。」
// 使い方: node scripts/buildMetaDescriptions.mjs [--dry]
import fs from 'fs';
import path from 'path';
import { root, splitSentences } from './travelTimeBound.mjs';
import { NG_PHRASES, NG_HEDGE } from './descStyleCheck.mjs';

const dry = process.argv.includes('--dry');
const FILE = path.join(root, 'src/data/destinations.json');
const dests = JSON.parse(fs.readFileSync(FILE, 'utf8'));

// 所要時間の文: 時間の数字（分・時間・時間半）と、移動の語を同じ文に含む
const DURATION = /[0-9０-９]+\s*(?:分|時間)|[一二三四五六七八九十]+時間|時間半/;
const MOVE = /から|より|発|着く|着け|行ける|行け|アクセス|車|電車|特急|新幹線|急行|快速|バス|船|フェリー|飛行機|フライト|徒歩|歩いて|乗り換え|乗換|ドライブ|運転/;
export const isTravelTimeSentence = (s) => DURATION.test(s) && MOVE.test(s);
const EVAL = /正解|気持ちい|気持ちよ|最高|おすすめ|オススメ|絶対|ぜひ|贅沢|素晴らしい|すばらしい|見逃せ|間違いな|たまらな|堪らな|感動|心地|至福|格別|正直|と思う|と感じ|癒/;
const bad = (s) => EVAL.test(s) || NG_PHRASES.some((p) => s.includes(p)) || NG_HEDGE.some((p) => s.includes(p));

export const metaNow = (d) => {
  const sc = d.seo ?? d.carFree?.seo;
  if (sc?.description) return { text: sc.description, src: 'seo' };
  const art = path.join(root, 'src/data/articles', `${d.id}.json`);
  if (fs.existsSync(art)) { const lead = JSON.parse(fs.readFileSync(art, 'utf8')).lead; if (lead) return { text: lead.slice(0, 120), src: 'lead' }; }
  const t = d.description || '';
  const text = t.length <= 130 ? t : (() => { const head = t.slice(0, 130); const cut = head.lastIndexOf('。'); return cut >= 60 ? head.slice(0, cut + 1) : head.slice(0, 118) + '…'; })();
  return { text, src: 'description' };
};

export function buildMeta(d) {
  const picks = [];
  let len = 0;
  for (const s0 of splitSentences(d.description).map((x) => x.trim()).filter(Boolean)) {
    if (isTravelTimeSentence(s0) || bad(s0)) continue;
    // 110字以内。短すぎる（60字未満）ときだけ、120字までの文を足す
    if (len + s0.length > (len < 60 ? 120 : 110)) { if (picks.length) break; else continue; }
    picks.push(s0); len += s0.length;
    if (picks.length >= 3) break;
  }
  const text = picks.join('');
  if (text.length >= 40) return { text, how: 'description' };
  const spots = (d.spots || []).map((s) => (typeof s === 'object' ? s.name : s)).filter(Boolean).slice(0, 3);
  if (spots.length) return { text: `${d.prefecture}の${d.name}。${spots.join('・')}などの見どころを紹介します。`, how: 'fallback' };
  return { text: `${d.name}（${d.prefecture}）への行き方・宿・観光スポット情報。`, how: 'fallback' };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const stat = { affected: 0, bySrc: {}, fromDescription: 0, fallback: 0, skippedHandwritten: 0, lens: [] };
  const changes = [];
  for (const d of dests) {
    const cur = metaNow(d);
    if (!(isTravelTimeSentence(cur.text) || splitSentences(cur.text).some(isTravelTimeSentence))) continue;
    if (cur.src === 'seo' && !d.seo?.auto) { stat.skippedHandwritten++; continue; }
    stat.affected++; stat.bySrc[cur.src] = (stat.bySrc[cur.src] || 0) + 1;
    const nx = buildMeta(d);
    stat[nx.how === 'description' ? 'fromDescription' : 'fallback']++;
    stat.lens.push([...nx.text].length);
    changes.push({ id: d.id, name: d.name, was: cur.text.replace(/\n/g, '／'), now: nx.text, how: nx.how, src: cur.src });
    if (!dry) d.seo = { ...(d.seo || {}), description: nx.text, auto: true };
  }
  stat.lens.sort((a, b) => a - b);
  console.log(JSON.stringify({ ...stat, lens: undefined, len: { min: stat.lens[0], median: stat.lens[stat.lens.length >> 1], max: stat.lens.at(-1) } }, null, 2));
  fs.mkdirSync(path.join(root, 'backup/travelTime_20261106'), { recursive: true });
  fs.writeFileSync(path.join(root, 'backup/travelTime_20261106/metaDescriptions.json'), JSON.stringify(changes, null, 2) + '\n');
  if (!dry) fs.writeFileSync(FILE, JSON.stringify(dests, null, 2) + '\n');
}
