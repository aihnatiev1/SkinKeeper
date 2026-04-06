import { createOgImage, ogSize } from '@/lib/og-image';

export const runtime = 'edge';
export const alt = 'SkinKeeper Market — Steam Market Listings & Sell Tools';
export const size = ogSize;
export const contentType = 'image/png';

export default function OgImage() {
  return createOgImage(
    'Steam Market',
    'Track your active listings, bulk sell from inventory, and calculate fees in real time'
  );
}
