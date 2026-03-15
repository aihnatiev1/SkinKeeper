'use client';

import { Sidebar } from '@/components/sidebar';
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
  if (error) return null; // middleware will redirect

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main
        className="transition-all duration-200"
        style={{ marginLeft: sidebarOpen ? 240 : 72 }}
      >
        {children}
      </main>
    </div>
  );
}
