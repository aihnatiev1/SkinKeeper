import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Providers } from './providers';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'SkinKeeper — CS2 Inventory Manager & Portfolio Tracker',
    template: '%s | SkinKeeper',
  },
  description:
    'Track your CS2 skin portfolio value, analyze profit & loss, sell on Steam Market, manage trades between accounts, and get price alerts. Free for iOS, Android & Web.',
  icons: { icon: '/favicon.ico', apple: '/icons/apple-touch-icon.png' },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SkinKeeper',
  },
  keywords: [
    'CS2 skins', 'CS2 inventory', 'CS2 portfolio', 'skin tracker',
    'CS2 profit loss', 'Steam Market sell', 'CS2 trade', 'skin prices',
    'CSGO skins', 'Counter-Strike skins', 'CS2 app', 'skin value tracker',
    'CS2 inventory manager', 'steam skin portfolio', 'CS2 market analytics',
  ],
  openGraph: {
    title: 'SkinKeeper — Track, Trade & Profit from CS2 Skins',
    description:
      'Real-time portfolio tracking, P&L analytics, instant trades between accounts, price alerts, and market selling — all in one platform.',
    url: 'https://skinkeeper.store',
    siteName: 'SkinKeeper',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SkinKeeper — CS2 Inventory Manager',
    description:
      'Track your CS2 skin portfolio, analyze profit & loss, trade between accounts, and sell on Steam Market.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://skinkeeper.store',
  },
  metadataBase: new URL('https://skinkeeper.store'),
};

export const viewport: Viewport = {
  themeColor: '#6366F1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
