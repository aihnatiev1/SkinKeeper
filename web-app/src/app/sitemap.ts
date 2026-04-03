import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://skinkeeper.store',
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: 'https://skinkeeper.store/legal/terms',
      lastModified: new Date('2026-03-15'),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: 'https://skinkeeper.store/legal/privacy',
      lastModified: new Date('2026-03-15'),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];
}
