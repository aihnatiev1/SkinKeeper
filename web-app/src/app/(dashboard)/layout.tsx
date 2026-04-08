'use client';

import { useEffect } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Onboarding } from '@/components/onboarding';
import { CurrencySelectModal } from '@/components/currency-select-modal';
import { InitialSync } from '@/components/initial-sync';
import { CommandPalette } from '@/components/command-palette';
import { useUIStore } from '@/lib/store';
import { useMe } from '@/lib/hooks';
import { api } from '@/lib/api';
import { PageLoader } from '@/components/loading';

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
  if (error) return null;

  return (
    <div className="min-h-screen gradient-mesh">
      <Onboarding />
      <CurrencySelectModal />
      <InitialSync />
      <CommandPalette />
      <Sidebar />
      <main
        className="transition-all duration-300 min-h-screen pt-14 lg:pt-0"
        style={{ marginLeft: 0 }}
      >
        <div className="hidden lg:block" />
        <div
          className="transition-[margin-left] duration-300"
          style={{}}
        >
          {/* Responsive margin: 0 on mobile, sidebar width on desktop */}
          <div
            className="hidden lg:contents"
          >
            <style>{`
              @media (min-width: 1024px) {
                [data-dashboard-content] { margin-left: ${sidebarOpen ? 240 : 72}px; }
              }
            `}</style>
          </div>
          <div data-dashboard-content="">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
