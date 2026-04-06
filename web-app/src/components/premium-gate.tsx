'use client';

import { useAuthStore } from '@/lib/store';
import { Crown } from 'lucide-react';
import Link from 'next/link';

interface PremiumGateProps {
  children: React.ReactNode;
  feature?: string;
  inline?: boolean;
}

/**
 * Wraps children with a premium check.
 * If user is not premium, shows an upgrade prompt instead of children.
 * `inline` renders a small badge instead of a full card.
 */
export function PremiumGate({ children, feature, inline }: PremiumGateProps) {
  const user = useAuthStore((s) => s.user);

  if (user?.is_premium) return <>{children}</>;

  if (inline) {
    return (
      <Link
        href="/settings#premium"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-warning/10 text-warning rounded-lg text-xs font-semibold hover:bg-warning/20 transition-colors"
      >
        <Crown size={12} />
        PRO
      </Link>
    );
  }

  return (
    <div className="glass rounded-xl p-6 text-center border border-warning/20">
      <Crown size={28} className="text-warning mx-auto mb-3" />
      <h3 className="text-sm font-bold mb-1">
        {feature ? `${feature} is a PRO feature` : 'PRO feature'}
      </h3>
      <p className="text-xs text-muted mb-4">
        Upgrade to SkinKeeper PRO to unlock this and more.
      </p>
      <Link
        href="/settings#premium"
        className="inline-flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-warning to-orange-500 text-white rounded-xl text-sm font-semibold hover:shadow-lg hover:shadow-warning/25 transition-all"
      >
        <Crown size={14} />
        Upgrade to PRO
      </Link>
    </div>
  );
}

/**
 * Small badge to indicate a premium feature.
 * Links to settings upgrade section.
 */
export function ProBadge() {
  return (
    <Link
      href="/settings#premium"
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-warning/15 text-warning rounded text-[10px] font-bold hover:bg-warning/25 transition-colors"
      title="PRO feature"
    >
      <Crown size={9} />
      PRO
    </Link>
  );
}
