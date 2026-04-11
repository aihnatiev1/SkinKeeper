'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRightToLine, Loader2, CheckCircle2, X } from 'lucide-react';
import { useTransferStore } from '@/lib/transfer-store';
import { useUIStore } from '@/lib/store';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export function GlobalTransferBar() {
  const { isTransferring, progress } = useTransferStore();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const [doneVisible, setDoneVisible] = useState(false);
  const [lastResult, setLastResult] = useState<{ moved: number; total: number } | null>(null);

  // When transfer completes, show "done" state briefly
  useEffect(() => {
    if (!isTransferring && progress && progress.current > 0) {
      setLastResult({ moved: progress.current, total: progress.total });
      setDoneVisible(true);
      const t = setTimeout(() => setDoneVisible(false), 5000);
      return () => clearTimeout(t);
    }
  }, [isTransferring]);

  const pct = progress && progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  const eta = progress && progress.total > progress.current
    ? progress.total - progress.current
    : 0;

  const visible = isTransferring || doneVisible;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed bottom-4 z-50 transition-[left] duration-300"
          style={{ left: sidebarOpen ? 256 : 84, right: 16 }}
        >
          <div className={`
            flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl
            ${isTransferring
              ? 'bg-surface/90 border-primary/20 shadow-primary/10'
              : 'bg-profit/10 border-profit/20 shadow-profit/10'}
          `}>
            {/* Icon */}
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              isTransferring ? 'bg-primary/10' : 'bg-profit/10'
            }`}>
              {isTransferring
                ? <ArrowRightToLine size={16} className="text-primary" />
                : <CheckCircle2 size={16} className="text-profit" />}
            </div>

            {/* Text + bar */}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                {isTransferring && (
                  <Loader2 size={12} className="animate-spin text-primary shrink-0" />
                )}
                <span className="text-sm font-semibold truncate">
                  {isTransferring
                    ? `Transferring items — ${progress?.current ?? 0} / ${progress?.total ?? 0}`
                    : `Transfer complete — ${lastResult?.moved} items moved`}
                </span>
                {isTransferring && eta > 0 && (
                  <span className="text-xs text-muted ml-auto shrink-0">~{eta}s left</span>
                )}
                {!isTransferring && (
                  <button
                    onClick={() => setDoneVisible(false)}
                    className="ml-auto text-muted hover:text-foreground transition-colors shrink-0"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {isTransferring && (
                <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                  />
                </div>
              )}
              {!isTransferring && doneVisible && (
                <div className="h-1.5 bg-profit/20 rounded-full overflow-hidden">
                  <div className="h-full w-full bg-profit rounded-full" />
                </div>
              )}
            </div>

            {/* Link to Transfer */}
            <Link
              href="/transfer"
              className="shrink-0 text-xs text-muted hover:text-foreground transition-colors whitespace-nowrap"
            >
              View →
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
