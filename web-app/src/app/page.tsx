import Link from 'next/link';
import { cookies } from 'next/headers';

import {
  LayoutDashboard,
  Backpack,
  ArrowLeftRight,
  TrendingUp,
  Shield,
  Zap,
  Bell,
  BarChart3,
  Globe,
  Smartphone,
  Star,
  ChevronRight,
  Check,
  ArrowRight,
  Sparkles,
  Monitor,
  Puzzle,
  Layers,
} from 'lucide-react';

export default async function LandingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sk_token');
  const isLoggedIn = !!token?.value;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        name: 'SkinKeeper',
        url: 'https://skinkeeper.store',
        description: 'CS2 inventory manager with real-time portfolio tracking, P&L analytics, instant trades, price alerts, and Steam Market selling.',
        applicationCategory: 'GameApplication',
        operatingSystem: 'iOS, Android, Web, Chrome Extension, Windows, macOS',
        offers: [
          { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Free' },
          { '@type': 'Offer', price: '4.99', priceCurrency: 'USD', name: 'Pro Monthly' },
          { '@type': 'Offer', price: '34.99', priceCurrency: 'USD', name: 'Pro Yearly' },
        ],
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.8',
          ratingCount: '1200',
          bestRating: '5',
        },
      },
      {
        '@type': 'Organization',
        name: 'SkinKeeper',
        url: 'https://skinkeeper.store',
        logo: 'https://skinkeeper.store/opengraph-image',
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: 'Is SkinKeeper safe to use?',
            acceptedAnswer: { '@type': 'Answer', text: 'We use Steam OpenID for authentication — we never see or store your Steam password. Your items remain in your Steam account at all times.' },
          },
          {
            '@type': 'Question',
            name: 'How do prices get updated?',
            acceptedAnswer: { '@type': 'Answer', text: 'We fetch prices from Steam Market, Skinport, and CSFloat every few minutes. Pro users get access to all price sources with priority updates.' },
          },
          {
            '@type': 'Question',
            name: 'Can I manage multiple Steam accounts?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes! Link as many Steam accounts as you want and switch between them instantly. See combined portfolio values or filter by account.' },
          },
          {
            '@type': 'Question',
            name: 'Is the app free?',
            acceptedAnswer: { '@type': 'Answer', text: 'Yes, the core app is completely free on iOS, Android, Web, and Desktop. The Chrome Extension is also free. Pro features are available via subscription.' },
          },
          {
            '@type': 'Question',
            name: 'What does the Chrome Extension do?',
            acceptedAnswer: { '@type': 'Answer', text: 'The SkinKeeper Chrome Extension enhances Steam directly in your browser. See real market prices, float values, and quick-trade buttons right on Steam inventory and market pages.' },
          },
          {
            '@type': 'Question',
            name: 'How does selling on Steam Market work?',
            acceptedAnswer: { '@type': 'Answer', text: 'After authenticating your Steam session, you can list items directly on the Steam Market from within the app. We handle the listing process and track your operations.' },
          },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen relative">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* ─── Navigation ────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-strong">
        <div className="flex items-center justify-between px-6 lg:px-16 h-16 max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="text-xl font-bold text-gradient">SkinKeeper</span>
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-muted">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </div>
          <Link
            href={isLoggedIn ? '/portfolio' : '/login'}
            className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98]"
          >
            {isLoggedIn ? 'Go to Dashboard' : 'Sign in with Steam'}
          </Link>
        </div>
      </nav>

      {/* ─── Hero ──────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 lg:pt-44 lg:pb-32 overflow-hidden">
        {/* Background effects */}
        <div className="absolute inset-0 gradient-hero" />
        <div className="absolute inset-0 dot-pattern opacity-30" />

        {/* Floating decorative orbs */}
        <div className="absolute top-20 left-[10%] w-32 h-32 rounded-full bg-primary/10 blur-2xl animate-float pointer-events-none hidden lg:block" />
        <div className="absolute top-40 right-[8%] w-40 h-40 rounded-full bg-accent/8 blur-3xl animate-float-delayed pointer-events-none hidden lg:block" />
        <div className="absolute bottom-20 left-[5%] w-24 h-24 rounded-full bg-primary/6 blur-2xl animate-float pointer-events-none hidden xl:block" style={{ animationDelay: '2s' }} />
        <div className="absolute top-1/2 right-[15%] w-20 h-20 rounded-full bg-warning/6 blur-xl animate-pulse-glow pointer-events-none hidden lg:block" />

        <div className="relative z-10 px-6 lg:px-16 text-center max-w-5xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-sm font-medium mb-8 animate-slide-up">
            <Sparkles size={14} className="text-primary" />
            <span className="text-muted">The #1 CS2 Ecosystem</span>
            <ChevronRight size={14} className="text-muted" />
          </div>

          {/* Title */}
          <h1 className="text-5xl lg:text-7xl font-extrabold leading-[1.1] mb-6 tracking-tight">
            Track, Trade & Profit
            <br />
            <span className="text-gradient">from your CS2 skins</span>
          </h1>

          {/* Subtitle */}
          <p className="text-lg lg:text-xl text-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            The complete ecosystem for your CS2 skins — enhanced inventory management, live market data,
            and powerful automation. On mobile, web, desktop, and right inside Steam.
          </p>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <Link
              href="/login"
              className="group px-8 py-3.5 bg-primary hover:bg-primary-hover text-white rounded-2xl text-base font-bold transition-all hover:shadow-xl hover:shadow-primary/25 active:scale-[0.98] flex items-center gap-2"
            >
              Get Started — Free
              <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <a
              href="#features"
              className="px-8 py-3.5 glass hover:bg-surface-light text-foreground rounded-2xl text-base font-semibold transition-all flex items-center gap-2"
            >
              See Features
            </a>
          </div>

          {/* Platform ecosystem pills */}
          <div className="flex flex-wrap justify-center gap-3">
            {[
              { icon: <Monitor size={16} />, name: 'Desktop', accent: 'text-accent', ring: 'bg-accent/10 border-accent/20 hover:border-accent/50 hover:bg-accent/15', href: 'https://skinkeeper.store/download', external: true },
              { icon: <Smartphone size={16} />, name: 'iOS & Android', accent: 'text-profit', ring: 'bg-profit/10 border-profit/20 hover:border-profit/50 hover:bg-profit/15', href: 'https://apps.apple.com/us/app/skinkeeper/id6760600231', external: true },
              { icon: <Puzzle size={16} />, name: 'Chrome Extension', accent: 'text-warning', ring: 'bg-warning/10 border-warning/20 hover:border-warning/50 hover:bg-warning/15', href: 'https://chromewebstore.google.com/detail/skinkeeper-%E2%80%94-cs2-inventor/lbihgifhfhpeahokiegleeknffkihbpd', external: true },
              { icon: <Globe size={16} />, name: 'Web App', accent: 'text-primary', ring: 'bg-primary/10 border-primary/20 hover:border-primary/50 hover:bg-primary/15', href: '/login', external: false },
            ].map((p) => (
              p.external
                ? <a key={p.name} href={p.href} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${p.ring} text-sm font-medium transition-all cursor-pointer`}>
                    <span className={p.accent}>{p.icon}</span>
                    <span>{p.name}</span>
                  </a>
                : <Link key={p.name} href={p.href} className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border ${p.ring} text-sm font-medium transition-all cursor-pointer`}>
                    <span className={p.accent}>{p.icon}</span>
                    <span>{p.name}</span>
                  </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Ecosystem ─────────────────────────────────────────────── */}
      <section className="relative px-6 lg:px-16 py-16 mb-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-sm font-medium mb-4">
              <Layers size={14} className="text-primary" />
              <span className="text-muted">Complete Ecosystem</span>
            </div>
            <h2 className="text-3xl lg:text-5xl font-extrabold mb-4">
              One account. <span className="text-gradient">Every platform.</span>
            </h2>
            <p className="text-lg text-muted max-w-xl mx-auto">
              Your inventory, trades, and P&L stay in sync across every surface. Use what fits the moment.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Desktop */}
            <div className="group glass rounded-2xl p-6 hover:border-accent/30 transition-all duration-300 relative overflow-hidden card-shine">
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-accent/6 group-hover:bg-accent/12 transition-colors pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
                    <Monitor size={22} className="text-accent" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">Desktop App</h3>
                    <p className="text-xs text-accent font-semibold tracking-wide uppercase">Windows & macOS</p>
                  </div>
                </div>
                <p className="text-sm text-muted mb-4 leading-relaxed">
                  Automate your collection. Set rules to fill storage units, run bulk transfers, and manage multiple accounts from one window.
                </p>
                <ul className="space-y-1.5 mb-5">
                  {[
                    'Storage unit automation rules',
                    'Bulk transfers between accounts',
                    'Multi-account overview in one window',
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted">
                      <div className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href="https://skinkeeper.store/download" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors">
                  <Monitor size={12} />
                  Download Free
                </a>
              </div>
            </div>

            {/* Mobile */}
            <div className="group glass rounded-2xl p-6 hover:border-profit/30 transition-all duration-300 relative overflow-hidden card-shine">
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-profit/6 group-hover:bg-profit/12 transition-colors pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-profit/15 flex items-center justify-center shrink-0">
                    <Smartphone size={22} className="text-profit" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">Mobile App</h3>
                    <p className="text-xs text-profit font-semibold tracking-wide uppercase">iOS & Android</p>
                  </div>
                </div>
                <p className="text-sm text-muted mb-4 leading-relaxed">
                  Your skins in your pocket. Track portfolio value, get price-drop alerts, and send trades from anywhere.
                </p>
                <ul className="space-y-1.5 mb-5">
                  {[
                    'Real-time portfolio value & daily P&L',
                    'Push notifications for price alerts',
                    'Trade management on the go',
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted">
                      <div className="w-1.5 h-1.5 rounded-full bg-profit shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <a href="https://apps.apple.com/us/app/skinkeeper/id6760600231" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
                    App Store
                  </a>
                  <a href="https://play.google.com/store/apps/details?id=store.skinkeeper.app" target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.72c-.36-.18-.64-.46-.82-.82l-.02-.04C2.12 22.42 2 21.88 2 21.28V2.72c0-.6.12-1.14.34-1.58l9.92 9.92-9.08 12.66zm.74-22.38c.24-.22.56-.34.92-.34h.04c.24 0 .52.08.82.24L17.6 7.7 14.06 11.24 3.92 1.34zM21.54 10.88c.56.32.88.8.88 1.36 0 .56-.36 1.08-.88 1.36l-2.74 1.56-3.84-3.84 3.84-3.84 2.74 1.4zM17.6 16.3L5.7 22.76c-.3.16-.58.24-.82.24-.36 0-.68-.12-.92-.34L14.06 12.76 17.6 16.3z" /></svg>
                    Google Play
                  </a>
                </div>
              </div>
            </div>

            {/* Extension */}
            <div className="group glass rounded-2xl p-6 hover:border-warning/30 transition-all duration-300 relative overflow-hidden card-shine">
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-warning/6 group-hover:bg-warning/12 transition-colors pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
                    <Puzzle size={22} className="text-warning" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">Chrome Extension</h3>
                    <p className="text-xs text-warning font-semibold tracking-wide uppercase">Lives inside Steam</p>
                  </div>
                </div>
                <p className="text-sm text-muted mb-4 leading-relaxed">
                  Enhanced right inside Steam. Real prices, float values, and overpriced warnings appear on every inventory and market page — no tab switching.
                </p>
                <ul className="space-y-1.5 mb-5">
                  {[
                    'Real market prices on every Steam page',
                    'Float values & overpriced item warnings',
                    'Quick sell & price check without leaving Steam',
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted">
                      <div className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <a href="https://chromewebstore.google.com/detail/skinkeeper-%E2%80%94-cs2-inventor/lbihgifhfhpeahokiegleeknffkihbpd" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors">
                  <Puzzle size={12} />
                  Add to Chrome
                </a>
              </div>
            </div>

            {/* Web */}
            <div className="group glass rounded-2xl p-6 hover:border-primary/30 transition-all duration-300 relative overflow-hidden card-shine">
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-primary/6 group-hover:bg-primary/12 transition-colors pointer-events-none" />
              <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <Globe size={22} className="text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">Web App</h3>
                    <p className="text-xs text-primary font-semibold tracking-wide uppercase">skinkeeper.store</p>
                  </div>
                </div>
                <p className="text-sm text-muted mb-4 leading-relaxed">
                  Full dashboard power. Deep analytics, bulk market selling, and complete inventory control from any browser.
                </p>
                <ul className="space-y-1.5 mb-5">
                  {[
                    'P&L analytics with full trade history',
                    'Bulk sell items to Steam Market',
                    'Multi-source price comparison',
                  ].map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/login"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 glass rounded-lg text-xs font-medium hover:bg-surface-light transition-colors">
                  Open Web App
                  <ArrowRight size={12} />
                </Link>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ─── Features Grid ─────────────────────────────────────────── */}
      <section id="features" className="px-6 lg:px-16 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-sm font-medium mb-4">
            <Zap size={14} className="text-accent" />
            <span className="text-muted">Powerful Features</span>
          </div>
          <h2 className="text-3xl lg:text-5xl font-extrabold mb-4">
            Everything you need to <span className="text-gradient">manage your skins</span>
          </h2>
          <p className="text-muted max-w-2xl mx-auto">
            From real-time tracking to instant trades — SkinKeeper gives you complete control over your CS2 inventory.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            {
              icon: <LayoutDashboard size={24} />,
              title: 'Portfolio Dashboard',
              desc: 'Track total value, daily changes, and historical performance across all your Steam accounts in real-time.',
              gradient: 'from-primary/10 to-transparent',
            },
            {
              icon: <TrendingUp size={24} />,
              title: 'P&L Analytics',
              desc: 'See profit & loss per item with cost basis from Steam Market transactions. Know exactly what you earned.',
              gradient: 'from-profit/10 to-transparent',
            },
            {
              icon: <Backpack size={24} />,
              title: 'Inventory Management',
              desc: 'Browse, search, and filter your inventory. Compare prices across Steam, Skinport, and CSFloat.',
              gradient: 'from-accent/10 to-transparent',
            },
            {
              icon: <ArrowLeftRight size={24} />,
              title: 'Quick Trades',
              desc: 'Send trades to friends or transfer items between your own accounts with just a few clicks.',
              gradient: 'from-warning/10 to-transparent',
            },
            {
              icon: <Shield size={24} />,
              title: 'Multi-Account',
              desc: 'Link multiple Steam accounts and manage them all from one unified dashboard. Switch instantly.',
              gradient: 'from-primary/10 to-transparent',
            },
            {
              icon: <Bell size={24} />,
              title: 'Price Alerts',
              desc: 'Set price targets and get notified instantly when items hit your desired price. Never miss a deal.',
              gradient: 'from-loss/10 to-transparent',
            },
            {
              icon: <BarChart3 size={24} />,
              title: 'Market Selling',
              desc: 'List items on Steam Market directly from the app. Bulk sell with operation tracking and fee breakdown.',
              gradient: 'from-accent/10 to-transparent',
            },
            {
              icon: <Globe size={24} />,
              title: '50+ Currencies',
              desc: 'Track your portfolio in your local currency. Support for USD, EUR, UAH, RUB, CNY, and many more.',
              gradient: 'from-profit/10 to-transparent',
            },
            {
              icon: <Smartphone size={24} />,
              title: 'Every Platform',
              desc: 'Price alerts. Portfolio tracking. Your skins in your pocket. Available on iOS, Android, Web, Desktop, and Chrome.',
              gradient: 'from-warning/10 to-transparent',
            },
            {
              icon: <Puzzle size={24} />,
              title: 'Chrome Extension',
              desc: 'Enhance every Steam page. Prices, floats, instant sell — right where you trade.',
              gradient: 'from-primary/10 to-transparent',
            },
            {
              icon: <Monitor size={24} />,
              title: 'Desktop App',
              desc: 'Storage units, bulk operations, and advanced analytics for serious collectors.',
              gradient: 'from-accent/10 to-transparent',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="group relative glass rounded-2xl p-6 hover:border-primary/20 transition-all duration-300 card-shine"
            >
              <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${f.gradient} opacity-0 group-hover:opacity-100 transition-opacity`} />
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-surface-light flex items-center justify-center text-primary mb-4 group-hover:scale-110 transition-transform">
                  {f.icon}
                </div>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── How It Works ──────────────────────────────────────────── */}
      <section className="px-6 lg:px-16 py-24 relative">
        <div className="absolute inset-0 gradient-mesh" />
        <div className="relative max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-5xl font-extrabold mb-4">
              Get started in <span className="text-gradient">3 simple steps</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Sign in with Steam',
                desc: 'Securely log in using your Steam account. No passwords stored — we use Steam OpenID.',
              },
              {
                step: '02',
                title: 'Sync your inventory',
                desc: 'Your items are automatically fetched with real-time prices from multiple sources.',
              },
              {
                step: '03',
                title: 'Track & profit',
                desc: 'Monitor your portfolio, set alerts, and make smart trading decisions with real data.',
              },
            ].map((item) => (
              <div key={item.step} className="relative text-center">
                <div className="text-6xl font-black text-primary/10 mb-4">{item.step}</div>
                <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ───────────────────────────────────────────────── */}
      <section id="pricing" className="px-6 lg:px-16 py-24 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-sm font-medium mb-4">
            <span className="text-muted">Simple Pricing</span>
          </div>
          <h2 className="text-3xl lg:text-5xl font-extrabold mb-4">
            Free to start. <span className="text-gradient">Upgrade for full power.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Free */}
          <div className="glass rounded-2xl p-8 relative">
            <h3 className="text-xl font-bold mb-1">Free</h3>
            <p className="text-4xl font-extrabold mb-1">$0</p>
            <p className="text-sm text-muted mb-6">Forever free</p>
            <ul className="space-y-3 text-sm mb-8">
              {[
                'Portfolio value tracking',
                'Inventory browsing',
                'Trade management',
                'Multi-account support',
                '5 price alerts',
                'Steam Market prices',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <Check size={16} className="text-profit shrink-0" />
                  <span className="text-muted">{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="block w-full text-center py-3 glass rounded-xl text-sm font-semibold hover:bg-surface-light transition-colors"
            >
              Get Started Free
            </Link>
          </div>

          {/* Pro */}
          <div className="relative glass rounded-2xl p-8 border-primary/30 glow-primary">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-primary to-accent text-white text-xs font-bold rounded-full">
              MOST POPULAR
            </div>
            <h3 className="text-xl font-bold mb-1">Pro</h3>
            <div className="flex items-baseline gap-2 mb-1">
              <p className="text-4xl font-extrabold">$4.99</p>
              <span className="text-muted text-sm">/month</span>
            </div>
            <p className="text-sm text-muted mb-6">or $34.99/year <span className="text-profit font-medium">(save 42%)</span></p>
            <ul className="space-y-3 text-sm mb-8">
              {[
                'Everything in Free',
                'P&L analytics & history',
                'Real market prices (Skinport, CSFloat)',
                'Bulk sell to Steam Market',
                '20 price alerts',
                'CSV export',
                'Push notifications',
                'Advanced charts',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <Check size={16} className="text-primary shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="block w-full text-center py-3 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-bold transition-all hover:shadow-lg hover:shadow-primary/25"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FAQ ───────────────────────────────────────────────────── */}
      <section id="faq" className="px-6 lg:px-16 py-24 max-w-3xl mx-auto">
        <h2 className="text-3xl lg:text-4xl font-extrabold text-center mb-12">
          Frequently Asked Questions
        </h2>
        <div className="space-y-4">
          {[
            {
              q: 'Is SkinKeeper safe to use?',
              a: 'Absolutely. We use Steam OpenID for authentication — we never see or store your Steam password. Your items remain in your Steam account at all times.',
            },
            {
              q: 'How do prices get updated?',
              a: 'We fetch prices from Steam Market, Skinport, and CSFloat every few minutes. Pro users get access to all price sources with priority updates.',
            },
            {
              q: 'Can I manage multiple Steam accounts?',
              a: 'Yes! Link as many Steam accounts as you want and switch between them instantly. See combined portfolio values or filter by account.',
            },
            {
              q: 'Is the app free?',
              a: 'Yes, the core app is completely free on iOS, Android, Web, and Desktop. The Chrome Extension is also free. Pro features are available via subscription.',
            },
            {
              q: 'What does the Chrome Extension do?',
              a: 'The SkinKeeper Chrome Extension enhances Steam directly in your browser. See real market prices, float values, and quick-trade buttons right on Steam inventory and market pages.',
            },
            {
              q: 'How does selling on Steam Market work?',
              a: 'After authenticating your Steam session, you can list items directly on the Steam Market from within the app. We handle the listing process and track your operations.',
            },
          ].map((faq) => (
            <details
              key={faq.q}
              className="group glass rounded-xl"
            >
              <summary className="flex items-center justify-between px-6 py-4 cursor-pointer text-sm font-semibold hover:text-primary transition-colors list-none">
                {faq.q}
                <ChevronRight size={16} className="text-muted group-open:rotate-90 transition-transform shrink-0 ml-4" />
              </summary>
              <p className="px-6 pb-4 text-sm text-muted leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ─── Final CTA ─────────────────────────────────────────────── */}
      <section className="px-6 lg:px-16 py-24 relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero" />
        <div className="relative max-w-3xl mx-auto text-center">
          <h2 className="text-3xl lg:text-5xl font-extrabold mb-4">
            Ready to take control of your <span className="text-gradient">CS2 inventory?</span>
          </h2>
          <p className="text-lg text-muted mb-8">
            One ecosystem. Every platform. Zero blind spots. Join thousands who track, trade, and profit with SkinKeeper.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/login"
              className="group px-8 py-4 bg-primary hover:bg-primary-hover text-white rounded-2xl text-base font-bold transition-all hover:shadow-xl hover:shadow-primary/25 active:scale-[0.98] flex items-center justify-center gap-2"
            >
              Get Started — It&apos;s Free
              <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
          {/* App Store badges */}
          <div className="flex flex-wrap items-center justify-center gap-4 mt-8">
            <a
              href="https://apps.apple.com/us/app/skinkeeper/id6760600231"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 glass rounded-xl text-sm font-medium hover:bg-surface-light transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
              App Store
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=store.skinkeeper.app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 glass rounded-xl text-sm font-medium hover:bg-surface-light transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.72c-.36-.18-.64-.46-.82-.82l-.02-.04C2.12 22.42 2 21.88 2 21.28V2.72c0-.6.12-1.14.34-1.58l9.92 9.92-9.08 12.66zm.74-22.38c.24-.22.56-.34.92-.34h.04c.24 0 .52.08.82.24L17.6 7.7 14.06 11.24 3.92 1.34zM21.54 10.88c.56.32.88.8.88 1.36 0 .56-.36 1.08-.88 1.36l-2.74 1.56-3.84-3.84 3.84-3.84 2.74 1.4zM17.6 16.3L5.7 22.76c-.3.16-.58.24-.82.24-.36 0-.68-.12-.92-.34L14.06 12.76 17.6 16.3z" /></svg>
              Google Play
            </a>
            <a
              href="https://chromewebstore.google.com/detail/skinkeeper-%E2%80%94-cs2-inventor/lbihgifhfhpeahokiegleeknffkihbpd"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 glass rounded-xl text-sm font-medium hover:bg-surface-light transition-colors"
            >
              <Puzzle size={20} />
              Chrome Extension
            </a>
            <a
              href="https://skinkeeper.store/download"
              className="inline-flex items-center gap-2 px-5 py-2.5 glass rounded-xl text-sm font-medium hover:bg-surface-light transition-colors"
            >
              <Monitor size={20} />
              Desktop App
            </a>
          </div>
        </div>
      </section>

      {/* ─── Footer ────────────────────────────────────────────────── */}
      <footer className="border-t border-border/50">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="text-lg font-bold text-gradient">SkinKeeper</span>
              </div>
              <p className="text-sm text-muted leading-relaxed">
                The ultimate CS2 inventory manager. Track, trade, and profit from your skins.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-sm">Product</h4>
              <ul className="space-y-2 text-sm text-muted">
                <li><a href="#features" className="hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a></li>
                <li><Link href="/portfolio" className="hover:text-foreground transition-colors">Portfolio</Link></li>
                <li><Link href="/inventory" className="hover:text-foreground transition-colors">Inventory</Link></li>
                <li><Link href="/market" className="hover:text-foreground transition-colors">Market</Link></li>
                <li><Link href="/deals" className="hover:text-foreground transition-colors">Deals</Link></li>
                <li><Link href="/watchlist" className="hover:text-foreground transition-colors">Watchlist</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-sm">Download</h4>
              <ul className="space-y-2 text-sm text-muted">
                <li><a href="https://apps.apple.com/us/app/skinkeeper/id6760600231" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">iOS App</a></li>
                <li><a href="https://play.google.com/store/apps/details?id=store.skinkeeper.app" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Android App</a></li>
                <li><a href="https://chromewebstore.google.com/detail/skinkeeper-%E2%80%94-cs2-inventor/lbihgifhfhpeahokiegleeknffkihbpd" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Chrome Extension</a></li>
                <li><a href="https://skinkeeper.store/download" className="hover:text-foreground transition-colors">Desktop App</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3 text-sm">Legal</h4>
              <ul className="space-y-2 text-sm text-muted">
                <li><a href="/legal/terms" className="hover:text-foreground transition-colors">Terms of Service</a></li>
                <li><a href="/legal/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border/50 text-center text-sm text-muted">
            <p>&copy; {new Date().getFullYear()} SkinKeeper. Not affiliated with Valve Corporation or Steam.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
