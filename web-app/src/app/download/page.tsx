import Link from 'next/link';
import type { Metadata } from 'next';
import { Monitor, Apple, Puzzle, Smartphone, ArrowLeft, Shield, Zap, RefreshCw } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Download SkinKeeper — CS2 Inventory Manager',
  description: 'Download SkinKeeper for Windows, macOS, Linux, iOS, Android, and Chrome. Free CS2 inventory manager with real-time prices.',
  alternates: { canonical: 'https://skinkeeper.store/download' },
};

const GITHUB_RELEASES = 'https://github.com/aihnatiev1/SkinKeeper/releases/latest';

const desktopPlatforms = [
  {
    name: 'Windows',
    desc: 'Windows 10+',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 12V6.5l8-1.1V12H3zm0 .5h8v6.6l-8-1.1V12.5zM11.5 5.3l9.5-1.3v8h-9.5V5.3zm0 7.2h9.5v8l-9.5-1.3V12.5z" />
      </svg>
    ),
    file: 'SkinKeeper-Setup.exe',
    note: 'NSIS Installer',
  },
  {
    name: 'macOS',
    desc: 'Intel & Apple Silicon',
    icon: <Apple size={28} />,
    file: 'SkinKeeper.dmg',
    note: 'Universal Binary',
  },
  {
    name: 'Linux',
    desc: 'x64',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.5 2c-1.7 0-2.7 1.2-3.2 2.5-.4 1.1-.5 2.4-.5 3.5 0 .8.1 1.7.4 2.5l-.2.2c-.5.6-1.1 1.3-1.5 2.1-.5.9-.8 2-.5 3.1.1.5.4 1 .7 1.4-1 .5-1.8 1-2.2 1.7-.5.8-.5 1.7-.1 2.4.5 1 1.8 1.6 3.5 1.6.7 0 1.5-.1 2.2-.3.6.2 1.3.3 2 .3 1.7 0 3-.6 3.5-1.6.4-.7.4-1.6-.1-2.4-.4-.7-1.2-1.2-2.2-1.7.3-.4.6-.9.7-1.4.3-1.1 0-2.2-.5-3.1-.4-.8-1-1.5-1.5-2.1l-.2-.2c.3-.8.4-1.7.4-2.5 0-1.1-.1-2.4-.5-3.5C15.2 3.2 14.2 2 12.5 2z" />
      </svg>
    ),
    file: 'SkinKeeper.AppImage',
    note: 'AppImage',
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
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
              SK
            </div>
            <span className="text-lg font-bold">SkinKeeper</span>
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
              href={`${GITHUB_RELEASES}/download/${p.file}`}
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
              rel="noopener"
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
      <section className="relative z-10 px-6 lg:px-16 max-w-5xl mx-auto pb-20">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Puzzle size={22} className="text-primary" />
          Browser Extension
        </h2>
        <a
          href="https://chromewebstore.google.com/detail/skinkeeper/placeholder"
          target="_blank"
          rel="noopener"
          className="glass rounded-2xl p-6 hover:bg-surface-light transition-all group inline-flex items-center gap-4 max-w-md"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary/20 transition-colors">
            <Puzzle size={24} />
          </div>
          <div>
            <div className="font-semibold text-lg">Chrome Extension</div>
            <div className="text-sm text-muted">Prices, floats & quick-sell on every Steam page</div>
          </div>
          <span className="ml-auto text-sm font-medium text-primary group-hover:translate-x-0.5 transition-transform">
            Install &rarr;
          </span>
        </a>
        <p className="text-xs text-muted mt-3 px-1">
          Free. Works on Chrome, Edge, Brave, and other Chromium browsers.
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
