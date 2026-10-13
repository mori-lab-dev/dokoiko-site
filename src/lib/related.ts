/**
 * related.ts — 旅先ページの「関連リンク」を決める（2026-10-13）。
 *
 * これまでの「近くの旅先」は、同じ地方（region）のデータ順の先頭8件で、実際には近くなかった
 * （九州なら福岡の次に鹿児島が並ぶ）。座標から距離を測って、県境をまたいでも近いものを出す。
 *
 *   nearby   座標が近い順（150km以内）。県をまたぐ近隣も拾う
 *   theme    その旅先がもつタグのうち、いちばん数が少ない（＝特徴的な）タグ。同じタグの旅先を、共有するタグが多く・近い順に
 *   samePref 同じ県（「長野県・岐阜県」のような表記はどちらの県からも同県）。掲載の重み順
 * どの一覧も、cards（カード8件）とは別に more（文字リンク8件）を持つ。カードは見た目、文字リンクは
 * 検索エンジンと読み上げに「何の旅先か」が伝わる内部リンク（アンカーに県名・距離・テーマを含める）。
 * 1つの旅先が複数の一覧に重ならないよう、前の一覧に出したものは次から除く。
 */
export type Dest = any;

const rad = (x: number) => (x * Math.PI) / 180;
export function distKm(a: Dest, b: Dest): number {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** 「長野県・岐阜県」のような県をまたぐ表記は、どちらの県から見ても同県として扱う */
export function sharesPrefecture(a: unknown, b: unknown): boolean {
  const split = (v: unknown) => String(v ?? '').split(/[・、,]/).map((x) => x.trim()).filter(Boolean);
  const bs = new Set(split(b));
  return split(a).some((x) => bs.has(x));
}

const hasXY = (d: Dest) => typeof d.lat === 'number' && typeof d.lng === 'number';
// 地域を問わず広く付いていて、テーマとして特徴にならないタグ
// 季節のタグ（春夏秋冬）は、旅先の種類ではなく見ごろなので、テーマの見出しにしない
const GENERIC_TAGS = new Set(['自然', '絶景', '観光', '日帰り', '春', '夏', '秋', '冬']);

let tagFreq: Map<string, number> | null = null;
function freqOf(all: Dest[]): Map<string, number> {
  if (tagFreq) return tagFreq;
  tagFreq = new Map();
  for (const d of all) for (const t of new Set<string>(d.tags || [])) tagFreq.set(t, (tagFreq.get(t) || 0) + 1);
  return tagFreq;
}

export type Related = {
  nearby: { d: Dest; km: number }[];
  nearbyMore: { d: Dest; km: number }[];
  themeTag: string | null;
  theme: Dest[];
  themeMore: Dest[];
  samePref: Dest[];
  samePrefMore: Dest[];
};

export function relatedFor(dest: Dest, all: Dest[], opts = { nearbyKm: 150, cards: 8, more: 8 }): Related {
  const { nearbyKm, cards, more } = opts;
  const others = all.filter((d) => d.id !== dest.id);
  const used = new Set<string>();
  const take = <T extends { id?: string }>(list: T[], idOf: (x: T) => string, n: number): T[] => {
    const out: T[] = [];
    for (const x of list) { if (out.length >= n) break; if (used.has(idOf(x))) continue; used.add(idOf(x)); out.push(x); }
    return out;
  };

  // 近い順
  const near = hasXY(dest)
    ? others.filter(hasXY).map((d) => ({ d, km: Math.round(distKm(dest, d)) })).filter((x) => x.km <= nearbyKm).sort((a, b) => a.km - b.km)
    : [];
  const nearbyAll = take(near, (x) => x.d.id, cards + more);
  const nearby = nearbyAll.slice(0, cards), nearbyMore = nearbyAll.slice(cards);

  // テーマ: 自分のタグのうち、特徴的（数が少なく、少なくとも4件は他にある）なもの
  const f = freqOf(all);
  const tags: string[] = (dest.tags || []).filter((t: string) => !GENERIC_TAGS.has(t));
  const themeTag = [...tags].filter((t) => (f.get(t) || 0) >= 5).sort((a, b) => (f.get(a) || 0) - (f.get(b) || 0))[0] ?? (dest.tags || [])[0] ?? null;
  const mine = new Set<string>(dest.tags || []);
  // 同じタグの旅先を、近いところから探す（300km以内 → 600km以内 → 全国の順に、足りなければ広げる）。
  // 同じ「寺社」でも、鎌倉の次に鹿児島の寺社が並ばないように。並びは共有するタグの数が多い順、同数なら近い順
  const sameTag = themeTag
    ? others.filter((d) => (d.tags || []).includes(themeTag))
        .map((d) => ({ d, shared: (d.tags || []).filter((t: string) => mine.has(t)).length, km: hasXY(dest) && hasXY(d) ? distKm(dest, d) : 9999 }))
    : [];
  const need = cards + more;
  const tier = [300, 600, Infinity].find((lim) => sameTag.filter((x) => x.km <= lim).length >= need) ?? Infinity;
  const themed = sameTag.filter((x) => x.km <= tier)
    .sort((a, b) => b.shared - a.shared || a.km - b.km || (b.d.weight ?? 1) - (a.d.weight ?? 1))
    .map((x) => x.d);
  const themeAll = take(themed, (d) => d.id, cards + more);

  // 同じ県（掲載の重み順）
  const pref = others.filter((d) => sharesPrefecture(d.prefecture, dest.prefecture)).sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1));
  const prefAll = take(pref, (d) => d.id, cards + more);

  return {
    nearby, nearbyMore, themeTag,
    theme: themeAll.slice(0, cards), themeMore: themeAll.slice(cards),
    samePref: prefAll.slice(0, cards), samePrefMore: prefAll.slice(cards),
  };
}
