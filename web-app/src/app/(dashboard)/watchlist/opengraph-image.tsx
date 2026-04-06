import { createOgImage, ogSize } from '@/lib/og-image';

export const runtime = 'edge';
export const alt = 'SkinKeeper Watchlist — Track CS2 Skin Prices';
export const size = ogSize;
export const contentType = 'image/png';

export default function OgImage() {
  return createOgImage(
    'Price Watchlist',
    'Track items and get notified when prices drop to your target'
  );
}
