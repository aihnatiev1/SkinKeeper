import { createOgImage, ogSize } from '@/lib/og-image';

export const runtime = 'edge';
export const alt = 'SkinKeeper Deals — CS2 Skin Arbitrage Opportunities';
export const size = ogSize;
export const contentType = 'image/png';

export default function OgImage() {
  return createOgImage(
    'Arbitrage Deals',
    'Find profitable opportunities — buy low on Buff/CSFloat, sell high on Steam Market'
  );
}
