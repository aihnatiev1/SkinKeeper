import Link from 'next/link';
import type { Metadata } from 'next';
import { Monitor, Apple, Puzzle, Smartphone, ArrowLeft, Shield, Zap, RefreshCw, ChevronRight } from 'lucide-react';
import { ScreenshotCarousel } from '@/components/screenshot-carousel';

export const metadata: Metadata = {
  title: 'Download SkinKeeper — CS2 Inventory Manager',
  description: 'Download SkinKeeper for Windows, macOS, Linux, iOS, Android, and Chrome. Free CS2 inventory manager with real-time prices.',
  alternates: { canonical: 'https://skinkeeper.store/download' },
};

const desktopPlatforms = [
  {
    name: 'Windows',
    desc: 'Windows 10+',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 5.3l9.5-1.3v8h-9.5V5.3zm0 7.2h9.5v8l-9.5-1.3V12.5z" />
      </svg>
    ),
    href: '/downloads/SkinKeeper-Windows.zip',
    note: 'ZIP Archive — 141 MB',
  },
  {
    name: 'macOS',
    desc: 'Intel & Apple Silicon',
    icon: <Apple size={28} />,
    href: '/downloads/SkinKeeper-macOS.zip',
    note: 'ZIP Archive — 326 MB',
  },
  {
    name: 'Linux',
    desc: 'x64',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.5 2c-1.7 0-2.7 1.2-3.2 2.5-.4 1.1-.5 2.4-.5 3.5 0 .8.1 1.7.4 2.5l-.2.2c-.5.6-1.1 1.3-1.5 2.1-.5.9-.8 2-.5 3.1.1.5.4 1 .7 1.4-1 .5-1.8 1-2.2 1.7-.5.8-.5 1.7-.1 2.4.5 1 1.8 1.6 3.5 1.6.7 0 1.5-.1 2.2-.3.6.2 1.3.3 2 .3 1.7 0 3-.6 3.5-1.6.4-.7.4-1.6-.1-2.4-.4-.7-1.2-1.2-2.2-1.7.3-.4.6-.9.7-1.4.3-1.1 0-2.2-.5-3.1-.4-.8-1-1.5-1.5-2.1l-.2-.2c.3-.8.4-1.7.4-2.5 0-1.1-.1-2.4-.5-3.5C15.2 3.2 14.2 2 12.5 2z" />
      </svg>
    ),
    href: '/downloads/SkinKeeper.AppImage',
    note: 'AppImage — 134 MB',
  },
];

const mobilePlatforms = [
  {
    name: 'iOS',
    desc: 'iPhone & iPad',
    icon: <Apple size={24} />,
    url: 'https://apps.apple.com/us/app/skinkeeper/id6760600231',
    badge: 'App Store',
  },
  {
    name: 'Android',
    desc: 'Phone & Tablet',
    icon: <Smartphone size={24} />,
    url: 'https://play.google.com/store/apps/details?id=store.skinkeeper.app',
    badge: 'Google Play',
  },
];

export default function DownloadPage() {
  return (
    <div className="min-h-screen relative">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-strong">
        <div className="flex items-center justify-between px-6 lg:px-16 h-16 max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="text-xl font-bold text-gradient">SkinKeeper</span>
          </Link>
          <Link
            href="/login"
            className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
          >
            Sign in with Steam
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-28 pb-12 lg:pt-36 lg:pb-16">
        <div className="absolute inset-0 gradient-hero" />
        <div className="absolute inset-0 dot-pattern opacity-30" />
        <div className="relative z-10 px-6 lg:px-16 text-center max-w-4xl mx-auto">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors mb-6">
            <ArrowLeft size={14} />
            Back to home
          </Link>
          <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight mb-4 tracking-tight">
            Download <span className="text-gradient">SkinKeeper</span>
          </h1>
          <p className="text-lg text-muted max-w-2xl mx-auto">
            Available everywhere. Your CS2 inventory syncs across all devices.
          </p>
        </div>
      </section>

      {/* Desktop */}
      <section className="relative z-10 px-6 lg:px-16 max-w-5xl mx-auto pb-16">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Monitor size={22} className="text-primary" />
          Desktop
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {desktopPlatforms.map((p) => (
            <a
              key={p.name}
              href={p.href}
              download
              className="glass rounded-2xl p-6 hover:bg-surface-light transition-all group"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
                  {p.icon}
                </div>
                <div>
                  <div className="font-semibold text-lg">{p.name}</div>
                  <div className="text-sm text-muted">{p.desc}</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">{p.note}</span>
                <span className="text-sm font-medium text-primary group-hover:translate-x-0.5 transition-transform">
                  Download &rarr;
                </span>
              </div>
            </a>
          ))}
        </div>

        {/* Desktop features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {[
            { icon: <Zap size={16} />, text: 'Storage unit management & bulk operations' },
            { icon: <RefreshCw size={16} />, text: 'Auto-updates — always the latest version' },
            { icon: <Shield size={16} />, text: 'Secure Steam login with encrypted credentials' },
          ].map((f, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm text-muted px-1">
              <span className="text-primary">{f.icon}</span>
              {f.text}
            </div>
          ))}
        </div>

        {/* macOS Gatekeeper note */}
        <details className="mt-6 glass rounded-xl text-sm">
          <summary className="px-5 py-3 cursor-pointer font-medium text-muted hover:text-foreground transition-colors list-none flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Apple size={16} />
              macOS: &quot;Cannot verify developer&quot; warning?
            </span>
            <ChevronRight size={14} className="text-muted transition-transform [details[open]>&]:rotate-90" />
          </summary>
          <div className="px-5 pb-4 text-muted leading-relaxed space-y-2">
            <p>macOS may block the app because it is not yet notarized with Apple. To fix this:</p>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Unzip the downloaded archive</li>
              <li>Open <span className="font-mono text-xs text-foreground px-1.5 py-0.5 rounded bg-surface-light">Terminal</span></li>
              <li>
                Run: <code className="font-mono text-xs text-primary px-1.5 py-0.5 rounded bg-surface-light">xattr -cr ~/Downloads/SkinKeeper.app</code>
              </li>
              <li>Open SkinKeeper normally</li>
            </ol>
            <p className="text-xs text-muted/60 pt-1">
              Apple notarization is coming soon. This step will no longer be needed.
            </p>
          </div>
        </details>
      </section>

      {/* Mobile */}
      <section className="relative z-10 px-6 lg:px-16 max-w-5xl mx-auto pb-16">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Smartphone size={22} className="text-primary" />
          Mobile
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
          {mobilePlatforms.map((p) => (
            <a
              key={p.name}
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="glass rounded-2xl p-6 hover:bg-surface-light transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
                  {p.icon}
                </div>
                <div>
                  <div className="font-semibold text-lg">{p.name}</div>
                  <div className="text-sm text-muted">{p.desc}</div>
                </div>
                <span className="ml-auto text-sm font-medium text-primary group-hover:translate-x-0.5 transition-transform">
                  {p.badge} &rarr;
                </span>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* Browser Extension */}
      <section className="relative z-10 px-6 lg:px-16 max-w-5xl mx-auto pb-16">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Puzzle size={22} className="text-primary" />
          Browser Extension
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div>
            <a
              href="/downloads/SkinKeeper-Extension.zip"
              download
              className="glass rounded-2xl p-6 hover:bg-surface-light transition-all group flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors shrink-0">
                <Puzzle size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-lg">Chrome Extension</div>
                <div className="text-sm text-muted">Prices, floats & quick-sell on every Steam page</div>
              </div>
              <span className="text-sm font-medium text-primary group-hover:translate-x-0.5 transition-transform shrink-0">
                Download &rarr;
              </span>
            </a>
            <p className="text-xs text-muted mt-3 px-1">
              Free. Works on Chrome, Edge, Brave, and other Chromium browsers.
            </p>
            <div className="mt-4 space-y-2 px-1">
              {[
                'Real market prices on every Steam inventory item',
                'Float values, paint seeds & Doppler phases',
                'Quick Sell & Instant Sell buttons',
                'Trade offer value comparison',
                'Inspect in-game directly from browser',
              ].map((f) => (
                <div key={f} className="flex items-center gap-2.5 text-sm text-muted">
                  <span className="text-primary"><Zap size={12} /></span>
                  {f}
                </div>
              ))}
            </div>
          </div>
          <ScreenshotCarousel
            slides={[
              { src: '/screenshots/ext-inventory.png', alt: 'Extension — Inventory with prices', caption: 'Real prices and item details on Steam inventory' },
              { src: '/screenshots/ext-item-detail.png', alt: 'Extension — Item detail with sell buttons', caption: 'Quick Sell & Instant Sell right from Steam' },
              { src: '/screenshots/ext-bulk-ops.png', alt: 'Extension — Bulk operations', caption: 'Bulk operations with cancel, export & dashboard' },
              { src: '/screenshots/ext-inspect.png', alt: 'Extension — Inspect in-game', caption: 'Inspect skins in-game directly from browser' },
              { src: '/screenshots/ext-trade.png', alt: 'Extension — Trade enhancements', caption: 'Trade offer totals and profit/loss calculation' },
            ]}
          />
        </div>
      </section>

      {/* Web App Preview */}
      <section className="relative z-10 px-6 lg:px-16 max-w-5xl mx-auto pb-20">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Monitor size={22} className="text-primary" />
          Web App
        </h2>
        <div className="max-w-4xl">
          <ScreenshotCarousel
            slides={[
              { src: '/screenshots/web-inventory.png', alt: 'Web App — Inventory', caption: 'Full inventory management with DMarket-style cards' },
            ]}
            autoPlay={false}
          />
        </div>
        <p className="text-sm text-muted mt-4 px-1">
          Access your full inventory, portfolio analytics, trades, and market operations from any browser at{' '}
          <Link href="/" className="text-primary hover:underline">skinkeeper.store</Link>
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50">
        <div className="max-w-5xl mx-auto px-6 lg:px-16 py-8 flex items-center justify-between text-sm text-muted">
          <span>&copy; {new Date().getFullYear()} SkinKeeper</span>
          <div className="flex gap-4">
            <Link href="/legal/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link href="/legal/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
