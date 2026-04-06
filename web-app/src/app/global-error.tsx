'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased bg-background text-foreground">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white font-bold text-xl mx-auto mb-6">
              SK
            </div>
            <h1 className="text-2xl font-bold mb-2">Critical Error</h1>
            <p className="text-sm text-neutral-400 mb-6">
              Something went seriously wrong. Please refresh the page.
            </p>
            <button
              onClick={reset}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition-all"
            >
              Refresh
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
