import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  LayoutDashboard,
  Backpack,
  ArrowLeftRight,
  TrendingUp,
  Shield,
  Zap,
} from 'lucide-react';

export default async function LandingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sk_token');
  if (token?.value) redirect('/portfolio');

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 lg:px-16 h-16 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-bold text-sm">
            SK
          </div>
          <span className="text-lg font-semibold">SkinKeeper</span>
        </div>
        <Link
          href="/login"
          className="px-5 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-sm font-medium transition-colors"
        >
          Sign in with Steam
        </Link>
      </nav>

      {/* Hero */}
      <section className="px-6 lg:px-16 py-24 lg:py-36 text-center max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
          <Zap size={14} />
          CS2 Inventory Manager
        </div>
        <h1 className="text-4xl lg:text-6xl font-bold leading-tight mb-6">
          Track, Trade & Profit<br />
          <span className="text-primary">from your CS2 skins</span>
        </h1>
        <p className="text-lg text-muted max-w-2xl mx-auto mb-10">
          Real-time portfolio tracking, P&L analytics, instant trades between accounts,
          price alerts, and market selling — all in one place.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/login"
            className="px-8 py-3 bg-primary hover:bg-primary-hover text-white rounded-xl text-base font-semibold transition-colors"
          >
            Get Started — Free
          </Link>
          <a
            href="#features"
            className="px-8 py-3 bg-surface-light hover:bg-border text-foreground rounded-xl text-base font-medium transition-colors"
          >
            See Features
          </a>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 lg:px-16 py-20 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">Everything you need</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: <LayoutDashboard size={24} />,
              title: 'Portfolio Dashboard',
              desc: 'Track total value, daily changes, and historical performance across all accounts.',
            },
            {
              icon: <TrendingUp size={24} />,
              title: 'P&L Analytics',
              desc: 'See profit/loss per item with cost basis from Steam Market transactions.',
            },
            {
              icon: <Backpack size={24} />,
              title: 'Inventory Management',
              desc: 'Browse, search, and filter your inventory. Compare prices across sources.',
            },
            {
              icon: <ArrowLeftRight size={24} />,
              title: 'Quick Trades',
              desc: 'Send trades to friends or transfer items between your own accounts instantly.',
            },
            {
              icon: <Shield size={24} />,
              title: 'Multi-Account',
              desc: 'Link multiple Steam accounts and manage them all from one dashboard.',
            },
            {
              icon: <Zap size={24} />,
              title: 'Price Alerts',
              desc: 'Set price targets and get notified when items hit your desired price.',
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-surface rounded-xl p-6 border border-border hover:border-primary/30 transition-colors"
            >
              <div className="text-primary mb-4">{f.icon}</div>
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="px-6 lg:px-16 py-20 max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-4">Simple pricing</h2>
        <p className="text-muted text-center mb-12">Free to start. Upgrade for full power.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-surface rounded-xl p-8 border border-border">
            <h3 className="text-xl font-semibold mb-2">Free</h3>
            <p className="text-3xl font-bold mb-4">$0</p>
            <ul className="space-y-2 text-sm text-muted">
              <li>Portfolio value tracking</li>
              <li>Inventory browsing</li>
              <li>Trade management</li>
              <li>Multi-account support</li>
              <li>5 price alerts</li>
            </ul>
          </div>
          <div className="bg-surface rounded-xl p-8 border border-primary/50 relative">
            <div className="absolute -top-3 right-6 px-3 py-0.5 bg-primary text-white text-xs font-semibold rounded-full">
              PRO
            </div>
            <h3 className="text-xl font-semibold mb-2">Pro</h3>
            <div className="flex items-baseline gap-2 mb-1">
              <p className="text-3xl font-bold">$4.99</p>
              <span className="text-muted text-sm">/month</span>
            </div>
            <p className="text-sm text-muted mb-4">or $34.99/year (-50%)</p>
            <ul className="space-y-2 text-sm text-muted">
              <li>Everything in Free</li>
              <li>P&L analytics & history</li>
              <li>Bulk sell to market</li>
              <li>20 price alerts</li>
              <li>CSV export</li>
              <li>Advanced charts</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 lg:px-16 py-8 border-t border-border text-center text-sm text-muted">
        <p>&copy; {new Date().getFullYear()} SkinKeeper. Not affiliated with Valve or Steam.</p>
      </footer>
    </div>
  );
}
