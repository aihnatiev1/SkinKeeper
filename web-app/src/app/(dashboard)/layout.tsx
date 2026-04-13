'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Onboarding } from '@/components/onboarding';
import { CurrencySelectModal } from '@/components/currency-select-modal';
import { InitialSync } from '@/components/initial-sync';
import { CommandPalette } from '@/components/command-palette';
import { useUIStore } from '@/lib/store';
import { useMe } from '@/lib/hooks';
import { api } from '@/lib/api';
import { PageLoader } from '@/components/loading';
import { GlobalTransferBar } from '@/components/global-transfer-bar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setExchangeRates = useUIStore((s) => s.setExchangeRates);
  const { isLoading, error } = useMe();

  // Fetch exchange rates on mount
  useEffect(() => {
    api.get<{ rates: Record<string, number> }>('/market/exchange-rates')
      .then((data) => { if (data.rates) setExchangeRates(data.rates); })
      .catch(() => {});
  }, [setExchangeRates]);

  if (isLoading) return <PageLoader />;
  if (error) return (
    <div className="min-h-screen flex items-center justify-center px-4 gradient-mesh">
      <div className="text-center max-w-sm">
        <h2 className="text-xl font-bold mb-2">Session expired</h2>
        <p className="text-sm text-muted mb-6">Please sign in again to continue.</p>
        <Link
          href="/login"
          className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-semibold transition-all"
        >
          Sign In
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen gradient-mesh">
      <Onboarding />
      <CurrencySelectModal />
      <InitialSync />
      <CommandPalette />
      <GlobalTransferBar />
      <Sidebar />
      <main
        className="transition-all duration-300 min-h-screen pt-14 lg:pt-0"
      >
        <div
          className="transition-[margin-left] duration-300 lg:ml-[var(--sidebar-w)]"
          style={{ '--sidebar-w': sidebarOpen ? '240px' : '72px' } as React.CSSProperties}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
