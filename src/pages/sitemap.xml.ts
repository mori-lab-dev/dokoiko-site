import type { APIRoute } from 'astro';
import destinations from '../data/destinations.json';
import hubCities from '../data/hubCities.json';
import { SCHEMES } from '../data/ouenWari';
import kagoshimaAreas from '../data/kagoshimaAreas.json';
// lastmod は git の履歴から出した実際の更新日だけ（scripts/buildLastmod.mjs）。日付が出せないページには付けない
import lastmod from '../data/lastmod.json';

export const GET: APIRoute = () => {
  const BASE = 'https://tabidokoiko.com';

  const urls: { loc: string; changefreq: string; priority: string; lastmod?: string }[] = [
    { loc: `${BASE}/`,              changefreq: 'weekly',  priority: '1.0' },
    { loc: `${BASE}/destinations/`, changefreq: 'weekly',  priority: '0.9' },
    { loc: `${BASE}/kyushu-fukko/`, changefreq: 'weekly',  priority: '0.9' },
    { loc: `${BASE}/ouen-wari/`,    changefreq: 'weekly',  priority: '0.9' },
    // 応援割の県別特設ページ。制度が増えれば SCHEMES に足すだけで載る
    ...SCHEMES.map(s => ({
      loc: `${BASE}/${s.slug}/`,
      changefreq: 'weekly',
      priority: '0.8',
    })),
    // かごしま観光応援割のエリア別ページ（公式のエリア区分に合わせた6枚）
    ...(kagoshimaAreas as any[]).map(a => ({
      loc: `${BASE}/kagoshima-oen/${a.slug}/`,
      changefreq: 'weekly',
      priority: '0.7',
    })),
    { loc: `${BASE}/about/`,        changefreq: 'yearly',  priority: '0.4' },
    { loc: `${BASE}/contact/`,      changefreq: 'yearly',  priority: '0.4' },
    { loc: `${BASE}/privacy/`,      changefreq: 'yearly',  priority: '0.3' },
    { loc: `${BASE}/terms/`,        changefreq: 'yearly',  priority: '0.3' },
    ...(destinations as any[]).map(d => ({
      loc: `${BASE}/destinations/${d.id}/`,
      changefreq: 'monthly',
      priority: '0.8',
    })),
    ...(hubCities as any[]).map(h => ({
      loc: `${BASE}/hub/${h.id}/`,
      changefreq: 'monthly',
      priority: '0.7',
    })),
  ];

  // 固定・特設ページは URL で、旅先ページは id で日付を引く
  const pageDates = (lastmod as any).pages as Record<string, string>;
  const destDates = (lastmod as any).destinations as Record<string, string>;
  for (const u of urls) {
    const p = u.loc.slice(BASE.length);
    const m = p.match(/^\/destinations\/([^/]+)\/$/);
    const d = m ? destDates[decodeURIComponent(m[1])] : pageDates[p];
    if (d) u.lastmod = d;
  }

  // loc は canonical タグ（Astro.url.href）と同じ%エンコード（RFC 3986・大文字16進）で書く。日本語のまま書かない
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${new URL(u.loc).href}</loc>
${u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>
` : ''}    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
