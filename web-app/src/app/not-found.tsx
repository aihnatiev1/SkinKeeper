import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative">
      <div className="absolute inset-0 gradient-hero" />
      <div className="absolute inset-0 dot-pattern opacity-20" />

      <div className="relative z-10 text-center max-w-md">
        <div className="text-3xl font-bold text-gradient mx-auto mb-6">
          SkinKeeper
        </div>
        <h1 className="text-6xl font-bold mb-2">404</h1>
        <p className="text-lg text-muted mb-8">Page not found</p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/portfolio"
            className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all hover:shadow-lg hover:shadow-primary/25"
          >
            Go to Dashboard
          </Link>
          <Link
            href="/"
            className="px-6 py-2.5 glass rounded-xl text-sm font-semibold hover:bg-surface-light transition-colors"
          >
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
