'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface EcosystemTipProps {
  id: string;
  icon: string;
  message: string;
  ctaText: string;
  ctaUrl: string;
}

export function EcosystemTip({ id, icon, message, ctaText, ctaUrl }: EcosystemTipProps) {
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    const key = `sk-tip-dismissed-${id}`;
    setDismissed(localStorage.getItem(key) === '1');
  }, [id]);

  const handleDismiss = () => {
    localStorage.setItem(`sk-tip-dismissed-${id}`, '1');
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 glass rounded-xl border border-border/30 text-sm">
      <span className="text-base shrink-0">{icon}</span>
      <span className="text-muted flex-1">{message}</span>
      <a
        href={ctaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
      >
        {ctaText}
      </a>
      <button
        onClick={handleDismiss}
        className="shrink-0 p-1 rounded-md text-muted hover:text-foreground hover:bg-surface-light/50 transition-colors"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
