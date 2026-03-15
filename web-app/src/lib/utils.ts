import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatPrice(price: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function formatPriceChange(value: number, pct: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatPrice(value)} (${sign}${pct.toFixed(1)}%)`;
}

export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatRelativeTime(date: string): string {
  const now = new Date();
  const d = new Date(date);
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}

export function getSteamAvatarUrl(hash: string): string {
  if (hash.startsWith('http')) return hash;
  return `https://avatars.steamstatic.com/${hash}_full.jpg`;
}

export function getItemIconUrl(iconUrl: string | null | undefined): string | undefined {
  if (!iconUrl) return undefined;
  if (iconUrl.startsWith('http')) return iconUrl;
  return `https://community.akamai.steamstatic.com/economy/image/${iconUrl}/330x192`;
}

export function getWearShort(wear: string | null): string | null {
  if (!wear) return null;
  const map: Record<string, string> = {
    'Factory New': 'FN',
    'Minimal Wear': 'MW',
    'Field-Tested': 'FT',
    'Well-Worn': 'WW',
    'Battle-Scarred': 'BS',
  };
  return map[wear] || wear;
}
