'use client';

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

interface TransferProgressProps {
  current: number;
  total: number;
  currentItem?: string;
}

export function TransferProgress({ current, total, currentItem }: TransferProgressProps) {
  const pct = total > 0 ? (current / total) * 100 : 0;
  const eta = total > current ? (total - current) : 0; // ~1s per item

  return (
    <div className="glass rounded-xl p-4 border border-primary/20 space-y-3">
      <div className="flex items-center gap-2">
        <Loader2 size={16} className="animate-spin text-primary" />
        <span className="text-sm font-medium">
          Moving items... {current} / {total}
        </span>
        {eta > 0 && (
          <span className="text-xs text-muted ml-auto">~{eta}s remaining</span>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-surface-light rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      {currentItem && (
        <p className="text-xs text-muted truncate">{currentItem}</p>
      )}
    </div>
  );
}
