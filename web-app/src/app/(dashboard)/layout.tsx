'use client';

import { Sidebar } from '@/components/sidebar';
import { Onboarding } from '@/components/onboarding';
import { InitialSync } from '@/components/initial-sync';
import { CommandPalette } from '@/components/command-palette';
import { useUIStore } from '@/lib/store';
import { useMe } from '@/lib/hooks';
import { PageLoader } from '@/components/loading';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const { isLoading, error } = useMe();

  if (isLoading) return <PageLoader />;
  if (error) return null;

  return (
    <div className="min-h-screen gradient-mesh">
      <Onboarding />
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
