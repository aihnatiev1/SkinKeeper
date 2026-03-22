import type { Metadata } from 'next';
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
  title: 'SkinKeeper — CS2 Inventory Manager & Portfolio Tracker',
  description:
    'Track your CS2 skin portfolio value, analyze profit & loss, sell on Steam Market from your phone, manage trades between accounts, and get price alerts. Free for iOS & Android.',
  icons: { icon: '/favicon.ico' },
  keywords: [
    'CS2 skins', 'CS2 inventory', 'CS2 portfolio', 'skin tracker',
    'CS2 profit loss', 'Steam Market sell', 'CS2 trade', 'skin prices',
    'CSGO skins', 'Counter-Strike skins', 'CS2 app', 'skin value tracker',
  ],
  openGraph: {
    title: 'SkinKeeper — Track, Trade & Profit from CS2 Skins',
    description:
      'Real-time portfolio tracking, P&L analytics, instant trades between accounts, price alerts, and market selling — all in one app.',
    url: 'https://skinkeeper.store',
    siteName: 'SkinKeeper',
    type: 'website',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SkinKeeper — CS2 Inventory Manager',
    description:
      'Track your CS2 skin portfolio, analyze profit & loss, sell from your phone.',
  },
  robots: {
    index: true,
    follow: true,
  },
  metadataBase: new URL('https://skinkeeper.store'),
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
