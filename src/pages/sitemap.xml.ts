import type { APIRoute } from 'astro';
import destinations from '../data/destinations.json';
import hubCities from '../data/hubCities.json';
import { SCHEMES } from '../data/ouenWari';

export const GET: APIRoute = () => {
  const BASE = 'https://tabidokoiko.com';

  const urls: { loc: string; changefreq: string; priority: string }[] = [
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

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
