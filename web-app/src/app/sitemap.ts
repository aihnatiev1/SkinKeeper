import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://skinkeeper.store';
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/portfolio`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/inventory`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/market`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/deals`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/watchlist`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/trades`, lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/transactions`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${base}/alerts`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/legal/terms`, lastModified: new Date('2026-03-15'), changeFrequency: 'monthly', priority: 0.3 },
    { url: `${base}/legal/privacy`, lastModified: new Date('2026-03-15'), changeFrequency: 'monthly', priority: 0.3 },
  ];
}
