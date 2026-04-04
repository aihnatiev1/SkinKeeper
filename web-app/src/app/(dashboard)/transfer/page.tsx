'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Wand2, ArrowLeftRight } from 'lucide-react';
import { Header } from '@/components/header';
import { useIsDesktop, useSteamStatus } from '@/lib/use-desktop';
import { useTransferStore, type TransferTab } from '@/lib/transfer-store';
import { cn } from '@/lib/utils';
import { ToStorageTab } from './components/to-storage-tab';
import { FromStorageTab } from './components/from-storage-tab';
import { BetweenTab } from './components/between-tab';
import { AutomaticTab } from './components/automatic-tab';

const TABS: { id: TransferTab; label: string; icon: typeof ArrowDown; soon?: boolean }[] = [
  { id: 'to', label: 'To Storage', icon: ArrowDown },
  { id: 'from', label: 'From Storage', icon: ArrowUp },
  { id: 'automatic', label: 'Automatic', icon: Wand2 },
  { id: 'between', label: 'Between', icon: ArrowLeftRight },
];

export default function TransferPage() {
  const router = useRouter();
  const desktop = useIsDesktop();
  const { status } = useSteamStatus();
  const { activeTab, setActiveTab } = useTransferStore();

  useEffect(() => {
    if (desktop === false) {
      router.replace('/portfolio');
    }
  }, [desktop, router]);

  if (!desktop) return null;

  if (!status.loggedIn) {
    return (
      <div>
        <Header title="Transfer" />
        <div className="p-4 lg:p-6">
          <div className="glass rounded-xl p-12 border border-border/50 text-center">
            <ArrowLeftRight size={40} className="mx-auto mb-4 text-muted" />
            <h3 className="text-lg font-semibold mb-2">Steam not connected</h3>
            <p className="text-sm text-muted">
              Connect to Steam via the desktop client to manage storage units.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header title="Transfer" />
      <div className="p-4 lg:p-6 space-y-4">
        {/* Tab bar */}
        <div className="flex items-center gap-1 p-1 glass rounded-xl border border-border/50 w-fit">
          {TABS.map(({ id, label, icon: Icon, soon }) => (
            <button
              key={id}
              onClick={() => !soon && setActiveTab(id)}
              disabled={soon}
              className={cn(
                'relative flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === id
                  ? 'text-white'
                  : soon
                    ? 'text-muted/50 cursor-not-allowed'
                    : 'text-muted hover:text-foreground'
              )}
            >
              {activeTab === id && (
                <motion.div
                  layoutId="transfer-tab"
                  className="absolute inset-0 bg-primary rounded-lg"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                <Icon size={16} />
                {label}
                {soon && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-light text-muted">
                    Soon
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'to' && <ToStorageTab />}
          {activeTab === 'from' && <FromStorageTab />}
          {activeTab === 'automatic' && <AutomaticTab />}
          {activeTab === 'between' && <BetweenTab />}
        </motion.div>
      </div>
    </div>
  );
}
