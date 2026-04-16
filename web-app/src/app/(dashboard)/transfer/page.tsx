'use client';

import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Wand2, ArrowLeftRight } from 'lucide-react';
import { Header } from '@/components/header';
import { ExtensionGate } from '@/components/extension-gate';
import { useIsDesktop, useSteamStatus } from '@/lib/use-desktop';
import { useTransferStore, type TransferTab } from '@/lib/transfer-store';
import { Loader2 } from 'lucide-react';
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
  const desktop = useIsDesktop();
  const { status } = useSteamStatus();
  const { activeTab, setActiveTab, isTransferring, progress } = useTransferStore();

  // On web (non-desktop): show the gate with extension/desktop CTA
  if (!desktop) {
    return (
      <ExtensionGate>
        <div>
          <Header title="Transfer" />
          <div className="p-4 lg:p-6 space-y-4">
            <div className="flex items-center gap-1 p-1 glass rounded-xl border border-border/50 w-fit">
              {TABS.map(({ id, label, icon: Icon }) => (
                <div key={id} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-muted">
                  <Icon size={16} />{label}
                </div>
              ))}
            </div>
            <div className="glass rounded-xl border border-border/50 p-12" />
          </div>
        </div>
      </ExtensionGate>
    );
  }

  if (!status.loggedIn) {
    return (
      <ExtensionGate>
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
      </ExtensionGate>
    );
  }

  return (
    <div>
      <Header title="Transfer" />
      <div className="p-4 lg:p-6 space-y-4">
        {/* Transfer progress bar */}
        {isTransferring && progress && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-xl border border-primary/20 p-3 space-y-2"
          >
            <div className="flex items-center gap-2 text-sm">
              <Loader2 size={14} className="animate-spin text-primary" />
              <span className="font-medium">Moving items... {progress.current} / {progress.total}</span>
              {progress.total > progress.current && (
                <span className="text-xs text-muted ml-auto">~{progress.total - progress.current}s left</span>
              )}
            </div>
            <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                animate={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </motion.div>
        )}

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
