'use client';

import { useHasSession } from '@/lib/hooks';
import { Puzzle, Monitor, ExternalLink } from 'lucide-react';

const EXTENSION_URL =
  'https://chromewebstore.google.com/detail/skinkeeper-%E2%80%94-cs2-inventor/lbihgifhfhpeahokiegleeknffkihbpd';

interface ExtensionGateProps {
  children: React.ReactNode;
}

/**
 * Wraps page content with a Steam session check.
 * If no valid session — blurs the content and shows ecosystem CTAs.
 */
export function ExtensionGate({ children }: ExtensionGateProps) {
  const hasSession = useHasSession();

  // Still loading or session valid — render children normally
  if (hasSession === undefined || hasSession) return <>{children}</>;

  return (
    <div className="relative min-h-[60vh]">
      {/* Blurred content underneath */}
      <div className="pointer-events-none select-none blur-[6px] opacity-50">
        {children}
      </div>

      {/* Overlay CTA */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="glass-strong rounded-2xl border border-border/50 p-8 text-center max-w-md mx-4 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Puzzle size={28} className="text-primary" />
          </div>
          <h3 className="text-base font-bold mb-2">Connect Steam Session</h3>
          <p className="text-sm text-muted mb-6">
            To use this section, connect your Steam session via the browser extension or desktop app.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href={EXTENSION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 transition-all"
            >
              <Puzzle size={16} />
              Install Extension
              <ExternalLink size={12} className="opacity-60" />
            </a>
            <a
              href="/download"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 glass rounded-xl text-sm font-semibold border border-border/50 hover:bg-surface-light/50 transition-all"
            >
              <Monitor size={16} />
              Desktop App
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
